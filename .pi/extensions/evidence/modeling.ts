import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { CheckItem } from './types.ts';

export const FM_MODEL_ROOT = 'artifacts/02-domain/fm-model';
export const FM_STATUS_PATH = `${FM_MODEL_ROOT}/status.md`;
const FM_SKILL_ROOT = '.pi/skills/evidence-modeling';
const RUNTIME_ROOT = 'node_modules/.cache/evidence-fm-runtime';
const ROOT_FILES = new Set([
  'model.yaml',
  'README.md',
  '00-overview.md',
  '01-glossary.md',
]);
const MODEL_FILE_PATTERN =
  /^(?:entities|fulfillments|relationships|rules|business-patterns)\/[a-z0-9][a-z0-9-]*\.yaml$/;
const DISCOVERY_FILE_PATTERN = /^discovery\/[a-z0-9][a-z0-9-]*\.(?:md|yaml)$/;
const VALIDATION_FILE_PATTERN =
  /^validation\/(?:instances|scenarios)\/[a-z0-9][a-z0-9-]*\.yaml$/;

interface ExecResult {
  code: number;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
}

interface ExecApi {
  exec: (
    command: string,
    args: string[],
    options: { cwd: string; timeout?: number; signal?: AbortSignal },
  ) => Promise<ExecResult>;
}

export interface FmModelFile {
  path: string;
  content: string;
}

export interface FmValidationResult {
  passed: boolean;
  machineValidated: boolean;
  simulationPassed: boolean | null;
  items: CheckItem[];
}

interface RuntimeOptions {
  pi: ExecApi;
  root: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

interface ValidationOptions extends RuntimeOptions {
  modelDir: string;
}

function normalizedRelativePath(path: string): string {
  const normalized = path.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`非法 FM 文件路径：${path}`);
  }
  if (
    !ROOT_FILES.has(normalized) &&
    !MODEL_FILE_PATTERN.test(normalized) &&
    !DISCOVERY_FILE_PATTERN.test(normalized) &&
    !VALIDATION_FILE_PATTERN.test(normalized)
  ) {
    throw new Error(`FM 文件路径不在允许范围内：${path}`);
  }
  return normalized;
}

export function normalizeFmModelFiles(files: FmModelFile[]): FmModelFile[] {
  if (files.length > 200) throw new Error('FM 模型文件不能超过 200 个');
  const seen = new Set<string>();
  const normalized = files.map((file) => {
    const path = normalizedRelativePath(file.path);
    if (seen.has(path)) throw new Error(`重复的 FM 文件路径：${path}`);
    if (!file.content.trim()) throw new Error(`FM 文件不能为空：${path}`);
    if (file.content.length > 500_000)
      throw new Error(`单个 FM 文件不能超过 500000 字符：${path}`);
    seen.add(path);
    return { path, content: `${file.content.trimEnd()}\n` };
  });
  if (!seen.has('model.yaml')) throw new Error('FM 模型必须包含 model.yaml');
  return normalized.sort((left, right) => left.path.localeCompare(right.path));
}

function runtimePython(root: string): string {
  const executable = process.platform === 'win32' ? 'python.exe' : 'python';
  const directory = process.platform === 'win32' ? 'Scripts' : 'bin';
  return resolve(root, RUNTIME_ROOT, directory, executable);
}

function combinedOutput(result: ExecResult): string {
  return [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim()
    .slice(-6000);
}

async function runProcess(
  options: RuntimeOptions,
  command: string,
  args: string[],
): Promise<ExecResult> {
  try {
    return await options.pi.exec(command, args, {
      cwd: options.root,
      timeout: options.timeoutMs,
      signal: options.signal,
    });
  } catch (error) {
    return {
      code: 1,
      stderr: error instanceof Error ? error.message : String(error),
      killed: options.signal?.aborted ?? false,
    };
  }
}

async function selectBootstrapPython(options: RuntimeOptions): Promise<string> {
  const candidates = [
    process.env.EVIDENCE_PYTHON,
    'python3.13',
    'python3.12',
    'python3.11',
    'python3.10',
    'python3',
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of new Set(candidates)) {
    const result = await runProcess(options, candidate, ['--version']);
    if (result.code !== 0 || result.killed) continue;
    const match = /Python\s+(\d+)\.(\d+)/.exec(combinedOutput(result));
    if (!match) continue;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major > 3 || (major === 3 && minor >= 10)) return candidate;
  }
  throw new Error(
    'FM 校验需要 Python 3.10 或更高版本；可通过 EVIDENCE_PYTHON 指定解释器。',
  );
}

