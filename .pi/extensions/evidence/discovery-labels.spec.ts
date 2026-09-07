import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { qualityHarness } from './quality-test-support.ts';
import { subscriptionContent } from './discovery-test-support.ts';
import {
  DiscoveryContentSchema,
  DiscoverySnapshotSchema,
} from './discovery-schema.ts';
import { loadDiscovery, persistDiscovery } from './discovery.ts';
import { discoveryAnswerView } from './discovery-answer-view.ts';
import { contractViewLines } from './discovery-contract-view.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
} from './storage.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function setup() {
  const h = await qualityHarness(roots);
  const state = createInitialState('test', '候选名称与分析分离的合成回归');
  state.status = 'running';
  await saveState(h.root, state);
  return { ...h, state };
}

describe('discovery candidate naming contract', () => {
  it.each([
    undefined,
    '',
    ' ',
    ' 平台',
    '平台 ',
    '平台\n读者',
    '平台\t读者',
    '\u001b平台',
    '平台\u2028读者',
    '名'.repeat(41),
  ])(
    'rejects an invalid/missing label (%j) before changing state or evidence',
    async (label) => {
      const h = await setup();
      const content = subscriptionContent();
      if (label === undefined)
        Reflect.deleteProperty(content.candidates[0], 'label');
      else content.candidates[0].label = label;
      expect(Value.Check(DiscoveryContentSchema, content)).toBe(false);
      const before = await readText(h.root, '.evidence/state.json');
      await expect(
        h.tool('evidence_save_discovery', { expectedRevision: 0, content }),
      ).rejects.toThrow('label');
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
      expect((await loadState(h.root))!.discovery.revision).toBe(0);
    },
  );

  it.each(['读', 'Subscription payment', '名'.repeat(40)])(
    'accepts valid single-line names (%s) without rewriting their explanations',
    async (label) => {
      const h = await setup();
      const content = subscriptionContent();
      content.candidates[0].label = label;
      expect(Value.Check(DiscoveryContentSchema, content)).toBe(true);
      await h.tool('evidence_save_discovery', { expectedRevision: 0, content });
      const stored = await loadDiscovery(h.root, (await loadState(h.root))!);
      expect(stored.content).toEqual(content);
    },
  );

  it('reads historical v3 names without migration, then appends required labels on a new save', async () => {
    const h = await setup();
    const legacy = await loadDiscovery(h.root, h.state);
    legacy.content = subscriptionContent();
    for (const candidate of legacy.content.candidates) delete candidate.label;
    // Simulate a pre-label snapshot through the storage boundary in an isolated root.
    await persistDiscovery(h.root, h.state, legacy);
    const oldPath = h.state.discovery.path!;
    const oldDigest = h.state.discovery.digest;
    const before = await readText(h.root, '.evidence/state.json');
    const raw = await readText(h.root, oldPath);
    const loaded = await loadDiscovery(h.root, h.state);
    expect(Value.Check(DiscoverySnapshotSchema, loaded)).toBe(true);
    expect(Value.Check(DiscoveryContentSchema, loaded.content)).toBe(false);
    expect(loaded.content!.candidates[0].label).toBeUndefined();
    const card = discoveryAnswerView(loaded);
    expect(card.sections[0].lines[0]).toBe('C-001（名称待整理）');
    expect(card.sections[1].lines).toContain(
      '履约请求：C-003（名称待整理） → C-002（名称待整理）（权利方 → 义务方）',
    );
    const details = contractViewLines(loaded, { detailed: true }).join('\n');
    for (const candidate of loaded.content!.candidates)
      expect(details).toContain(candidate.description);
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    expect(await readText(h.root, oldPath)).toBe(raw);

    const named = subscriptionContent();
    await h.tool('evidence_save_discovery', {
      expectedRevision: 1,
      content: named,
    });
    const current = await loadDiscovery(h.root, (await loadState(h.root))!);
    expect(current).toMatchObject({
      version: 3,
      revision: 2,
      previousDigest: oldDigest,
      content: named,
    });
    expect(discoveryAnswerView(current).sections[0].lines[0]).toBe(
      '专栏订阅合同',
    );
    expect(current.content!.candidates.map((c) => c.description)).toEqual(
      loaded.content!.candidates.map((c) => c.description),
    );
    expect(await readText(h.root, oldPath)).toBe(raw);
  });
});
