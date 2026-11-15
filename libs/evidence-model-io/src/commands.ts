import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_MODEL_BUNDLE_FILE,
  buildFmCheckReport,
  compiledDocument,
  derivedTraceability,
  isModelBundlePath,
  stringifyModelJson,
} from '@evidence-poc/evidence-model-core';

import {
  MODEL_DIRECTORY,
  modelDigestOf,
  packModelDirectory,
  readModelBundle,
  readModelRoot,
  readModelRootBytes,
  unpackModelBundle,
  writeModelBundle,
} from './index.js';

export interface ModelCommandOptions {
  target?: string;
  out?: string;
  scopes: readonly string[];
  compact: boolean;
  sortKeys: boolean;
  json: boolean;
}

export interface ModelCommandContext {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** Shared operations for the unified CLI and deprecated model binary. */
export const runModelCommand = async (
  command: string,
  parsed: ModelCommandOptions,
  context: ModelCommandContext,
): Promise<number> => {
  const resolve = (...parts: string[]) => path.resolve(context.cwd, ...parts);
  const stdout = (text: string) => context.stdout(text.trimEnd());
  const stderr = (text: string) => context.stderr(text.trimEnd());
  const bundleNameFor = (modelId: string | undefined): string =>
    modelId === undefined || modelId === ''
      ? DEFAULT_MODEL_BUNDLE_FILE
      : `${modelId.replaceAll('.', '-')}.evidence.json`;

  /** Absolute bundle path `pack` writes when `--out` is omitted. */
  const defaultBundlePath = (
    modelDirectory: string,
    modelId: string | undefined,
  ): string => path.join(modelDirectory, bundleNameFor(modelId));

  const printIssues = (
    issues: readonly { path: string; message: string }[],
  ) => {
    for (const issue of issues) {
      stdout(`• ${issue.path}: ${issue.message}\n`);
    }
  };

  const runPack = async (parsed: ModelCommandOptions): Promise<number> => {
    const target = parsed.target;

    if (target === undefined) {
      stderr('pack 需要一个模型目录。\n\n');

      return 2;
    }

    const modelDirectory = resolve(target);
    const { bundle, issues } = await packModelDirectory(modelDirectory);
    if (issues.length > 0) {
      printIssues(issues);
      return 1;
    }
    const outPath =
      parsed.out === undefined
        ? defaultBundlePath(modelDirectory, bundle.manifest.id)
        : resolve(parsed.out);

    const result = await writeModelBundle(outPath, bundle, {
      ...(parsed.sortKeys ? { sortKeys: true } : {}),
    });

    stdout(
      `${result.written ? '已写入' : '已是最新'} ${outPath} (${result.bytes} 字节)\n`,
    );
    stdout(
      `对象: ${bundle.entities.length} 实体 / ${bundle.relationships.length} 关系 / ${bundle.rules.length} 规则` +
        `\n`,
    );

    if (issues.length > 0) {
      stdout('\n打包时发现的问题（已按原样写入，未修正）：\n');
      printIssues(issues);

      return 1;
    }

    return 0;
  };

  const runUnpack = async (parsed: ModelCommandOptions): Promise<number> => {
    const target = parsed.target;

    if (target === undefined) {
      stderr('unpack 需要一个 *.evidence.json 文件。\n\n');

      return 2;
    }

    const file = resolve(target);

    if (!isModelBundlePath(file)) {
      stderr(`不是单文件模型（应以 .evidence.json 结尾）：${file}\n`);

      return 2;
    }

    const outRoot =
      parsed.out === undefined ? resolve(MODEL_DIRECTORY) : resolve(parsed.out);
    const { issues, result } = await unpackModelBundle(file, outRoot, {
      ...(parsed.sortKeys ? { sortKeys: true } : {}),
    });

    stdout(
      `已还原到 ${outRoot}：写入 ${result.written.length} 个文件，保持不变 ${result.unchanged.length} 个。\n`,
    );

    if (issues.length > 0) {
      stdout('\n单文件中的问题（已写出，未修正）：\n');
      printIssues(issues);

      return 1;
    }

    return 0;
  };

  const runInspect = async (parsed: ModelCommandOptions): Promise<number> => {
    const target = parsed.target;

    if (target === undefined) {
      stderr('inspect 需要一个文件或目录。\n\n');

      return 2;
    }

    const absolute = resolve(target);
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
      issues: parsedModel.issues,
    };

    if (parsed.json) {
      stdout(`${JSON.stringify(summary, null, 2)}\n`);

      return parsedModel.issues.length > 0 ? 1 : 0;
    }

    stdout(
      `${summary.kind === 'bundle' ? '单文件' : '目录'} ${absolute}\n` +
        `模型: ${summary.modelName} (${summary.modelId} v${summary.modelVersion})\n` +
        `对象: ${summary.entities} 实体 / ${summary.relationships} 关系 / ${summary.rules} 规则` +
        `\n`,
    );

    if (summary.issues.length > 0) {
      stdout('\n问题:\n');
      printIssues(summary.issues);

      return 1;
    }

    stdout('未发现问题。\n');

    return 0;
  };

  const printCheckSummary = (report: {
    valid: boolean;
    consistent: boolean;
    complete: boolean | null;
    gaps: readonly string[];
    errors: readonly string[];
    advisories: readonly { entityId: string; message: string }[];
    testExampleCount: number;
    modelDigest: string;
  }): void => {
    stdout(
      `一致性: ${report.consistent ? '通过' : '未通过'}` +
        (report.complete === null
          ? ''
          : ` · 范围完整性: ${report.complete ? '通过' : '未通过'}`) +
        `\n内联测试样例: ${report.testExampleCount}（未执行 HTTP 验收）` +
        `\n模型摘要: ${report.modelDigest}\n`,
    );

    if (report.errors.length > 0) {
      stdout('\n阻塞问题:\n');

      for (const message of report.errors) {
        stdout(`• ${message}\n`);
      }
    }

    if (report.gaps.length > 0) {
      stdout('\n范围缺口（警告）:\n');

      for (const message of report.gaps) {
        stdout(`• ${message}\n`);
      }
    }

    if (report.advisories.length > 0) {
      stdout('\n建模建议（不阻断）:\n');

      for (const advisory of report.advisories) {
        stdout(`• ${advisory.entityId}: ${advisory.message}\n`);
      }
    }
  };

