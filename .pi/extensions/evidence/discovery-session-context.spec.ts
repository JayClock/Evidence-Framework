import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { ContextEvent } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DISCOVERY_CONTEXT_TYPE,
  projectDiscoveryMessages,
} from './adapters/pi/session-context.ts';
import { DISCOVERY_GUIDE_PATH } from './discovery-prompt.ts';
import {
  DISCOVERY_PACKET_LIMIT,
  discoveryDetailsPath,
} from './discovery-context.ts';
import { qualityHarness } from './quality-test-support.ts';
import { contractContent } from './discovery-test-support.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
  writeTextAtomic,
} from './storage.ts';

type Message = ContextEvent['messages'][number];
const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const user = (text: string): Message => ({
  role: 'user',
  content: [{ type: 'text', text }],
  timestamp: 0,
});
const assistant = (id: string): Message => ({
  role: 'assistant',
  content: [
    { type: 'toolCall', id, name: 'read', arguments: { path: 'current.json' } },
  ],
  api: 'anthropic-messages',
  provider: 'anthropic',
  model: 'test',
  usage,
  stopReason: 'toolUse',
  timestamp: 0,
});
const result = (id: string): Message => ({
  role: 'toolResult',
  toolCallId: id,
  toolName: 'read',
  content: [{ type: 'text', text: '旧轮次完整视图内容'.repeat(1000) }],
  isError: false,
  timestamp: 0,
});
function marker(
  revision: number,
  runId = 'run',
  task: string | null = null,
): Message {
  return {
    role: 'custom',
    customType: DISCOVERY_CONTEXT_TYPE,
    content: `当前理解 ${revision}`,
    display: false,
    timestamp: 0,
    details: {
      runId,
      revision,
      promptDigest:
        task === null ? null : createHash('sha256').update(task).digest('hex'),
    },
  };
}
function round(revision: number): Message[] {
  const text = `本轮任务包 ${revision}`;
  return [
    user(text),
    marker(revision, 'run', text),
    assistant(`call-${revision}`),
    result(`call-${revision}`),
  ];
}
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('request-local discovery history projection', () => {
  it('keeps one managed generation after 1000 rounds without deleting the original transcript', () => {
    const original = [
      user('真实用户业务叙述'),
      ...Array.from({ length: 1000 }, (_, i) => round(i)).flat(),
    ];
    const before = JSON.stringify(original);
    const projected = projectDiscoveryMessages(original, 'run');
    expect(projected).toEqual([original[0], ...original.slice(-4)]);
    expect(JSON.stringify(projected).length).toBeLessThan(15000);
    expect(JSON.stringify(original)).toBe(before);
    expect(original).toHaveLength(4001);
  });

  it('preserves genuine user messages, unrelated replies, other runs/extensions and compacted summaries', () => {
    const human = user('不要误删这条人工补充');
    const unrelated = {
      role: 'custom',
      customType: 'other-extension',
      content: '其他工具指令',
      display: false,
      timestamp: 0,
    } as const;
    const summary: Message = {
      role: 'compactionSummary',
      summary: '压缩摘要',
      tokensBefore: 10000,
      timestamp: 0,
    };
    const otherRun = marker(1, 'different-run');
    const messages = [
      summary,
      ...round(0),
      human,
      assistant('human-call'),
      result('human-call'),
      unrelated,
      otherRun,
      ...round(1),
    ];
    expect(projectDiscoveryMessages(messages, 'run')).toEqual([
      summary,
      human,
      assistant('human-call'),
      result('human-call'),
      unrelated,
      otherRun,
      ...round(1),
    ]);
    expect(projectDiscoveryMessages(messages, 'no-such-run')).toBe(messages);
  });

  it('pairs its own kickoff across other hooks without removing their custom messages', () => {
    const old = round(0);
    const other: Message = {
      role: 'custom',
      customType: 'another-hook',
      content: '必须保留',
      display: false,
      timestamp: 0,
    };
    const messages = [old[0], other, ...old.slice(1), ...round(1)];
    expect(projectDiscoveryMessages(messages, 'run')).toEqual([
      other,
      ...round(1),
    ]);
  });

  it('never drops half a tool exchange at an interruption or foreign-message boundary', () => {
    const broken = [
      user('本轮任务包 0'),
      marker(0, 'run', '本轮任务包 0'),
      assistant('cross-boundary'),
      user('真实中断'),
      result('cross-boundary'),
      ...round(1),
    ];
    expect(projectDiscoveryMessages(broken, 'run')).toEqual(broken);
    const orphan = [marker(0), result('unseen-call'), ...round(1)];
    expect(projectDiscoveryMessages(orphan, 'run')).toEqual(orphan);
  });

  it('does not mistake copied kickoff-looking human input for an extension-generated task', () => {
    const actualHuman = user('本轮任务包 0');
    const messages = [
      actualHuman,
      marker(0),
      assistant('old'),
      result('old'),
      ...round(1),
    ];
    expect(projectDiscoveryMessages(messages, 'run')).toEqual([
      actualHuman,
      ...round(1),
    ]);
    const noMarkers = [actualHuman, assistant('old'), result('old')];
    expect(projectDiscoveryMessages(noMarkers, 'run')).toBe(noMarkers);
  });
});

