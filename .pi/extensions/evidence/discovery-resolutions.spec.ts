import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { qualityHarness } from './quality-test-support.ts';
import {
  discoveryContent,
  saveDiscoveryContent,
  seedQuestions,
} from './discovery-test-support.ts';
import type {
  DiscoveryQuestion,
  DiscoveryRecord,
  QuestionResolution,
} from './discovery-schema.ts';
import {
  activeResolution,
  answerQuestion,
  appendDiscoveryRecords,
  askQuestions,
  assertDiscoveryReady,
  controlDiscoveryInteraction,
  discoveryViewPath,
  loadDiscovery,
  loadDiscoveryEntries,
  pendingQuestions,
  unresolvedBlockingQuestions,
} from './discovery.ts';
import {
  createInitialState,
  loadState,
  readText,
  REQUIREMENTS_PATH,
  saveState,
  DEFAULT_CONFIG,
  writeTextAtomic,
} from './storage.ts';
import { buildCurrentPrompt } from './prompts.ts';
import { discoveryDetailsPath } from './discovery-context.ts';
import { discoveryAnswerView } from './adapters/pi/ui/discovery-answer-view.ts';
import { contractViewLines, questionLabel } from './discovery-contract-view.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const facts =
  '客户编号在本企业唯一。付款请求发出后72小时截止。银行扣款成功回执证明付款完成。';
const question: DiscoveryQuestion = {
  id: 'Q-001',
  gapKey: 'input.customer-identity',
  focus: 'domain',
  target: null,
  prompt: '客户如何唯一识别？',
  impact: '判断两个档案是否属于同一个客户',
  blocking: true,
  sourceRefs: ['INPUT'],
};
const settlement: DiscoveryQuestion = {
  ...question,
  id: 'Q-002',
  gapKey: 'input.settlement',
  prompt: '款项如何结算？',
};
const resolution: QuestionResolution = {
  questionId: 'Q-001',
  conclusion: '以本企业唯一客户编号识别客户。',
  reasoning:
    '输入明确客户编号及唯一性范围，已经足以回答身份问题，不要求数据库主键设计。',
  sourceRefs: ['INPUT'],
  citations: [{ sourceRef: 'INPUT', quote: '客户编号在本企业唯一。' }],
};

async function setup() {
  const h = await qualityHarness(roots);
  const state = createInitialState(
    'resolution-test',
    '合成问题解决依据回归，不是业务事实',
  );
  state.status = 'running';
  await writeTextAtomic(h.root, REQUIREMENTS_PATH, facts);
  await saveState(h.root, state);
  await saveDiscoveryContent(h.root, state, discoveryContent());
  await askQuestions(h.root, state, [question]);
  return { ...h, state };
}
type Harness = Awaited<ReturnType<typeof setup>>;
async function append(
  h: Harness,
  records: DiscoveryRecord[],
  sourceRefs = ['INPUT'],
) {
  await appendDiscoveryRecords(h.root, h.state, {
    summary: '合成回归：追加有来源的解释，保留所有原始问题和人工回答。',
    sourceRefs,
    records,
  });
}
async function resolve(
  h: Harness,
  value = resolution,
  supersedes: string | null = null,
) {
  await append(h, [{ kind: 'resolution', supersedes, value }]);
}
const note: DiscoveryRecord = {
  kind: 'note',
  supersedes: null,
  value: '已整理本轮输入；保留仍未知的缺口，不代替人工作业务决定。',
};

async function otherAnswer(
  h: Harness,
  status: 'answered' | 'unknown' | 'excluded' = 'answered',
) {
  await seedQuestions(h.root, h.state, [settlement]);
  await answerQuestion(h.root, h.state, {
    questionId: settlement.id,
    text: facts,
    respondent: 'github.com/tester',
    status,
  });
  return {
    ...resolution,
    sourceRefs: ['A-001'],
    citations: [{ sourceRef: 'A-001', quote: '客户编号在本企业唯一。' }],
  };
}

