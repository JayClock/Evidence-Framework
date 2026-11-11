#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_MODEL_BUNDLE_FILE,
  MODEL_DIRECTORY,
  isModelBundlePath,
  packModelDirectory,
  readModelBundle,
  unpackModelBundle,
  writeModelBundle,
} from './index.js';

const USAGE = `Evidence 业务模型单文件打包

用法:
  evidence-model pack <模型目录> [--out <文件>] [--sort-keys]
      把 .evidence/fm 源树打成一个 *.evidence.json 单文件。
      默认输出到 <模型目录>/<模型 id>.evidence.json。

  evidence-model unpack <文件> [--out <目录>] [--sort-keys]
      把一个单文件还原成 model.json + entities/ relationships/ rules/ 目录。
      默认还原到当前目录下的 ${MODEL_DIRECTORY}。

  evidence-model inspect <文件|目录> [--json]
      只读打印清单、对象计数与文件级问题，不写任何文件。

选项:
  --out <path>   输出路径；缺省见上面的默认值
  --sort-keys    输出时按对象键名排序，便于稳定 diff
  --json         inspect 输出原始 JSON
  -h, --help     显示本帮助
`;

interface ParsedArguments {
  command: string | undefined;
  target: string | undefined;
  out: string | undefined;
  sortKeys: boolean;
  json: boolean;
  help: boolean;
}

const parseArguments = (argv: readonly string[]): ParsedArguments => {
  const positional: string[] = [];
  let out: string | undefined;
  let sortKeys = false;
  let json = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === undefined) {
      continue;
    }

    if (argument === '-h' || argument === '--help') {
      help = true;
      continue;
    }

    if (argument === '--sort-keys') {
      sortKeys = true;
      continue;
    }

    if (argument === '--json') {
      json = true;
      continue;
    }

    if (argument === '--out' || argument === '-o') {
      index += 1;
      out = argv[index];
      continue;
    }

    if (argument.startsWith('--out=')) {
      out = argument.slice('--out='.length);
      continue;
    }

    positional.push(argument);
  }

  return {
    command: positional[0],
    target: positional[1],
    out,
    sortKeys,
    json,
    help,
  };
};

const bundleNameFor = (modelId: string | undefined): string =>
  modelId === undefined || modelId === ''
    ? DEFAULT_MODEL_BUNDLE_FILE
    : `${modelId.replaceAll('.', '-')}.evidence.json`;

/** Absolute bundle path `pack` writes when `--out` is omitted. */
const defaultBundlePath = (
  modelDirectory: string,
  modelId: string | undefined,
): string => path.join(modelDirectory, bundleNameFor(modelId));

const printIssues = (issues: readonly { path: string; message: string }[]) => {
  for (const issue of issues) {
    process.stdout.write(`• ${issue.path}: ${issue.message}\n`);
  }
};

const runPack = async (parsed: ParsedArguments): Promise<number> => {
  const target = parsed.target;

  if (target === undefined) {
    process.stderr.write('pack 需要一个模型目录。\n\n');

    return 2;
  }

  const modelDirectory = path.resolve(target);
  const { bundle, issues } = await packModelDirectory(modelDirectory);
  const outPath =
    parsed.out === undefined
      ? defaultBundlePath(modelDirectory, bundle.manifest.id)
      : path.resolve(parsed.out);

  const result = await writeModelBundle(outPath, bundle, {
    ...(parsed.sortKeys ? { sortKeys: true } : {}),
  });

  process.stdout.write(
    `${result.written ? '已写入' : '已是最新'} ${outPath} (${result.bytes} 字节)\n`,
  );
  process.stdout.write(
    `对象: ${bundle.entities.length} 实体 / ${bundle.relationships.length} 关系 / ${bundle.rules.length} 规则` +
      `${
        bundle.validation === undefined
          ? ''
          : ` / ${bundle.validation.instances.length} 实例 / ${bundle.validation.scenarios.length} 场景`
      }\n`,
  );

  if (issues.length > 0) {
    process.stdout.write('\n打包时发现的问题（已按原样写入，未修正）：\n');
    printIssues(issues);

    return 1;
  }

  return 0;
};

