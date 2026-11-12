import { randomUUID } from 'node:crypto';
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { WORKBENCH_MARKER } from '../render/workbenchRenderer.js';

/**
 * Writing the page without ever destroying something that is not a page.
 *
 * A review page is a snapshot someone may still be reading, so a failed run must
 * leave the previous one untouched, and a target the tool did not write must not
 * be replaced at all. The write itself is a temp file plus a rename, so a reader
 * never sees half a page.
 */

export class WorkbenchPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkbenchPublishError';
  }
}

const isMissing = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';

/**
 * Why this target may not be written.
 *
 * A symbolic link is refused because the page would land outside the project the
 * caller meant; a file that does not start with the marker is refused because it
 * belongs to someone else.
 */
export const publishRefusal = async (output: string): Promise<string | null> => {
  const stats = await lstat(output).catch((error: unknown) => {
    if (isMissing(error)) {
      return null;
    }

    throw error;
  });

  if (stats === null) {
    return null;
  }

  if (stats.isSymbolicLink()) {
    return '拒绝覆盖非工作台文件或符号链接';
  }

  const current = await readFile(output, 'utf8').catch(() => '');

  return current.startsWith(WORKBENCH_MARKER)
    ? null
    : '拒绝覆盖非工作台文件或符号链接';
};

/**
 * Publishes the page atomically, or leaves the existing one alone.
 *
 * The temporary file is written beside the target so the rename stays on one
 * filesystem; a failure removes it, which is why a broken run leaves the
 * directory exactly as it was.
 */
export const publishWorkbench = async (
  output: string,
  html: string,
): Promise<void> => {
  const refusal = await publishRefusal(output);

  if (refusal !== null) {
    throw new WorkbenchPublishError(refusal);
  }

  const temporary = path.join(
    path.dirname(output),
    `.workbench-${randomUUID()}.html`,
  );

  try {
    await writeFile(temporary, html, 'utf8');
    await rename(temporary, output);
  } catch (error) {
    await rm(temporary, { force: true });

    throw error;
  }
};