  /**
   * Runs the same check the desktop and the agent tool run.
   *
   * It is the command-line face of \`buildFmCheckReport\`: a caller without the app
   * gets one report, one exit code and the same digest, so a hand-off is never
   * decided on a second opinion.
   */
  const runCheck = async (parsed: ModelCommandOptions): Promise<number> => {
    const target = parsed.target;

    if (target === undefined) {
      stderr('check 需要一个模型目录。\n\n');

      return 2;
    }

    const modelRoot = resolve(target);

    if (isModelBundlePath(modelRoot)) {
      stderr('check 读取 .evidence/fm 目录；单文件请先 unpack 成目录。\n');

      return 2;
    }

    const [{ bundle, issues }, bytes] = await Promise.all([
      readModelRoot(modelRoot),
      readModelRootBytes(modelRoot),
    ]);
    const sourceIssues = issues.map(
      (issue) => `${issue.path}: ${issue.message}`,
    );
    const digest = modelDigestOf(
      bytes.map((file) => ({ path: file.path, content: file.bytes })),
    );
    const current = await readModelRootBytes(modelRoot);
    const currentDigest = modelDigestOf(
      current.map((file) => ({ path: file.path, content: file.bytes })),
    );
    const { report } = buildFmCheckReport({
      model: bundle,
      sourceIssues,
      modelDigest: digest,
      currentDigest: () => currentDigest,
      ...(parsed.scopes.length === 0 ? {} : { scopeRefs: parsed.scopes }),
    });

    if (parsed.json) {
      stdout(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      printCheckSummary(report);
    }

    return report.valid ? 0 : 1;
  };

  /** Reads a model root once, refusing the bundle a derived command cannot use. */
  const readDerivedInputs = async (
    parsed: ModelCommandOptions,
    command: string,
  ): Promise<
    | { ok: false }
    | {
        ok: true;
        modelRoot: string;
        model: Awaited<ReturnType<typeof readModelRoot>>;
      }
  > => {
    const target = parsed.target;

    if (target === undefined) {
      stderr(`${command} 需要一个模型目录。\n\n`);

      return { ok: false };
    }

    const modelRoot = resolve(target);

    if (isModelBundlePath(modelRoot)) {
      stderr(`${command} 读取 .evidence/fm 目录；单文件请先 unpack 成目录。\n`);

      return { ok: false };
    }

    return { ok: true, modelRoot, model: await readModelRoot(modelRoot) };
  };

  /** Fails when the model has file-level or consistency problems. */
  const ensureCheckable = (
    model: Awaited<ReturnType<typeof readModelRoot>>,
  ): boolean => {
    const sourceIssues = model.issues.map(
      (issue) => `${issue.path}: ${issue.message}`,
    );
    const result = buildFmCheckReport({
      model: model.bundle,
      sourceIssues,
      modelDigest: modelDigestOf([]),
    });

    if (result.report.valid) {
      return true;
    }

    stderr('模型未通过一致性检查，已中止：\n');

    for (const message of result.report.errors) {
      stderr(`- ${message}\n`);
    }

    return false;
  };

  const writeJsonReport = async (
    target: string,
    value: unknown,
    compact: boolean,
    sortKeys: boolean,
  ): Promise<void> => {
    const text = compact
      ? `${JSON.stringify(value)}\n`
      : stringifyModelJson(value, { ...(sortKeys ? { sortKeys: true } : {}) });

    await mkdir(path.dirname(resolve(target)), { recursive: true });
    await writeFile(resolve(target), text, 'utf8');
    stdout(`已写入 ${resolve(target)}\n`);
  };

  const runCompile = async (parsed: ModelCommandOptions): Promise<number> => {
    const inputs = await readDerivedInputs(parsed, 'compile');

    if (!inputs.ok) {
      return 2;
    }

    if (parsed.out === undefined) {
      stderr('compile 需要 --out <文件>。\n');

      return 2;
    }

    if (!ensureCheckable(inputs.model)) {
      return 1;
    }

    await writeJsonReport(
      parsed.out,
      compiledDocument(inputs.model.bundle),
      parsed.compact,
      parsed.sortKeys,
    );

    return 0;
  };

  const runLineage = async (parsed: ModelCommandOptions): Promise<number> => {
    const inputs = await readDerivedInputs(parsed, 'lineage');

    if (!inputs.ok) {
      return 2;
    }

    if (parsed.out === undefined) {
      stderr('lineage 需要 --out <文件>。\n');

      return 2;
    }

    if (!ensureCheckable(inputs.model)) {
      return 1;
    }

    await writeJsonReport(
      parsed.out,
      derivedTraceability(inputs.model.bundle),
      parsed.compact,
      parsed.sortKeys,
    );

    return 0;
  };

  switch (command) {
    case 'pack':
      return runPack(parsed);
    case 'unpack':
      return runUnpack(parsed);
    case 'inspect':
      return runInspect(parsed);
    case 'check':
      return runCheck(parsed);
    case 'compile':
      return runCompile(parsed);
    case 'lineage':
      return runLineage(parsed);
    default:
      stderr(`Unknown command: ${command}`);

      return 2;
  }
};
