import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { canonicalJson } from '../canonicalJson.js';

const execute = promisify(execFile);
export const OASDIFF_VERSION = '1.38.0';

/** Native oasdiff severity: INFO=1, WARN=2, ERR=3. */
export interface OasdiffChange {
  id: string;
  text: string;
  level: 1 | 2 | 3;
  operation?: string;
  operationId?: string;
  path?: string;
  [key: string]: unknown;
}

export interface OasdiffComparison {
  changes: readonly OasdiffChange[];
  hasBreakingChanges: boolean;
  /** Native Markdown changelog. */
  changelog: string;
  /** Native full diff, including documentation and extension edits. */
  details: Record<string, unknown>;
}

export interface OasdiffOptions {
  /** Executable path, never a shell command. */
  binary?: string;
  timeoutMs?: number;
}

export class OasdiffError extends Error {
  constructor(
    message: string,
    readonly stdout = '',
    readonly stderr = '',
  ) {
    super(message);
    this.name = 'OasdiffError';
  }
}

const changesOf = (output: string): OasdiffChange[] => {
  const value: unknown = JSON.parse(output);
  if (
    !Array.isArray(value) ||
    value.some(
      (item) =>
        typeof item !== 'object' ||
        item === null ||
        typeof item.id !== 'string' ||
        typeof item.text !== 'string' ||
        ![1, 2, 3].includes(item.level) ||
        ['operation', 'operationId', 'path'].some(
          (key) => item[key] !== undefined && typeof item[key] !== 'string',
        ),
    )
  )
    throw new OasdiffError('oasdiff returned an invalid changelog.', output);
  return value;
};

/** Runs local, self-contained contracts with no shell or external reference resolution. */
export class OasdiffRunner {
  private readonly binary: string;
  private readonly timeout: number;

  constructor(options: OasdiffOptions = {}) {
    this.binary =
      options.binary ?? process.env['EVIDENCE_OASDIFF_BIN'] ?? 'oasdiff';
    this.timeout = options.timeoutMs ?? 30_000;
  }

  private async run(args: string[], cwd: string): Promise<string> {
    try {
      const { stdout } = await execute(this.binary, args, {
        cwd,
        timeout: this.timeout,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, OASDIFF_CONFIG: path.join(cwd, 'config.yaml') },
        windowsHide: true,
      });
      return stdout;
    } catch (error) {
      const failure = error as Error & { stdout?: string; stderr?: string };
      throw new OasdiffError(
        `oasdiff failed: ${failure.message}. Configure EVIDENCE_OASDIFF_BIN with oasdiff ${OASDIFF_VERSION}.`,
        failure.stdout ?? '',
        failure.stderr ?? '',
      );
    }
  }

  async compare(
    base: Record<string, unknown>,
    target: Record<string, unknown>,
  ): Promise<OasdiffComparison> {
    const directory = await mkdtemp(path.join(tmpdir(), 'evidence-oasdiff-'));
    try {
      await writeFile(path.join(directory, 'config.yaml'), '{}\n');
      const version = await this.run(['--version'], directory);
      if (version.trim() !== `oasdiff version ${OASDIFF_VERSION}`)
        throw new OasdiffError(
          `Expected oasdiff ${OASDIFF_VERSION}, received ${version.trim()}.`,
        );
      await Promise.all([
        writeFile(path.join(directory, 'base.json'), canonicalJson(base)),
        writeFile(path.join(directory, 'target.json'), canonicalJson(target)),
      ]);
      const args = ['base.json', 'target.json', '--allow-external-refs=false'];
      // Sequential execution guarantees cleanup only after each process exits.
      const changes = changesOf(
        await this.run(['changelog', ...args, '--format', 'json'], directory),
      );
      const changelog = await this.run(
        ['changelog', ...args, '--format', 'markdown'],
        directory,
      );
      const output = await this.run(
        ['diff', ...args, '--format', 'json'],
        directory,
      );
      const details: unknown = JSON.parse(output.trim() || '{}');
      if (
        typeof details !== 'object' ||
        details === null ||
        Array.isArray(details)
      )
        throw new OasdiffError('oasdiff returned an invalid diff.', output);
      return {
        changes,
        hasBreakingChanges: changes.some((change) => change.level >= 2),
        changelog,
        details: details as Record<string, unknown>,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