const runUnpack = async (parsed: ParsedArguments): Promise<number> => {
  const target = parsed.target;

  if (target === undefined) {
    process.stderr.write('unpack 需要一个 *.evidence.json 文件。\n\n');

    return 2;
  }

  const file = path.resolve(target);

  if (!isModelBundlePath(file)) {
    process.stderr.write(
      `不是单文件模型（应以 .evidence.json 结尾）：${file}\n`,
    );

    return 2;
  }

  const outRoot =
    parsed.out === undefined
      ? path.resolve(MODEL_DIRECTORY)
      : path.resolve(parsed.out);
  const { issues, result } = await unpackModelBundle(file, outRoot, {
    ...(parsed.sortKeys ? { sortKeys: true } : {}),
  });

  process.stdout.write(
    `已还原到 ${outRoot}：写入 ${result.written.length} 个文件，保持不变 ${result.unchanged.length} 个。\n`,
  );

  if (issues.length > 0) {
    process.stdout.write('\n单文件中的问题（已写出，未修正）：\n');
    printIssues(issues);

    return 1;
  }

  return 0;
};

const runInspect = async (parsed: ParsedArguments): Promise<number> => {
  const target = parsed.target;

  if (target === undefined) {
    process.stderr.write('inspect 需要一个文件或目录。\n\n');

    return 2;
  }

  const absolute = path.resolve(target);
  const parsedModel = isModelBundlePath(absolute)
    ? await readModelBundle(absolute)
    : await packModelDirectory(absolute).then((packed) => ({
        document: packed.bundle,
        issues: packed.issues,
      }));

  const summary = {
    kind: isModelBundlePath(absolute) ? 'bundle' : 'directory',
    path: absolute,
    modelId: parsedModel.document.manifest.id,
    modelName: parsedModel.document.manifest.name,
    modelVersion: parsedModel.document.manifest.version,
    entities: parsedModel.document.entities.length,
    relationships: parsedModel.document.relationships.length,
    rules: parsedModel.document.rules.length,
    instances: parsedModel.document.validation?.instances.length ?? 0,
    scenarios: parsedModel.document.validation?.scenarios.length ?? 0,
    issues: parsedModel.issues,
  };

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

    return parsedModel.issues.length > 0 ? 1 : 0;
  }

  process.stdout.write(
    `${summary.kind === 'bundle' ? '单文件' : '目录'} ${absolute}\n` +
      `模型: ${summary.modelName} (${summary.modelId} v${summary.modelVersion})\n` +
      `对象: ${summary.entities} 实体 / ${summary.relationships} 关系 / ${summary.rules} 规则` +
      ` / ${summary.instances} 实例 / ${summary.scenarios} 场景\n`,
  );

  if (summary.issues.length > 0) {
    process.stdout.write('\n问题:\n');
    printIssues(summary.issues);

    return 1;
  }

  process.stdout.write('未发现问题。\n');

  return 0;
};

/** Runs one CLI invocation and returns the process exit code. */
export const runEvidenceModelCommand = async (
  argv: readonly string[],
): Promise<number> => {
  const parsed = parseArguments(argv);

  if (parsed.help || parsed.command === undefined) {
    process.stdout.write(USAGE);

    return parsed.command === undefined && !parsed.help ? 2 : 0;
  }

  switch (parsed.command) {
    case 'pack':
      return runPack(parsed);
    case 'unpack':
      return runUnpack(parsed);
    case 'inspect':
      return runInspect(parsed);
    default:
      process.stderr.write(`未知命令 ${parsed.command}。\n\n${USAGE}`);

      return 2;
  }
};

const invokedDirectly = (): boolean => {
  const entry = process.argv[1];

  if (entry === undefined) {
    return false;
  }

  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
};

if (invokedDirectly()) {
  process.exitCode = await runEvidenceModelCommand(process.argv.slice(2));
}