describe('sourced question resolutions, not agent-authored human answers', () => {
  it('closes a redundant question from INPUT without altering its question, human answers or historical bytes', async () => {
    const h = await setup();
    const path = h.state.discovery.path!;
    const original = await readText(h.root, path);
    await resolve(h);
    const snapshot = await loadDiscovery(h.root, h.state);
    expect(snapshot.questions).toEqual([question]);
    expect(snapshot.answers).toEqual([]);
    expect(snapshot.questionResolutions).toEqual([resolution]);
    expect(snapshot.recordHeads['resolution:Q-001']).toBe('D-003-001');
    expect(snapshot.interaction.activeQuestionId).toBeNull();
    expect(pendingQuestions(snapshot)).toEqual([]);
    expect(unresolvedBlockingQuestions(snapshot)).toEqual([]);
    expect(await readText(h.root, path)).toBe(original);
    await expect(assertDiscoveryReady(h.root, h.state)).resolves.toBeDefined();
    expect(h.state.pendingGate).toBeNull();
  });

  it('uses one human answer that covers another question, and renders the association separately everywhere', async () => {
    const h = await setup();
    await resolve(h, await otherAnswer(h));
    const snapshot = await loadDiscovery(h.root, h.state);
    expect(snapshot.answers).toHaveLength(1);
    expect(snapshot.answers[0].questionId).toBe('Q-002');
    expect(unresolvedBlockingQuestions(snapshot)).toEqual([]);
    expect(questionLabel(snapshot, 'Q-001')).toContain('[已关联依据]');
    expect(JSON.stringify(discoveryAnswerView(snapshot, 'Q-001'))).toContain(
      '非人工回答',
    );
    expect(
      contractViewLines(snapshot, { detailed: true }).join('\n'),
    ).toContain('客户编号在本企业唯一');
    const prompt = await buildCurrentPrompt(h.root, h.state, DEFAULT_CONFIG);
    expect(prompt).toContain('已关联解决依据（Agent 解释）：Q-001');
    expect(prompt).toContain('未解决的阻塞项：无');
    const details = await readText(h.root, discoveryDetailsPath(h.state));
    expect(details).toContain('resolution:Q-001');
    expect(details).toContain('input.customer-identity');
    expect(details).toContain('客户编号在本企业唯一。');
  });

  it('keeps resolution history visible even when the contract projection is stale', async () => {
    const h = await setup();
    await resolve(h);
    const snapshot = await loadDiscovery(h.root, h.state);
    snapshot.staleRecordKeys.push('candidate:C-001', 'resolution:Q-001');
    expect(questionLabel(snapshot, 'Q-001')).toContain(
      '[依据失效] [原合同待核对]',
    );
    for (const options of [{ detailed: true }, { questionId: 'Q-001' }]) {
      const lines = contractViewLines(snapshot, options).join('\n');
      expect(lines).toContain('解决依据已失效');
      expect(lines).toContain('客户编号在本企业唯一。');
    }
    expect(JSON.stringify(discoveryAnswerView(snapshot, 'Q-001'))).toContain(
      '解决依据已失效',
    );
  });

  it.each([
    'missing-question',
    'agent-ref',
    'missing-ref',
    'bad-quote',
    'uncited-ref',
    'foreign-quote',
  ])('rejects %s atomically', async (kind) => {
    const h = await setup();
    const value = structuredClone(resolution);
    if (kind === 'missing-question') value.questionId = 'Q-999';
    if (kind === 'agent-ref') value.sourceRefs = ['D-001-001'];
    if (kind === 'missing-ref') value.sourceRefs = ['SRC-999'];
    if (kind === 'bad-quote') value.citations[0].quote = '没有来源的事实';
    if (kind === 'uncited-ref')
      value.citations = [{ sourceRef: 'INPUT', quote: ' ' }];
    if (kind === 'foreign-quote') value.citations[0].sourceRef = 'SRC-001';
    const before = await readText(h.root, '.evidence/state.json');
    await expect(resolve(h, value)).rejects.toThrow();
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    expect(await loadDiscoveryEntries(h.root, h.state)).toHaveLength(2);
  });

  it.each(['unknown', 'excluded'] as const)(
    'does not use a human %s answer as factual proof',
    async (status) => {
      const h = await setup();
      const value = await otherAnswer(h, status);
      await expect(resolve(h, value)).rejects.toThrow('不能引用未知、排除');
    },
  );

  it.each(['answered', 'excluded'] as const)(
    'does not replace an existing %s decision on the target question',
    async (status) => {
      const h = await setup();
      await answerQuestion(h.root, h.state, {
        questionId: question.id,
        text: '请保留我的决定。',
        status,
        respondent: 'github.com/tester',
      });
      await expect(resolve(h)).rejects.toThrow('不得用解决依据替代');
    },
  );

  it('invalidates a cross-answer association on correction, even to unknown; no automatic re-question', async () => {
    const h = await setup();
    await resolve(h, await otherAnswer(h));
    await answerQuestion(h.root, h.state, {
      questionId: 'Q-002',
      text: '更正：身份依据尚不清楚。',
      status: 'unknown',
      respondent: 'github.com/tester',
    });
    let snapshot = await loadDiscovery(h.root, h.state);
    expect(snapshot.staleRecordKeys).toContain('resolution:Q-001');
    expect(activeResolution(snapshot, 'Q-001')).toBeUndefined();
    expect(unresolvedBlockingQuestions(snapshot).map((q) => q.id)).toEqual([
      'Q-001',
      'Q-002',
    ]);
    await append(h, [note]);
    snapshot = await loadDiscovery(h.root, h.state);
    expect(pendingQuestions(snapshot)).toEqual([]);
    await expect(assertDiscoveryReady(h.root, h.state)).rejects.toThrow(
      '阻塞问题未解决',
    );
    await expect(
      resolve(
        h,
        {
          ...resolution,
          sourceRefs: ['A-001'],
          citations: [{ sourceRef: 'A-001', quote: facts }],
        },
        snapshot.recordHeads['resolution:Q-001'],
      ),
    ).rejects.toThrow('最新有效事实回答');
  });

  it.each(['unknown', 'answered'] as const)(
    'gives later target %s input precedence over an older association',
    async (status) => {
      const h = await setup();
      await resolve(h);
      await answerQuestion(h.root, h.state, {
        questionId: 'Q-001',
        text: '更正：请重新核对客户身份。',
        status,
        respondent: 'github.com/tester',
      });
      await append(h, [note]);
      const snapshot = await loadDiscovery(h.root, h.state);
      expect(activeResolution(snapshot, 'Q-001')).toBeUndefined();
      expect(snapshot.staleRecordKeys).toContain('resolution:Q-001');
      expect(unresolvedBlockingQuestions(snapshot)).toHaveLength(
        status === 'unknown' ? 1 : 0,
      );
      expect(questionLabel(snapshot, 'Q-001')).toContain('[依据失效]');
    },
  );

  it('handles unknown target facts with a later, independently sourced resolution without changing the unknown answer', async () => {
    const h = await setup();
    await answerQuestion(h.root, h.state, {
      questionId: 'Q-001',
      text: '暂时不知道。',
      status: 'unknown',
      respondent: 'github.com/tester',
    });
    await resolve(h);
    const snapshot = await loadDiscovery(h.root, h.state);
    expect(snapshot.answers[0].status).toBe('unknown');
    expect(unresolvedBlockingQuestions(snapshot)).toEqual([]);
    expect(await buildCurrentPrompt(h.root, h.state, DEFAULT_CONFIG)).toContain(
      '阻塞且仍未知：无',
    );
  });

  it('checks every source quote and detects changed files before SRC reassertion', async () => {
    const h = await setup();
    await writeTextAtomic(h.root, 'agreement.md', facts);
    const source = { id: 'SRC-001', path: 'agreement.md', locator: '身份条款' };
    await append(h, [{ kind: 'source', supersedes: null, value: source }]);
    const value = { ...resolution, sourceRefs: ['INPUT', 'SRC-001'] };
    await expect(resolve(h, value)).rejects.toThrow(
      '每项解决来源都须有原文摘录',
    );
    const sourced = {
      ...resolution,
      sourceRefs: ['SRC-001'],
      citations: [{ sourceRef: 'SRC-001', quote: facts }],
    };
    await resolve(h, sourced);
    const before = await loadDiscovery(h.root, h.state);
    await writeTextAtomic(h.root, 'agreement.md', '编号在全国唯一。');
    let snapshot = await loadDiscovery(h.root, h.state);
    expect(activeResolution(snapshot, 'Q-001')).toBeUndefined();
    expect(snapshot.sourceHashes).toEqual(before.sourceHashes);
    h.state.status = 'ready';
    await saveState(h.root, h.state);
    const stateBeforeSelection = await readText(h.root, '.evidence/state.json');
    await expect(
      controlDiscoveryInteraction(h.root, h.state, 'resume'),
    ).rejects.toThrow('显式更新来源或撤回关联');
    await expect(askQuestions(h.root, h.state, [question])).rejects.toThrow(
      '显式更新来源或撤回关联',
    );
    expect(await readText(h.root, '.evidence/state.json')).toBe(
      stateBeforeSelection,
    );
    await append(h, [note]);
    const cached = JSON.parse(
      await readText(h.root, discoveryViewPath(h.state)),
    );
    expect(cached.staleRecordKeys).toContain('resolution:Q-001');
    await expect(
      resolve(h, sourced, snapshot.recordHeads['resolution:Q-001']),
    ).rejects.toThrow('原始材料已变化');
    await append(h, [
      {
        kind: 'source',
        supersedes: snapshot.recordHeads['source:SRC-001'],
        value: source,
      },
    ]);
    snapshot = await loadDiscovery(h.root, h.state);
    expect(snapshot.staleRecordKeys).toContain('resolution:Q-001');
    h.state.status = 'ready';
    await controlDiscoveryInteraction(h.root, h.state, 'resume');
    expect(pendingQuestions(await loadDiscovery(h.root, h.state))).toEqual([
      question,
    ]);
    await resolve(
      h,
      {
        ...sourced,
        conclusion: '按全国唯一编号识别。',
        citations: [{ sourceRef: 'SRC-001', quote: '编号在全国唯一。' }],
      },
      snapshot.recordHeads['resolution:Q-001'],
    );
    expect(
      activeResolution(await loadDiscovery(h.root, h.state), 'Q-001')
        ?.conclusion,
    ).toBe('按全国唯一编号识别。');
  });

  it('supports correction, withdrawal and reassertion by current D-ID without resurrecting an automatic question', async () => {
    const h = await setup();
    await resolve(h);
    await expect(resolve(h)).rejects.toThrow('显式 supersedes');
    let snapshot = await loadDiscovery(h.root, h.state);
    const oldRef = snapshot.recordHeads['resolution:Q-001'];
    await resolve(
      h,
      { ...resolution, conclusion: '按企业内唯一客户编号判断。' },
      oldRef,
    );
    await expect(resolve(h, resolution, oldRef)).rejects.toThrow('当前记录');
    snapshot = await loadDiscovery(h.root, h.state);
    await append(h, [
      {
        kind: 'withdraw',
        supersedes: snapshot.recordHeads['resolution:Q-001'],
      },
    ]);
    snapshot = await loadDiscovery(h.root, h.state);
    expect(snapshot.questionResolutions).toEqual([]);
    expect(unresolvedBlockingQuestions(snapshot)).toEqual([question]);
    expect(pendingQuestions(snapshot)).toEqual([]);
    await resolve(h, resolution, snapshot.recordHeads['resolution:Q-001']);
    expect((await loadDiscovery(h.root, h.state)).answers).toEqual([]);
  });

  it('resolving deferred questions preserves stop/defer controls across reload and explicit resume', async () => {
    const h = await setup();
    await controlDiscoveryInteraction(h.root, h.state, 'skip', 'Q-001');
    await controlDiscoveryInteraction(h.root, h.state, 'finish');
    await resolve(h);
    h.state.status = 'ready';
    await saveState(h.root, h.state);
    await h.events.get('session_start')!({}, h.ctx);
    h.state = (await loadState(h.root))!;
    let snapshot = await loadDiscovery(h.root, h.state);
    expect(snapshot.interaction).toMatchObject({
      stopped: true,
      deferredQuestionIds: ['Q-001'],
    });
    expect(h.api.sendUserMessage).not.toHaveBeenCalled();
    await expect(askQuestions(h.root, h.state, [settlement])).rejects.toThrow(
      '人工已结束',
    );
    await controlDiscoveryInteraction(h.root, h.state, 'resume');
    snapshot = await loadDiscovery(h.root, h.state);
    expect(pendingQuestions(snapshot)).toEqual([]);
    expect(snapshot.interaction.activeQuestionId).toBeNull();
  });

  it('manual review shows the linked evidence but does not prefill it as a human answer', async () => {
    const h = await setup();
    await resolve(h);
    h.state.status = 'ready';
    await saveState(h.root, h.state);
    h.ui.select.mockResolvedValue('事实或决定');
    h.ui.editor.mockResolvedValue(undefined);
    h.api.exec.mockResolvedValue({
      code: 0,
      killed: false,
      stdout: '{"login":"tester"}',
      stderr: '',
    });
    await h.command('evidence-answer', 'Q-001');
    expect(h.ui.select.mock.calls[0][0]).toContain('非人工回答');
    expect(h.ui.select.mock.calls[0][1]).not.toContain('暂不确定／跳过此题');
    expect(h.ui.editor.mock.calls[0][1]).toBe('');
    expect(
      (await loadDiscovery(h.root, (await loadState(h.root))!)).answers,
    ).toEqual([]);
  });
});

