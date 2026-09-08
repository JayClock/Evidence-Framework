import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DISCOVERY_PACKET_LIMIT,
  prepareDiscoveryContext,
  type ReadRange,
} from './discovery-context.ts';
import { renderDiscoveryPrompt } from './discovery-prompt.ts';
import { emptyDiscovery } from './discovery-ledger.ts';
import { contractContent } from './discovery-test-support.ts';
import type { DiscoveryEntry, DiscoverySnapshot } from './discovery-schema.ts';
import { createInitialState, readText } from './storage.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'discovery-context-'));
  roots.push(root);
  const state = createInitialState('test', '有界发现上下文');
  const snapshot = emptyDiscovery(state.runId);
  snapshot.content = contractContent();
  snapshot.revision = state.discovery.revision = 1;
  snapshot.content.candidates.forEach((candidate, i) => {
    snapshot.recordHeads[`candidate:${candidate.id}`] =
      `D-001-${String(i + 1).padStart(3, '0')}`;
  });
  return {
    root,
    state,
    snapshot,
    packet: async (entries: DiscoveryEntry[] = []) => {
      const context = await prepareDiscoveryContext(
        root,
        state,
        snapshot,
        entries,
      );
      return {
        context,
        prompt: renderDiscoveryPrompt(state, snapshot, context),
        lines: (await readText(root, context.detailsPath)).split('\n'),
      };
    },
  };
}
function jsonAt(lines: string[], range: ReadRange) {
  return JSON.parse(
    lines.slice(range.offset - 1, range.offset - 1 + range.limit).join('\n'),
  );
}
function answer(
  snapshot: DiscoverySnapshot,
  revision: number,
  questionId: string,
  text: string,
  supersedes: string | null = null,
): DiscoveryEntry {
  if (!snapshot.questions.some((q) => q.id === questionId))
    snapshot.questions.push({
      id: questionId,
      focus: 'evidence',
      target: { contractRef: 'C-001', fulfillmentRef: 'C-005' },
      prompt: `问题 ${questionId}`,
      impact: '证明付款',
      blocking: true,
      sourceRefs: ['INPUT'],
    });
  const value = {
    id: `A-${String(revision).padStart(3, '0')}`,
    questionId,
    text,
    respondent: 'github.com/test',
    status: 'answered' as const,
    recordedAt: '2026-01-01T00:00:00.000Z',
  };
  snapshot.answers.push(value);
  return {
    version: 4,
    runId: snapshot.runId,
    revision,
    previousDigest: null,
    recordedAt: value.recordedAt,
    event: { kind: 'answer', answer: value, supersedes },
  };
}

