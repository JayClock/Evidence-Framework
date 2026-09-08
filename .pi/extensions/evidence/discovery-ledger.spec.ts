import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { qualityHarness } from './quality-test-support.ts';
import { contractContent, discoveryContent } from './discovery-test-support.ts';
import type {
  DiscoveryRecord,
  DiscoverySubmission,
} from './discovery-schema.ts';
import {
  appendDiscoveryEvent,
  answerQuestion,
  assertDiscoveryReady,
  discoveryPath,
  discoveryViewPath,
  loadDiscovery,
  loadDiscoveryEntries,
  refreshDiscoveryView,
} from './discovery.ts';
import * as storage from './storage.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
  writeTextAtomic,
} from './storage.ts';
import { buildCurrentPrompt } from './prompts.ts';
import { discoveryDetailsPath } from './discovery-context.ts';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function setup(contract = false) {
  const h = await qualityHarness(roots);
  const state = createInitialState('test', '只追加凭证式建模记录，不修改历史');
  state.status = 'running';
  await saveState(h.root, state);
  await h.saveDiscovery({
    expectedRevision: 0,
    content: contract ? contractContent() : discoveryContent(),
  });
  return h;
}

async function current(h: Awaited<ReturnType<typeof setup>>) {
  const state = (await loadState(h.root))!;
  return { state, snapshot: await loadDiscovery(h.root, state) };
}

async function append(
  h: Awaited<ReturnType<typeof setup>>,
  records: DiscoveryRecord[],
  sourceRefs = ['INPUT'],
) {
  const { state } = await current(h);
  const submission: DiscoverySubmission = {
    summary: '依据本轮新增信息记录解释、更正或撤回，保留此前原文与缺口。',
    sourceRefs,
    records,
  };
  return h.tool('evidence_save_discovery', {
    expectedRevision: state.discovery.revision,
    ...submission,
  });
}

const note: DiscoveryRecord = {
  kind: 'note',
  supersedes: null,
  value: '本轮尚无法核实期限，保留缺口，不把未知当作已确认事实。',
};

