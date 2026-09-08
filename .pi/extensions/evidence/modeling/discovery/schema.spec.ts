import { rm } from 'node:fs/promises';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDiscovery } from '../../state/discovery/index.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
} from '../../storage.ts';
import { subscriptionContent } from '../../tests/support/discovery-test-support.ts';
import { qualityHarness } from '../../tests/support/quality-test-support.ts';
import { DiscoveryContentSchema } from './schema.ts';

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
        h.saveDiscovery({ expectedRevision: 0, content }),
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
      await h.saveDiscovery({ expectedRevision: 0, content });
      const stored = await loadDiscovery(h.root, (await loadState(h.root))!);
      expect(stored.content).toEqual(content);
    },
  );

  it('corrects a name by appending one candidate record and preserves the original bytes', async () => {
    const h = await setup();
    await h.saveDiscovery({
      expectedRevision: 0,
      content: subscriptionContent(),
    });
    const state = (await loadState(h.root))!;
    const oldPath = state.discovery.path!;
    const raw = await readText(h.root, oldPath);
    const before = await loadDiscovery(h.root, state);
    const candidate = {
      ...before.content!.candidates[0],
      label: '专栏阅读协议',
    };
    await h.tool('evidence_save_discovery', {
      expectedRevision: 1,
      summary: '依据原始输入更正合同名称，其他说明和关系保持不变。',
      sourceRefs: ['INPUT'],
      records: [
        {
          kind: 'candidate',
          supersedes: before.recordHeads['candidate:C-001'],
          value: candidate,
        },
      ],
    });
    const current = await loadDiscovery(h.root, (await loadState(h.root))!);
    expect(current.content!.candidates[0]).toEqual(candidate);
    expect(current.content!.contractView).toEqual(before.content!.contractView);
    expect(await readText(h.root, oldPath)).toBe(raw);
  });
});
