import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

import { isModelBundlePath } from '@evidence-poc/evidence-model-core';

const WATCHED_DIRECTORIES = [
  '.',
  'entities',
  'relationships',
  'rules',
] as const;
const DEFAULT_DEBOUNCE_MS = 200;

export interface ModelWatcher {
  close(): void;
}

/**
 * Watches `.evidence/fm` and its three source trees for external writes.
 *
 * Non-recursive watchers keep Windows working, and the debounce collapses the
 * burst of events Git or a script produces into one reload prompt.
 */
export const watchModelDirectory = (
  modelRoot: string,
  onChange: (paths: readonly string[]) => void,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): ModelWatcher => {
  const watchers: FSWatcher[] = [];
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  const flush = (): void => {
    timer = null;

    if (closed || pending.size === 0) {
      return;
    }

    const paths = [...pending].map((name) => path.join(modelRoot, name));

    pending.clear();
    onChange(paths);
  };

  for (const directory of WATCHED_DIRECTORIES) {
    const target = path.join(modelRoot, directory);

    try {
      const watcher = watch(
        target,
        { persistent: false },
        (_event, filename) => {
          if (closed) {
            return;
          }

          pending.add(
            directory === '.'
              ? (filename?.toString() ?? '.')
              : path.join(directory, filename?.toString() ?? '.'),
          );

          if (timer === null) {
            timer = setTimeout(flush, debounceMs);
          }
        },
      );

      watcher.on('error', () => watcher.close());
      watchers.push(watcher);
    } catch {
      // The tree may not exist yet; `save` creates it on first write.
    }
  }

  return {
    close() {
      closed = true;

      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
};

/**
 * Watches a single-file bundle.
 *
 * The directory is watched, not the file, because an editor that saves through
 * a rename would otherwise detach the watcher after the first write.
 */
export const watchModelBundle = (
  bundlePath: string,
  onChange: (paths: readonly string[]) => void,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): ModelWatcher => {
  const target = path.resolve(bundlePath);
  const fileName = path.basename(target);
  let timer: NodeJS.Timeout | null = null;
  let closed = false;
  let watcher: FSWatcher | null = null;

  try {
    watcher = watch(
      path.dirname(target),
      { persistent: false },
      (_event, filename) => {
        if (closed || (filename !== null && filename.toString() !== fileName)) {
          return;
        }

        if (timer !== null) {
          clearTimeout(timer);
        }

        timer = setTimeout(() => {
          timer = null;

          if (!closed) {
            onChange([target]);
          }
        }, debounceMs);
      },
    );

    watcher.on('error', () => watcher?.close());
  } catch {
    // The folder may be gone; `save` reports the real error.
  }

  return {
    close() {
      closed = true;

      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      watcher?.close();
    },
  };
};

/** Watches the model source: a whole tree, or one bundle file. */
export const watchModelSource = (
  source: string,
  onChange: (paths: readonly string[]) => void,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): ModelWatcher =>
  isModelBundlePath(source)
    ? watchModelBundle(source, onChange, debounceMs)
    : watchModelDirectory(source, onChange, debounceMs);
