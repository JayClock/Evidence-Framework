import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

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