describe('stable business gap identity', () => {
  it('requires a key for new questions while preserving old v4 questions verbatim', async () => {
    const h = await setup();
    await resolve(h);
    const { gapKey: _key, ...legacy } = settlement;
    await expect(askQuestions(h.root, h.state, [legacy])).rejects.toThrow(
      '稳定 gapKey',
    );
    await seedQuestions(h.root, h.state, [legacy]);
    // Clear the active pointer through human input on another question, then consolidate.
    await answerQuestion(h.root, h.state, {
      questionId: 'Q-001',
      text: '客户编号唯一。',
      status: 'answered',
      respondent: 'github.com/tester',
    });
    await append(h, [note]);
    await askQuestions(h.root, h.state, [legacy]);
    expect(pendingQuestions(await loadDiscovery(h.root, h.state))).toEqual([
      legacy,
    ]);
  });

  it.each(['answered', 'deferred', 'resolved'] as const)(
    'rejects a paraphrase of a %s gap under a new Q-ID',
    async (mode) => {
      const h = await setup();
      if (mode === 'answered')
        await answerQuestion(h.root, h.state, {
          questionId: 'Q-001',
          text: facts,
          status: 'answered',
          respondent: 'github.com/tester',
        });
      if (mode === 'deferred')
        await controlDiscoveryInteraction(h.root, h.state, 'skip', 'Q-001');
      if (mode === 'resolved') await resolve(h);
      else await append(h, [note]);
      const before = await readText(h.root, '.evidence/state.json');
      await expect(
        askQuestions(h.root, h.state, [
          {
            ...question,
            id: 'Q-003',
            prompt: '以什么依据判断两份客户资料的身份？',
          },
        ]),
      ).rejects.toThrow('同一业务缺口');
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    },
  );

  it('catches text-only renaming of a legacy gap but allows a distinct domain subject', async () => {
    const h = await setup();
    await resolve(h);
    await expect(
      askQuestions(h.root, h.state, [
        {
          ...question,
          id: 'Q-003',
          gapKey: 'input.renamed',
          prompt: '客户 如何唯一识别?',
        },
      ]),
    ).rejects.toThrow('同一业务缺口');
    await askQuestions(h.root, h.state, [
      { ...question, id: 'Q-003', gapKey: 'c-099.customer-identity' },
    ]);
    expect(pendingQuestions(await loadDiscovery(h.root, h.state))[0].id).toBe(
      'Q-003',
    );
  });
});
