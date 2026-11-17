import { describe, expect, it } from 'vitest';

import { StorySceneCache } from './storyCache.js';
import type { StoryScene } from './types.js';

const scene: StoryScene = {
  stepIndex: 1,
  stepHash: 'payment-facts',
  phaseTitle: '卖方请款',
  narrative: '卖方依据合同发出付款申请。',
  actingRoleLabel: '卖方',
  targetEntityLabel: '付款申请单',
  documentCard: {
    title: '付款申请单',
    fields: [{ name: 'amount', label: '金额', value: '100', keyData: true }],
  },
  ruleEvaluations: [],
};

describe('StorySceneCache', () => {
  it('stores scenes by local step hash and guards unhashed presentation context', () => {
    const cache = new StorySceneCache();
    expect(cache.get(scene.stepHash)).toBeUndefined();
    expect(cache.has(scene.stepHash)).toBe(false);
    cache.set(scene.stepHash, scene);
    expect(cache.has(scene.stepHash)).toBe(true);
    expect(cache.get(scene.stepHash)).toEqual(scene);
    expect(cache.get(scene.stepHash, 'new gaps')).toBeUndefined();
    expect(cache.has(scene.stepHash, 'new gaps')).toBe(false);
    cache.set(scene.stepHash, scene, 'new gaps');
    expect(cache.get(scene.stepHash)).toBeUndefined();
    expect(cache.get(scene.stepHash, 'new gaps')).toEqual(scene);
    cache.clear();
    expect(cache.has(scene.stepHash, 'new gaps')).toBe(false);
  });

  it('isolates cached nested values from both callers and returned projections', () => {
    const cache = new StorySceneCache();
    const mutable = structuredClone(scene);
    cache.set(scene.stepHash, mutable);
    Object.assign(mutable.documentCard.fields[0]!, { value: '999' });
    const returned = cache.get(scene.stepHash)!;
    Object.assign(returned.documentCard.fields[0]!, { value: '888' });
    expect(cache.get(scene.stepHash)).toEqual(scene);
  });

  it('rejects a scene stored under a different step identity', () => {
    expect(() => new StorySceneCache().set('wrong', scene)).toThrow('hash');
  });
});