async function ensureRuntime(options: RuntimeOptions): Promise<string> {
  const requirements = resolve(options.root, FM_SKILL_ROOT, 'requirements.txt');
  const requirementsText = await readFile(requirements, 'utf8');
  const fingerprint = createHash('sha256')
    .update('evidence-fm-runtime-v2-python>=3.10\n')
    .update(requirementsText)
    .digest('hex');
  const runtimeRoot = resolve(options.root, RUNTIME_ROOT);
  const marker = join(runtimeRoot, '.requirements-sha256');
  const python = runtimePython(options.root);
  let currentFingerprint = '';
  try {
    const markerContent = await readFile(marker, 'utf8');
    currentFingerprint = markerContent.trim();
    await stat(python);
  } catch {
    currentFingerprint = '';
  }
  if (currentFingerprint === fingerprint) return python;

  options.onProgress?.('准备 FM Python 运行环境');
  const bootstrapPython = await selectBootstrapPython(options);
  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(dirname(runtimeRoot), { recursive: true });
  const venv = await runProcess(options, bootstrapPython, [
    '-m',
    'venv',
    runtimeRoot,
  ]);
  if (venv.code !== 0 || venv.killed) {
    throw new Error(`无法创建 FM Python 环境：${combinedOutput(venv)}`);
  }
  const install = await runProcess(options, python, [
    '-m',
    'pip',
    'install',
    '--disable-pip-version-check',
    '-r',
    requirements,
  ]);
  if (install.code !== 0 || install.killed) {
    throw new Error(`无法安装 FM 校验依赖：${combinedOutput(install)}`);
  }
  await writeFile(marker, `${fingerprint}\n`, 'utf8');
  return python;
}

async function hasScenarios(modelDir: string): Promise<boolean> {
  try {
    const entries = await readdir(join(modelDir, 'validation', 'scenarios'));
    return entries.some((entry) => entry.endsWith('.yaml'));
  } catch {
    return false;
  }
}

function commandItem(name: string, result: ExecResult): CheckItem {
  return {
    name,
    status: result.code === 0 && !result.killed ? 'pass' : 'fail',
    details:
      `退出码 ${result.code}${result.killed ? '（被终止）' : ''}\n${combinedOutput(result)}`.trim(),
  };
}

