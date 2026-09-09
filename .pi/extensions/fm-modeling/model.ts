import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import { fmPaths, isWithin } from './paths.js';
import { type ModelState, StateStore } from './state.js';

const execFileAsync = promisify(execFile);
const SOURCE_ROOTS = new Set(['entities', 'fulfillments', 'relationships', 'rules', 'validation']);

export interface BundleFile {
  path: string;
  content: string;
}

export interface SubmitBundleInput {
  runId: string;
  expectedRevision: number;
  expectedModelRevision: number;
  summary: string;
  sourceRefs: string[];
  files: BundleFile[];
}

export interface ValidationResult {
  valid: boolean;
  simulationPassed: boolean | null;
  errors?: unknown[];
}

export interface ModelPublisherOptions {
  validate?: (directory: string) => Promise<ValidationResult>;
  renameDirectory?: typeof rename;
}

function assertRelativePath(path: string): void {
  if (!path || path.includes('\\') || path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error(`不允许的 bundle 路径：${path}`);
  }
  if (path === 'model.yaml' || path === 'README.md') return;
  const [root] = path.split('/');
  if (!SOURCE_ROOTS.has(root ?? '') || !path.endsWith('.yaml')) {
    throw new Error(`不允许的 bundle 路径：${path}`);
  }
  if (root === 'generated') throw new Error('generated 目录不接受 Agent 提交');
}

async function listFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) result.push(relative(directory, child).split(sep).join('/'));
    }
  }
  try {
    await walk(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return result.sort();
}

export async function digestDirectory(directory: string): Promise<string> {
  const hash = createHash('sha256');
  for (const path of await listFiles(directory)) {
    hash.update(path).update('\0').update(await readFile(resolve(directory, path))).update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

async function changedFiles(current: string, candidate: string): Promise<string[]> {
  const paths = new Set([...(await listFiles(current)), ...(await listFiles(candidate))]);
  const changed: string[] = [];
  for (const path of [...paths].sort()) {
    const read = async (directory: string) => {
      try {
        return await readFile(resolve(directory, path));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    };
    const [before, after] = await Promise.all([read(current), read(candidate)]);
    if (!before?.equals(after ?? Buffer.alloc(0)) || !after) changed.push(path);
  }
  return changed;
}

export async function validateWithFmSkill(root: string, directory: string): Promise<ValidationResult> {
  const script = resolve(fmPaths(root).skill, 'scripts/check_fm.py');
  const { stdout } = await execFileAsync('python3', [script, directory], {
    cwd: root,
    maxBuffer: 1024 * 1024,
  });
  try {
    return JSON.parse(stdout) as ValidationResult;
  } catch (error) {
    throw new Error('FM 校验器返回了无效 JSON', { cause: error });
  }
}

export class ModelPublisher {
  private readonly validate: (directory: string) => Promise<ValidationResult>;
  private readonly renameDirectory: typeof rename;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly root: string,
    private readonly store: StateStore,
    options: ModelPublisherOptions = {},
  ) {
    this.validate = options.validate ?? ((directory) => validateWithFmSkill(root, directory));
    this.renameDirectory = options.renameDirectory ?? rename;
  }

  submit(input: SubmitBundleInput): Promise<ModelState> {
    const next = this.queue.then(() => this.submitUnlocked(input), () => this.submitUnlocked(input));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async submitUnlocked(input: SubmitBundleInput): Promise<ModelState> {
    const state = await this.store.loadState();
    if (!state || state.runId !== input.runId) throw new Error('Run 不匹配');
    if (state.stoppedAt) throw new Error('Run 已停止');
    if (state.revision !== input.expectedRevision) throw new Error('Revision 已过期');
    if (state.modelRevision !== input.expectedModelRevision) throw new Error('Model revision 已过期');
    if (!input.files.some((file) => file.path === 'model.yaml')) throw new Error('bundle 缺少 model.yaml');
    const unique = new Set<string>();
    for (const file of input.files) {
      assertRelativePath(file.path);
      if (unique.has(file.path)) throw new Error(`bundle 路径重复：${file.path}`);
      unique.add(file.path);
    }

    const paths = fmPaths(this.root);
    const staging = resolve(paths.staging, `${input.runId}-${randomUUID()}`);
    if (!isWithin(paths.staging, staging)) throw new Error('staging 路径越界');
    await mkdir(staging, { recursive: true });
    try {
      for (const file of input.files) {
        const target = resolve(staging, file.path);
        if (!isWithin(staging, target)) throw new Error(`bundle 路径越界：${file.path}`);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.content, 'utf8');
      }

      let validation: ValidationResult;
      try {
        validation = await this.validate(staging);
        if (!validation.valid) {
          throw new Error(`FM 校验失败：${JSON.stringify(validation.errors ?? [])}`);
        }
      } catch (error) {
        const result = await this.store.appendEvent(input.expectedRevision, {
          kind: 'model-publication-failed',
          stage: 'validation',
          diagnostic: String(error),
          unappliedRevisions: this.unapplied(state, input.expectedRevision),
        }, (current) => ({ ...current, lastDiagnostic: String(error) }));
        return result.state;
      }

      const modelDigest = await digestDirectory(staging);
      if (state.modelDigest === modelDigest) {
        const result = await this.store.appendEvent(input.expectedRevision, {
          kind: 'model-noop',
          appliedThroughRevision: input.expectedRevision,
          modelDigest,
          sourceRefs: input.sourceRefs,
        }, (current) => ({
          ...current,
          lastAppliedRevision: input.expectedRevision,
          lastDiagnostic: null,
        }));
        return result.state;
      }

      const differences = await changedFiles(paths.model, staging);
      await rm(paths.backup, { recursive: true, force: true });
      let hadModel = false;
      try {
        hadModel = (await stat(paths.model)).isDirectory();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (hadModel) await this.renameDirectory(paths.model, paths.backup);
      try {
        await this.renameDirectory(staging, paths.model);
        const result = await this.store.appendEvent(input.expectedRevision, {
          kind: 'model-published',
          modelRevision: state.modelRevision + 1,
          appliedThroughRevision: input.expectedRevision,
          modelDigest,
          changedFiles: differences,
          sourceRefs: input.sourceRefs,
          validation: { machineValidated: true, simulationPassed: validation.simulationPassed },
        }, (current) => ({
          ...current,
          lastAppliedRevision: input.expectedRevision,
          modelRevision: current.modelRevision + 1,
          modelDigest,
          lastDiagnostic: null,
        }));
        await rm(paths.backup, { recursive: true, force: true });
        return result.state;
      } catch (error) {
        await rm(paths.model, { recursive: true, force: true });
        if (hadModel) await this.renameDirectory(paths.backup, paths.model);
        throw error;
      }
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  private unapplied(state: ModelState, through: number): number[] {
    const values: number[] = [];
    for (let revision = state.lastAppliedRevision + 1; revision <= through; revision += 1) {
      values.push(revision);
    }
    return values;
  }
}
