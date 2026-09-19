import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Skills declare Python 3.10+; system python3 is often older and without the
// declared dependencies, so npm entry points resolve an interpreter first.
export const MINIMUM_PYTHON = [3, 10];
export const DEFAULT_CANDIDATES = [
  'python3.13',
  'python3.12',
  'python3.11',
  'python3.10',
  'python3',
  'python',
];
export const MISSING_INTERPRETER_EXIT = 4;
export const USAGE_EXIT = 2;
export const USAGE = `用法：node tools/python/python.mjs [--require 模块,模块] [--print] -- <python 参数…>

解析 Python ${MINIMUM_PYTHON.join('.')}+ 解释器并转发参数；--require 要求解释器能 import 指定模块。
优先使用 PYTHON 环境变量；否则按 ${DEFAULT_CANDIDATES.join(' → ')} 顺序选择。
解析失败时输出候选与安装建议，并以退出码 ${MISSING_INTERPRETER_EXIT} 结束。`;

const PROBE = [
  'import importlib.util, sys',
  "print('%d.%d' % sys.version_info[:2])",
  "print(','.join(name for name in sys.argv[1:] if importlib.util.find_spec(name) is None))",
].join('\n');

export function parseVersion(text) {
  const match = /^(\d+)\.(\d+)/.exec(String(text ?? '').trim());
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function meetsMinimum(version, minimum = MINIMUM_PYTHON) {
  if (!version) return false;
  const [major, minor] = version;
  return major > minimum[0] || (major === minimum[0] && minor >= minimum[1]);
}

export function probeInterpreter(candidate, modules = [], spawn = spawnSync) {
  const result = spawn(candidate, ['-c', PROBE, ...modules], {
    encoding: 'utf8',
  });
  const available = !result.error && result.status === 0;
  const lines = available ? String(result.stdout ?? '').split('\n') : [];
  const version = available ? parseVersion(lines[0]) : null;
  const meetsVersion = meetsMinimum(version);
  const missing = available && meetsVersion ? (lines[1] ?? '') : '';
  return {
    candidate,
    version,
    meetsVersion,
    missing: missing ? missing.split(',').filter(Boolean) : [],
    ok: meetsVersion && !missing,
  };
}

function describeFailure(probe) {
  if (!probe.version) return `${probe.candidate}：未找到或无法执行`;
  if (!probe.meetsVersion) {
    return `${probe.candidate}：版本 ${probe.version.join('.')} 低于 ${MINIMUM_PYTHON.join('.')}`;
  }
  if (probe.missing.length) {
    return `${probe.candidate}：缺少 ${probe.missing.join('、')}`;
  }
  return `${probe.candidate}：不可用`;
}

export function interpreterAdvice({ override, modules, probes }) {
  const requirement = [
    `Python ${MINIMUM_PYTHON.join('.')}+`,
    ...(modules.length ? [`可 import ${modules.join('、')}`] : []),
  ].join('，');
  const lines = [
    '无法找到满足要求的 Python 解释器。',
    `- 要求：${requirement}`,
    `- 候选：${probes.map(describeFailure).join('；')}`,
  ];
  if (modules.length) {
    lines.push(
      '- 安装依赖：<解释器> -m pip install -r .agents/skills/evidence-fm/requirements.txt',
      '  （其余 Skill 目录另有自己的 requirements.txt）',
    );
  }
  lines.push(
    override
      ? `- PYTHON=${override} 已显式指定解释器，解析失败时不回退到其他候选。`
      : '- 可用 PYTHON=/absolute/path/to/python3.12 显式指定解释器。',
  );
  return lines.join('\n');
}

export function selectInterpreter(options = {}) {
  const {
    candidates = DEFAULT_CANDIDATES,
    env = process.env,
    modules = [],
    spawn = spawnSync,
  } = options;
  const override = String(env.PYTHON ?? '').trim();
  const ordered = override ? [override] : candidates;
  const probes = ordered.map((candidate) =>
    probeInterpreter(candidate, modules, spawn),
  );
  const match = probes.find((probe) => probe.ok);
  if (match) {
    return {
      status: 'ok',
      interpreter: match.candidate,
      version: match.version,
      modules,
    };
  }
  return {
    status: 'error',
    message: interpreterAdvice({ override, modules, probes }),
  };
}

export function parseArguments(argv = []) {
  const modules = [];
  let print = false;
  const passthrough = [];
  const addModules = (value) => {
    for (const name of String(value ?? '').split(',')) {
      const trimmed = name.trim();
      if (trimmed) modules.push(trimmed);
    }
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') {
      passthrough.push(...argv.slice(index + 1));
      break;
    }
    if (argument === '--print') print = true;
    else if (argument === '--require') addModules(argv[++index]);
    else if (argument.startsWith('--require=')) {
      addModules(argument.slice('--require='.length));
    } else passthrough.push(argument);
  }
  return { print, modules, passthrough };
}

export function main(
  argv = process.argv.slice(2),
  {
    env = process.env,
    spawn = spawnSync,
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  const { print, modules, passthrough } = parseArguments(argv);
  const selection = selectInterpreter({ env, modules, spawn });
  if (selection.status !== 'ok') {
    stderr.write(`${selection.message}\n`);
    return MISSING_INTERPRETER_EXIT;
  }
  if (print) {
    stdout.write(`${selection.interpreter}\n`);
    return 0;
  }
  if (passthrough.length === 0) {
    stderr.write(`${USAGE}\n`);
    return USAGE_EXIT;
  }
  const result = spawn(selection.interpreter, passthrough, {
    stdio: 'inherit',
  });
  if (result.error) {
    stderr.write(
      `无法执行 ${selection.interpreter}: ${result.error.message}\n`,
    );
    return MISSING_INTERPRETER_EXIT;
  }
  return typeof result.status === 'number' ? result.status : 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