export async function validateFmModel(
  options: ValidationOptions,
): Promise<FmValidationResult> {
  const items: CheckItem[] = [];
  let python: string;
  try {
    python = await ensureRuntime(options);
  } catch (error) {
    return {
      passed: false,
      machineValidated: false,
      simulationPassed: null,
      items: [
        {
          name: 'FM runtime',
          status: 'fail',
          details: (error as Error).message,
        },
      ],
    };
  }

  const scriptRoot = resolve(options.root, FM_SKILL_ROOT, 'scripts');
  const modelDir = resolve(options.modelDir);
  const generated = join(modelDir, 'generated');
  await mkdir(generated, { recursive: true });
  const commands: Array<{ name: string; script: string; args: string[] }> = [
    {
      name: 'FM schema validation',
      script: 'validate_fm_model.py',
      args: [modelDir, '--json', '--model-only'],
    },
    {
      name: 'FM attribute lineage',
      script: 'build_fm_lineage.py',
      args: [modelDir, '--output', join(generated, 'traceability.json')],
    },
  ];
  const scenariosExist = await hasScenarios(modelDir);
  // Any submitted validation inputs must be checked; orphan instances cannot be skipped.
  const validationExists = await stat(join(modelDir, 'validation')).then(
    () => true,
    () => false,
  );
  const patternsExist = await stat(join(modelDir, 'business-patterns')).then(
    () => true,
    () => false,
  );
  if (!validationExists)
    await rm(join(generated, 'simulation.json'), { force: true });
  if (!patternsExist)
    await rm(join(modelDir, '02-business-patterns.md'), { force: true });
  if (validationExists) {
    commands.push({
      name: 'FM scenario simulation',
      script: 'simulate_fm_model.py',
      args: [modelDir, '--output', join(generated, 'simulation.json')],
    });
  }
  if (patternsExist) {
    commands.push({
      name: 'FM business pattern projection',
      script: 'build_fm_business_patterns.py',
      args: [modelDir, '--output', join(modelDir, '02-business-patterns.md')],
    });
  }
  commands.push({
    name: 'FM deterministic compilation',
    script: 'compile_fm_model.py',
    args: [modelDir, '--output', join(generated, 'model.json')],
  });

  let machineValidated = false;
  let simulationPassed: boolean | null = validationExists ? false : null;
  let hasFulfillments = false;
  for (const command of commands) {
    options.onProgress?.(`执行 ${command.name}`);
    const result = await runProcess(options, python, [
      '-B',
      join(scriptRoot, command.script),
      ...command.args,
    ]);
    const item = commandItem(command.name, result);
    items.push(item);
    if (item.status === 'fail') break;
    if (command.name === 'FM schema validation') {
      try {
        const parsed = JSON.parse(result.stdout ?? '') as {
          valid?: boolean;
          machineValidated?: boolean;
          counts?: { fulfillments?: number };
        } | null;
        if (parsed?.valid !== true || parsed.machineValidated !== true) {
          throw new Error('缺少明确通过的机器校验结果');
        }
        hasFulfillments = (parsed.counts?.fulfillments ?? 0) > 0;
      } catch (error) {
        item.status = 'fail';
        item.details += `\nFM 结果无效：${error instanceof Error ? error.message : String(error)}`;
        break;
      }
    }
    if (command.name === 'FM attribute lineage') machineValidated = true;
    if (command.name === 'FM scenario simulation') simulationPassed = true;
  }
  if (!scenariosExist) {
    items.push({
      name: 'FM validation scenarios',
      status: hasFulfillments ? 'warn' : 'pass',
      details: hasFulfillments
        ? '存在履约但未提交场景；未执行单据模拟，需人工审查覆盖缺口'
        : '无适用单据场景；未执行模拟。纯领域结构与 lineage 不证明领域实例或状态机行为，需下游 Q1/Q2 验证',
    });
  }
  const passed =
    machineValidated && items.every((item) => item.status !== 'fail');
  return { passed, machineValidated, simulationPassed, items };
}

async function listFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile())
        result.push(relative(directory, absolute).replaceAll('\\', '/'));
    }
  }
  await visit(directory);
  return result.sort((left, right) => left.localeCompare(right));
}

export async function listFmModelFiles(root: string): Promise<string[]> {
  const absoluteRoot = resolve(root, FM_MODEL_ROOT);
  try {
    const files = await listFiles(absoluteRoot);
    return files.map((path) => `${FM_MODEL_ROOT}/${path}`);
  } catch {
    return [];
  }
}

export async function replaceFmModel(
  options: RuntimeOptions & { files: FmModelFile[] },
): Promise<FmValidationResult & { files: string[] }> {
  const files = normalizeFmModelFiles(options.files);
  const stagingParent = resolve(options.root, '.evidence', 'staging');
  await mkdir(stagingParent, { recursive: true });
  const staging = await mkdtemp(join(stagingParent, 'fm-model-'));
  try {
    await Promise.all(
      ['entities', 'fulfillments', 'relationships', 'rules'].map((directory) =>
        mkdir(join(staging, directory), { recursive: true }),
      ),
    );
    for (const file of files) {
      const output = join(staging, ...file.path.split('/'));
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, file.content, 'utf8');
    }
    const validation = await validateFmModel({ ...options, modelDir: staging });
    if (!validation.passed) return { ...validation, files: [] };

    const target = resolve(options.root, FM_MODEL_ROOT);
    const backup = `${target}.backup`;
    await mkdir(dirname(target), { recursive: true });
    await rm(backup, { recursive: true, force: true });
    let hadTarget = false;
    try {
      await stat(target);
      hadTarget = true;
      await rename(target, backup);
    } catch {
      hadTarget = false;
    }
    try {
      await rename(staging, target);
      await rm(backup, { recursive: true, force: true });
    } catch (error) {
      if (hadTarget) await rename(backup, target);
      throw error;
    }
    return {
      ...validation,
      files: await listFmModelFiles(options.root),
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
