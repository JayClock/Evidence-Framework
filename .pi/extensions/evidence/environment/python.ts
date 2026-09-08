import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { FM_SKILL_ROOT } from '../contracts/paths.ts';
import type { RuntimeOptions } from '../modeling/fm/contracts.ts';
import { combinedOutput } from '../modeling/fm/output.ts';
import { runProcess } from './commands.ts';

const RUNTIME_ROOT = 'node_modules/.cache/evidence-fm-runtime';

function runtimePython(root: string): string {
  const executable = process.platform === 'win32' ? 'python.exe' : 'python';
  const directory = process.platform === 'win32' ? 'Scripts' : 'bin';
  return resolve(root, RUNTIME_ROOT, directory, executable);
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

export async function ensureRuntime(options: RuntimeOptions): Promise<string> {
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
