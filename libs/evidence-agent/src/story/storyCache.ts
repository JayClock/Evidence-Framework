import type { StoryScene } from './types.js';

/** Local facts key the cache; presentation metadata is a separate guard. */
export class StorySceneCache {
  private readonly cache = new Map<
    string,
    { readonly scene: StoryScene; readonly contextKey: string }
  >();

  get(stepHash: string, contextKey = ''): StoryScene | undefined {
    const entry = this.cache.get(stepHash);
    return entry?.contextKey === contextKey
      ? structuredClone(entry.scene)
      : undefined;
  }

  set(stepHash: string, scene: StoryScene, contextKey = ''): void {
    if (stepHash !== scene.stepHash) {
      throw new Error('Story scene hash does not match its cache key.');
    }
    this.cache.set(stepHash, { scene: structuredClone(scene), contextKey });
  }

  has(stepHash: string, contextKey = ''): boolean {
    return this.cache.get(stepHash)?.contextKey === contextKey;
  }

  clear(): void {
    this.cache.clear();
  }
}