describe('bounded discovery data packets (not an LLM behavior evaluation)', () => {
  it('provides exact lossless object ranges, current record heads and a pageable catalog', async () => {
    const h = await setup();
    h.snapshot.content!.candidates[0].description =
      '第一行\n第二行：引号 " 与 emoji 😀'.repeat(100);
    h.snapshot.content!.notes = '很长的说明😀\n'.repeat(1000);
    const { context, lines } = await h.packet();
    expect(jsonAt(lines, context.ranges.get('candidate:C-001')!)).toMatchObject(
      {
        recordRef: 'D-001-001',
        stale: false,
        value: h.snapshot.content!.candidates[0],
      },
    );
    for (const item of jsonAt(lines, context.catalog))
      expect(() =>
        jsonAt(lines, { path: context.detailsPath, ...item }),
      ).not.toThrow();
    expect(
      jsonAt(lines, context.ranges.get('notes')!).textChunks.join(''),
    ).toBe(h.snapshot.content!.notes);
  });

  it('does not repeat consumed answers and carries the latest correction, status and superseded A-ID', async () => {
    const h = await setup();
    const old = answer(h.snapshot, 2, 'Q-001', '旧回答不应重放');
    const saved: DiscoveryEntry = {
      ...old,
      revision: 3,
      event: {
        kind: 'discovery',
        submission: { summary: '已经消化', sourceRefs: ['A-002'], records: [] },
        sourceHashes: {},
      },
    };
    const correction = answer(
      h.snapshot,
      4,
      'Q-001',
      '更正：提供银行回单',
      'A-002',
    );
    h.snapshot.answers.at(-1)!.status = 'unknown';
    const { prompt, context } = await h.packet([old, saved, correction]);
    expect(context.pending).toEqual([correction]);
    expect(prompt).not.toContain('旧回答不应重放');
    expect(prompt).toContain('更正：提供银行回单');
    expect(prompt).toContain('"supersedes":"A-002"');
    expect(prompt).toContain('"status":"unknown"');
    const consolidated = { ...saved, revision: 5 };
    expect(
      (await h.packet([old, saved, correction, consolidated])).context.pending,
    ).toEqual([]);
  });

  it('does not silently lose overflow answers or multi-line human input', async () => {
    const h = await setup();
    const entries = Array.from({ length: 20 }, (_, i) =>
      answer(
        h.snapshot,
        i + 2,
        `Q-${String(i + 1).padStart(3, '0')}`,
        `${i}：完整人工原文\n`.repeat(400).slice(0, 4000),
      ),
    );
    const { context, prompt, lines } = await h.packet(entries);
    expect(prompt.length).toBeLessThanOrEqual(DISCOVERY_PACKET_LIMIT);
    expect(prompt).toContain('必须读取全部遗漏新输入后再保存');
    for (const entry of entries) {
      const range = context.ranges.get(`input:${entry.revision}`)!;
      expect(jsonAt(lines, range).event).toEqual(entry.event);
      expect(range.offset).toBeGreaterThanOrEqual(context.pendingRange.offset);
      expect(range.offset + range.limit).toBeLessThanOrEqual(
        context.pendingRange.offset + context.pendingRange.limit,
      );
    }
  });

  it('remains bounded with large candidates, histories, gaps, notes and feedback; preserves full details', async () => {
    const h = await setup();
    const content = h.snapshot.content!;
    content.scope = '范围'.repeat(2000);
    content.excludedScope = '排除'.repeat(2000);
    h.state.feedback = '必须处理的完整反馈'.repeat(3000);
    content.candidates = Array.from({ length: 200 }, (_, i) => ({
      ...content.candidates[i % 6],
      id: `C-${String(i + 1).padStart(3, '0')}`,
      description: '已知与未知说明'.repeat(600).slice(0, 4000),
    }));
    content.cases = Array.from({ length: 100 }, (_, i) => ({
      ...content.cases[i % 3],
      id: `CASE-${String(i + 1).padStart(3, '0')}`,
      gap: '未解决的回放缺口'.repeat(600).slice(0, 4000),
    }));
    for (const item of content.contractView.contracts[0].fulfillments) {
      item.request = '请求依据'.repeat(1000);
      item.confirmation = '仅知凭证，提供方待核实'.repeat(400).slice(0, 4000);
      item.deadline = '未知期限依据'.repeat(600).slice(0, 4000);
    }
    const entries = Array.from({ length: 300 }, (_, i) =>
      answer(
        h.snapshot,
        i + 2,
        `Q-${String(i + 1).padStart(3, '0')}`,
        '历史或新人工输入'.repeat(500).slice(0, 4000),
      ),
    );
    h.snapshot.questions.forEach((q) => {
      q.prompt = '待核实的核心问题'.repeat(500).slice(0, 4000);
      q.impact = '未知影响'.repeat(1000);
    });
    h.snapshot.interaction.deferredQuestionIds = h.snapshot.questions.map(
      (q) => q.id,
    );
    const { prompt, context, lines } = await h.packet(entries);
    expect(prompt.length).toBeLessThanOrEqual(DISCOVERY_PACKET_LIMIT);
    expect(prompt).toContain('已截短');
    expect(prompt).toContain('遗漏不表示');
    expect(jsonAt(lines, context.ranges.get('candidate:C-200')!).value).toEqual(
      content.candidates[199],
    );
    expect(
      jsonAt(lines, context.ranges.get('feedback')!).textChunks.join(''),
    ).toBe(h.state.feedback);
    // Even an unbounded feedback string must remain pageable with read's 50KB cap.
    expect(
      Math.max(...lines.map((line) => Buffer.byteLength(line, 'utf8'))),
    ).toBeLessThan(50000);
    expect(jsonAt(lines, context.ranges.get('gaps')!).deferred).toHaveLength(
      300,
    );
  });

  it('uses the answered question target instead of an unrelated saved cursor, including null domain targets', async () => {
    const h = await setup();
    h.snapshot.content!.contractView.current!.fulfillmentRef = 'C-004';
    const input = answer(h.snapshot, 2, 'Q-001', '已支付，提供方仍待核实');
    const focused = await h.packet([input]);
    expect(focused.context.target?.fulfillmentRef).toBe('C-005');
    expect(focused.prompt).toContain('当前展开：支付分成');
    expect(focused.prompt).not.toContain('当前展开：交付稿件');
    h.snapshot.questions[0].target = null;
    const domain = await h.packet([input]);
    expect(domain.context.target).toBeNull();
    expect(domain.prompt).not.toContain('履约请求：');
    expect(h.snapshot.content!.contractView.current!.fulfillmentRef).toBe(
      'C-004',
    );
  });

  it('preserves partial confirmation, stale references and skip/finish controls without inventing approval', async () => {
    const h = await setup();
    const item = h.snapshot.content!.contractView.contracts[0].fulfillments[1];
    item.confirmation = '银行回单；提供方待明确';
    h.snapshot.staleRecordKeys = ['fulfillment:C-001:C-005'];
    const input = answer(h.snapshot, 2, 'Q-001', 'unused');
    h.snapshot.answers = [];
    const skip: DiscoveryEntry = {
      ...input,
      event: { kind: 'interaction', action: 'skip', questionId: 'Q-001' },
    };
    const finish: DiscoveryEntry = {
      ...input,
      revision: 3,
      event: { kind: 'interaction', action: 'finish', questionId: null },
    };
    h.snapshot.interaction.stopped = true;
    h.snapshot.interaction.deferredQuestionIds = ['Q-001'];
    const { prompt, context } = await h.packet([skip, finish]);
    expect(context.pending).toEqual([skip, finish]);
    expect(prompt).toContain('银行回单；提供方待明确');
    expect(prompt).toContain('人工已结束本轮问答：禁止自动追问');
    expect(prompt).toContain('依据失效');
    expect(prompt).not.toContain('unused');
    expect(prompt).not.toContain('审批通过');
  });
});
