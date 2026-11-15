import { existsSync } from 'node:fs';
import path from 'node:path';
import { watch } from 'chokidar';

import { isModelBundlePath } from '@evidence-poc/evidence-model-core';

const SOURCE_TREES = new Set(['entities', 'relationships', 'rules']);
const DEFAULT_DEBOUNCE_MS = 200;

export interface ModelWatcher {
  /** Initial discovery is complete; existing files never trigger onChange. */
  readonly ready: Promise<void>;
  close(): Promise<void>;
}

/**
 * Chokidar v4 takes real paths, not globs. Watch the parent so replacing or
 * creating the entire model root is observable, pruning unrelated trees before
 * traversal. Only model.json and JSON files in the three source trees matter.
 */
export const watchModelSource = (
  source: string,
  onChange: (paths: readonly string[]) => void,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): ModelWatcher => {
  const target = path.resolve(source);
  const bundle = isModelBundlePath(target);
  const relevant = (file: string): boolean => {
    if (bundle) return file === target;
    const relative = path.relative(target, file);
    return (
      relative === 'model.json' ||
      (SOURCE_TREES.has(relative.split(path.sep)[0] ?? '') &&
        path.extname(file) === '.json')
    );
  };
  // Watch an existing ancestor even before first save creates .evidence/fm.
  let watchRoot = path.dirname(target);
  while (!existsSync(watchRoot) && path.dirname(watchRoot) !== watchRoot)
    watchRoot = path.dirname(watchRoot);
  const watcher = watch(watchRoot, {
    ignoreInitial: true,
    persistent: false,
    followSymlinks: false,
    atomic: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    ignored: (file, stats) => {
      // Chokidar may probe missing parents up to the nearest existing ancestor.
      const toTarget = path.relative(file, target);
      if (
        toTarget === '' ||
        (toTarget !== '..' &&
          !toTarget.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(toTarget))
      )
        return false;
      if (bundle) return true;
      const relative = path.relative(target, file);
      if (!SOURCE_TREES.has(relative.split(path.sep)[0] ?? ''))
        return relative !== 'model.json';
      return stats !== undefined && !stats.isDirectory() && !relevant(file);
    },
  });
  const ready = new Promise<void>((resolve) => watcher.once('ready', resolve));
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  let closed = false;

  const flush = (): void => {
    timer = undefined;
    if (closed || pending.size === 0) return;
    const paths = [...pending].sort();
    pending.clear();
    onChange(paths);
  };
  const onEvent = (file: string): void => {
    if (closed || !relevant(file)) return;
    pending.add(file);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };
  watcher.on('add', onEvent).on('change', onEvent).on('unlink', onEvent);
  watcher.on('error', (error) => {
    console.warn('[modelWatcher] File watching degraded:', error);
  });

  return {
    ready,
    async close() {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending.clear();
      await watcher.close();
    },
  };
};

/** Compatibility names retained for callers watching an explicit source kind. */
export const watchModelDirectory = watchModelSource;
export const watchModelBundle = watchModelSource;