async function integration() {
  const h = await qualityHarness(roots);
  const state = createInitialState('test', '启动和恢复上下文');
  state.status = 'running';
  state.execution = (await loadState(h.root))!.execution;
  await saveState(h.root, state);
  await h.saveDiscovery({ expectedRevision: 0, content: contractContent() });
  return { ...h, state };
}
type StartResult = {
  systemPrompt: string;
  message: {
    customType: string;
    content: string;
    display: boolean;
    details: { runId: string; revision: number; promptDigest: string | null };
  };
};
async function before(
  h: Awaited<ReturnType<typeof integration>>,
  prompt: string,
): Promise<StartResult> {
  return (await h.events.get('before_agent_start')!(
    { systemPrompt: 'BASE', prompt },
    h.ctx,
  )) as StartResult;
}

describe('discovery context hook integration', () => {
  it('keeps methods in system context, stamps only the queued kickoff, and projects old rounds through the registered context hook', async () => {
    const h = await integration();
    const state = (await loadState(h.root))!;
    state.status = 'ready';
    await saveState(h.root, state);
    await h.command('evidence-run');
    const prompt = h.api.sendUserMessage.mock.lastCall![0] as string;
    const first = await before(h, prompt);
    const guide = (await readText(h.root, DISCOVERY_GUIDE_PATH)).trim();
    expect(first.systemPrompt.split(guide)).toHaveLength(2);
    expect(prompt).not.toContain(guide);
    expect(prompt.length).toBeLessThanOrEqual(DISCOVERY_PACKET_LIMIT);
    expect(first.message.details.promptDigest).not.toBeNull();
    const raw: Message[] = [
      user(prompt),
      { role: 'custom', ...first.message, timestamp: 0 },
      assistant('old'),
      result('old'),
    ];
    // A direct user continuation gets a fresh bounded packet, never a deletion stamp.
    const resumed = await before(h, '继续核对');
    expect(resumed.systemPrompt).toBe(first.systemPrompt);
    expect(resumed.message.details.promptDigest).toBeNull();
    expect(resumed.message.content).toContain('当前展开：支付分成');
    expect(resumed.message.content.length).toBeLessThanOrEqual(
      DISCOVERY_PACKET_LIMIT,
    );
    raw.push(user('继续核对'), {
      role: 'custom',
      ...resumed.message,
      timestamp: 0,
    });
    const output = (await h.events.get('context')!(
      { messages: raw },
      h.ctx,
    )) as { messages: Message[] };
    expect(output.messages).toEqual(raw.slice(-2));
    expect(raw).toHaveLength(6);
  });

  it('rebuilds a bounded recovery packet and policy after session recovery or compaction without trusting cache or changing journal', async () => {
    const h = await integration();
    const state = (await loadState(h.root))!;
    const journal = await readText(h.root, state.discovery.path!);
    await writeTextAtomic(
      h.root,
      discoveryDetailsPath(state),
      'fake approved cache',
    );
    await h.events.get('session_start')!({}, h.ctx);
    await h.command('evidence-run');
    const kickoff = await before(
      h,
      h.api.sendUserMessage.mock.lastCall![0] as string,
    );
    expect(kickoff.message.details.promptDigest).not.toBeNull();
    const recoveredState = await readText(h.root, '.evidence/state.json');
    const recovered = await before(h, '压缩之后继续');
    expect(recovered.message.details.promptDigest).toBeNull();
    expect(recovered.message.content).toContain('当前展开：支付分成');
    expect(recovered.message.content).not.toContain('fake approved cache');
    expect(recovered.systemPrompt).toContain('Confirmation 不默认是人工审批');
    expect(await readText(h.root, '.evidence/state.json')).toBe(recoveredState);
    expect(await readText(h.root, state.discovery.path!)).toBe(journal);
    expect(await readText(h.root, discoveryDetailsPath(state))).not.toContain(
      'fake approved cache',
    );
  });

  it('does not inject discovery policy into paused or formal tasks and does not revive old discovery history in later phases', async () => {
    const h = await integration();
    const state = (await loadState(h.root))!;
    state.paused = true;
    await saveState(h.root, state);
    expect(await before(h, '一般问题')).toBeUndefined();
    state.paused = false;
    state.discovery.stage = 'finalizing';
    await saveState(h.root, state);
    const formal = await before(h, '定稿');
    expect(formal.systemPrompt).not.toContain('发现方法与工具边界');
    expect(formal.message).toBeUndefined();
    const messages = [
      marker(0, state.runId),
      assistant('old'),
      result('old'),
      marker(1, state.runId),
      user('正式工件任务'),
      assistant('formal'),
      result('formal'),
    ];
    const output = (await h.events.get('context')!({ messages }, h.ctx)) as {
      messages: Message[];
    };
    expect(output.messages).toEqual(messages.slice(3));
  });
});