describe('append-only discovery journal and rebuildable read model', () => {
  it('records only the changed fulfillment; unrelated content and historical bytes survive', async () => {
    const h = await setup(true);
    const { state, snapshot } = await current(h);
    const original = await readText(h.root, state.discovery.path!);
    const contract = snapshot.content!.contractView.contracts[0];
    const value = {
      contractRef: contract.contextRef,
      ...contract.fulfillments[1],
      deadline: '按协议在结算后15日内付款',
    };
    await append(h, [
      {
        kind: 'fulfillment',
        supersedes: snapshot.recordHeads['fulfillment:C-001:C-005'],
        value,
      },
    ]);
    const after = await current(h);
    const entry = JSON.parse(
      await readText(h.root, after.state.discovery.path!),
    );
    expect(entry.event.submission.records).toHaveLength(1);
    expect(entry).not.toHaveProperty('content');
    expect(entry).not.toHaveProperty('answers');
    expect(entry.event.submission.records[0].supersedes).toBe(
      snapshot.recordHeads['fulfillment:C-001:C-005'],
    );
    expect(
      after.snapshot.content!.contractView.contracts[0].fulfillments[1]
        .deadline,
    ).toBe(value.deadline);
    expect(after.snapshot.content!.candidates).toEqual(
      snapshot.content!.candidates,
    );
    expect(after.snapshot.content!.cases).toEqual(snapshot.content!.cases);
    expect(
      after.snapshot.content!.contractView.contracts[0].fulfillments[0],
    ).toEqual(contract.fulfillments[0]);
    expect(await readText(h.root, state.discovery.path!)).toBe(original);
    expect(after.snapshot.recordHeads['fulfillment:C-001:C-005']).toBe(
      'D-002-001',
    );
  });

  it.each(['duplicate', 'unknown', 'wrong-kind', 'wrong-identity', 'old-head'])(
    'rejects %s corrections atomically',
    async (kind) => {
      const h = await setup();
      const initial = await current(h);
      const value = initial.snapshot.content!.candidates[0];
      const ref = initial.snapshot.recordHeads['candidate:C-001'];
      if (kind === 'old-head')
        await append(h, [
          {
            kind: 'candidate',
            supersedes: ref,
            value: { ...value, description: '第一次更正' },
          },
        ]);
      const before = await current(h);
      const raw = await readText(h.root, '.evidence/state.json');
      const record: DiscoveryRecord =
        kind === 'wrong-kind'
          ? {
              kind: 'note',
              supersedes: ref,
              value: '不能通过更正将候选变为说明。',
            }
          : {
              kind: 'candidate',
              supersedes:
                kind === 'duplicate'
                  ? null
                  : kind === 'unknown'
                    ? 'D-999-001'
                    : ref,
              value: {
                ...value,
                id: kind === 'wrong-identity' ? 'C-002' : value.id,
              },
            };
      await expect(append(h, [record])).rejects.toThrow();
      expect(await readText(h.root, '.evidence/state.json')).toBe(raw);
      expect(
        await readText(
          h.root,
          discoveryPath(before.state, before.state.discovery.revision + 1),
        ),
      ).toBe('');
    },
  );

  it('withdraws and reasserts a candidate by explicit references without deleting either record', async () => {
    const h = await setup();
    const before = await current(h);
    const candidate = before.snapshot.content!.candidates[0];
    await append(h, [
      {
        kind: 'withdraw',
        supersedes: before.snapshot.recordHeads['candidate:C-001'],
      },
    ]);
    const withdrawn = await current(h);
    expect(withdrawn.snapshot.content!.candidates).toEqual([]);
    expect(withdrawn.snapshot.withdrawnRecordKeys).toContain('candidate:C-001');
    const ref = withdrawn.snapshot.recordHeads['candidate:C-001'];
    await expect(
      append(h, [{ kind: 'withdraw', supersedes: ref }]),
    ).rejects.toThrow('重复撤回');
    await expect(
      append(h, [{ kind: 'candidate', supersedes: null, value: candidate }]),
    ).rejects.toThrow('显式 supersedes');
    await append(h, [{ kind: 'candidate', supersedes: ref, value: candidate }]);
    const restored = await current(h);
    expect(restored.snapshot.content!.candidates).toEqual([candidate]);
    expect(restored.snapshot.withdrawnRecordKeys).toEqual([]);
    expect(
      (await loadDiscoveryEntries(h.root, restored.state)).map(
        (entry) => entry.revision,
      ),
    ).toEqual([1, 2, 3]);
    expect(await readText(h.root, discoveryPath(restored.state, 2))).toContain(
      'withdraw',
    );
  });

  it('does not permit withdrawing a contract or role while relationships still depend on it', async () => {
    const h = await setup(true);
    const { state, snapshot } = await current(h);
    for (const key of ['contract:C-001', 'candidate:C-002']) {
      await expect(
        append(h, [
          { kind: 'withdraw', supersedes: snapshot.recordHeads[key] },
        ]),
      ).rejects.toThrow();
      expect((await current(h)).state.discovery).toEqual(state.discovery);
    }
    const keys = Object.keys(snapshot.recordHeads).filter(
      (key) => key === 'contract:C-001' || key.startsWith('fulfillment:'),
    );
    await append(h, [
      ...keys.map(
        (key): DiscoveryRecord => ({
          kind: 'withdraw',
          supersedes: snapshot.recordHeads[key],
        }),
      ),
      {
        kind: 'position',
        supersedes: snapshot.recordHeads.position,
        value: { focus: 'domain', current: null },
      },
    ]);
    expect((await current(h)).snapshot.content!.contractView).toEqual({
      current: null,
      contracts: [],
    });
  });

  it('preserves every note, with correction replacing only the explicitly referenced note in the view', async () => {
    const h = await setup();
    const initial = await current(h);
    await append(h, [note]);
    const added = await current(h);
    expect(added.snapshot.content!.notes).toContain(
      initial.snapshot.content!.notes,
    );
    expect(added.snapshot.content!.notes).toContain('本轮尚无法核实期限');
    await append(h, [
      {
        kind: 'note',
        supersedes: 'D-002-001',
        value: '更正：期限依据已找到，具体规则另存候选。',
      },
    ]);
    const corrected = await current(h);
    expect(corrected.snapshot.content!.notes).not.toContain(
      '本轮尚无法核实期限',
    );
    expect(corrected.snapshot.content!.notes).toContain(
      initial.snapshot.content!.notes,
    );
    expect(await readText(h.root, discoveryPath(corrected.state, 2))).toContain(
      '本轮尚无法核实期限',
    );
  });

  it('records human answers separately and links corrections to the prior A-ID', async () => {
    const h = await setup();
    const { state } = await current(h);
    await appendDiscoveryEvent(h.root, state, {
      kind: 'question',
      question: {
        id: 'Q-001',
        focus: 'evidence',
        target: null,
        prompt: '付款期限如何约定？',
        impact: '确定期限',
        blocking: true,
        sourceRefs: ['INPUT'],
      },
    });
    const answer = {
      questionId: 'Q-001',
      text: '7天',
      respondent: 'github.com/tester',
      status: 'answered' as const,
    };
    await answerQuestion(h.root, state, answer);
    await answerQuestion(h.root, state, { ...answer, text: '更正：15天' });
    const entries = await loadDiscoveryEntries(h.root, state);
    expect(entries[2].event).toMatchObject({
      kind: 'answer',
      supersedes: null,
      answer: { id: 'A-001', text: '7天' },
    });
    expect(entries[3].event).toMatchObject({
      kind: 'answer',
      supersedes: 'A-001',
      answer: { id: 'A-002', text: '更正：15天' },
    });
    expect(entries[3]).not.toHaveProperty('content');
    expect(
      (await loadDiscovery(h.root, state)).interaction.needsConsolidation,
    ).toBe(true);
  });

  it('rejects full snapshots, fabricated answers and agent D-IDs as independent business sources', async () => {
    const h = await setup();
    const before = await readText(h.root, '.evidence/state.json');
    await expect(
      h.tool('evidence_save_discovery', {
        expectedRevision: 1,
        content: discoveryContent(),
      }),
    ).rejects.toThrow('不接受完整');
    await expect(append(h, [note], ['D-001-001'])).rejects.toThrow(
      '来源不存在',
    );
    await expect(
      h.tool('evidence_save_discovery', {
        expectedRevision: 1,
        summary: '不能用建模记录伪造人工回答',
        sourceRefs: ['INPUT'],
        records: [{ kind: 'answer', value: '人工已批准' }],
      }),
    ).rejects.toThrow('格式无效');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
  });

  it('does not refresh changed source hashes through unrelated notes, and requires explicit rebinding of dependent claims', async () => {
    const h = await setup();
    await writeTextAtomic(h.root, 'agreement.md', '付款期限为7天');
    const first = await current(h);
    const source = { id: 'SRC-001', path: 'agreement.md', locator: '付款条款' };
    const candidate = {
      ...first.snapshot.content!.candidates[0],
      sourceRefs: ['SRC-001'],
    };
    await append(h, [
      { kind: 'source', supersedes: null, value: source },
      {
        kind: 'candidate',
        supersedes: first.snapshot.recordHeads['candidate:C-001'],
        value: candidate,
      },
    ]);
    const sourced = await current(h);
    const hash = sourced.snapshot.sourceHashes['agreement.md'];
    await writeTextAtomic(h.root, 'agreement.md', '付款期限为15天');
    await append(h, [note]);
    const changed = await current(h);
    expect(changed.snapshot.sourceHashes['agreement.md']).toBe(hash);
    await expect(assertDiscoveryReady(h.root, changed.state)).rejects.toThrow(
      '原始材料已变化',
    );
    const sourceRecord: DiscoveryRecord = {
      kind: 'source',
      supersedes: changed.snapshot.recordHeads['source:SRC-001'],
      value: source,
    };
    await expect(append(h, [sourceRecord])).rejects.toThrow('依据已失效');
    await append(h, [
      sourceRecord,
      {
        kind: 'candidate',
        supersedes: changed.snapshot.recordHeads['candidate:C-001'],
        value: { ...candidate, description: '付款期限为15天' },
      },
    ]);
    const rebound = await current(h);
    expect(rebound.snapshot.sourceHashes['agreement.md']).not.toBe(hash);
    await expect(
      assertDiscoveryReady(h.root, rebound.state),
    ).resolves.toBeDefined();
  });

  it('ignores corrupted or missing read caches and rebuilds without changing history or workflow state', async () => {
    const h = await setup();
    const { state, snapshot } = await current(h);
    const before = await readText(h.root, '.evidence/state.json');
    const original = await readText(h.root, state.discovery.path!);
    await writeTextAtomic(
      h.root,
      discoveryViewPath(state),
      '{"fake":"approved"}',
    );
    expect(await loadDiscovery(h.root, state)).toEqual(snapshot);
    await refreshDiscoveryView(h.root, state);
    expect(
      JSON.parse(await readText(h.root, discoveryViewPath(state))),
    ).toMatchObject({
      kind: 'derived-discovery-view',
      revision: 1,
      content: snapshot.content,
    });
    await rm(join(h.root, discoveryViewPath(state)));
    const prompt = await buildCurrentPrompt(
      h.root,
      state,
      storage.DEFAULT_CONFIG,
    );
    expect(prompt).toContain(discoveryDetailsPath(state));
    expect(prompt).not.toContain('evidence_query_discovery');
    expect(await readText(h.root, discoveryViewPath(state))).toContain(
      'derived-discovery-view',
    );
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    expect(await readText(h.root, state.discovery.path!)).toBe(original);
    expect(
      await readdir(join(h.root, '.evidence/cache/discovery', state.runId)),
    ).toEqual(['context-details.md', 'current.json']);
  });

  it('does not trust a valid cache when journal history has been tampered with', async () => {
    const h = await setup();
    const initial = await current(h);
    await append(h, [note]);
    const { state } = await current(h);
    await writeTextAtomic(h.root, initial.state.discovery.path!, '{}');
    await expect(loadDiscovery(h.root, state)).rejects.toThrow('摘要不一致');
    await expect(refreshDiscoveryView(h.root, state)).rejects.toThrow(
      '摘要不一致',
    );
    await expect(append(h, [note])).rejects.toThrow('摘要不一致');
  });

  it('never overwrites an orphaned entry when pointer persistence fails', async () => {
    const h = await setup();
    const before = await readText(h.root, '.evidence/state.json');
    const { state } = await current(h);
    const save = vi
      .spyOn(storage, 'saveState')
      .mockRejectedValueOnce(new Error('模拟指针保存中断'));
    await expect(append(h, [note])).rejects.toThrow('指针保存中断');
    save.mockRestore();
    const path = discoveryPath(state, 2);
    const orphan = await readText(h.root, path);
    expect(orphan).toContain('本轮尚无法核实期限');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    await expect(
      append(h, [
        { ...note, value: '重试不得覆盖原始记录' } as DiscoveryRecord,
      ]),
    ).rejects.toThrow('不会覆盖历史');
    expect(await readText(h.root, path)).toBe(orphan);
  });
});
