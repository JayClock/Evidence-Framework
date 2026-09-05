import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  FM_MODEL_ROOT,
  listFmModelFiles,
  validateFmModel,
} from './modeling.ts';
import {
  projectEntryExists,
  projectPath,
  readText,
  writeJsonAtomic,
  writeTextAtomic,
} from './storage.ts';
import type {
  CheckItem,
  CheckReport,
  EvidenceConfig,
  EvidenceState,
} from './types.ts';
import { formatCheckReport, validateDocumentPhase } from './validation.ts';
import { extractStoryIds } from './workflow.ts';

const MAX_CAPTURED_OUTPUT = 12_000;

type ExecApi = Pick<ExtensionAPI, 'exec'>;

interface CommandOptions {
  pi: ExecApi;
  root: string;
  signal?: AbortSignal;
  timeoutMs: number;
}

interface QualityCheckOptions extends CommandOptions {
  commands: string[];
  onProgress?: (message: string) => void;
}

interface CodingCheckOptions extends CommandOptions {
  state: EvidenceState;
  config: EvidenceConfig;
  storyId: string;
  onProgress?: (message: string) => void;
}

interface ReviewCheckOptions extends CommandOptions {
  state: EvidenceState;
  config: EvidenceConfig;
  onProgress?: (message: string) => void;
}

type DomainCheckOptions = CommandOptions & {
  state: EvidenceState;
  onProgress?: (message: string) => void;
};

export interface CommandEvidence {
  command: string;
  exitCode: number;
  killed: boolean;
  output: string;
}

function safeName(value: string, fallback: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || fallback
  );
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_CAPTURED_OUTPUT) return output;
  return `${output.slice(0, MAX_CAPTURED_OUTPUT)}\n\n[truncated ${output.length - MAX_CAPTURED_OUTPUT} characters]`;
}

export async function runCommand(
  options: CommandOptions & { command: string },
): Promise<CommandEvidence> {
  const result = await options.pi.exec('bash', ['-lc', options.command], {
    cwd: options.root,
    timeout: options.timeoutMs,
    signal: options.signal,
  });
  return {
    command: options.command,
    exitCode: result.code,
    killed: Boolean(result.killed),
    output: truncateOutput(
      [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
    ),
  };
}

async function runQualityCommandItems(
  options: QualityCheckOptions,
): Promise<CheckItem[]> {
  const items: CheckItem[] = [];
  if (options.commands.length === 0) {
    items.push({
      name: 'quality commands',
      status: 'warn',
      details: '未配置质量命令；只能验证提交记录，不能证明代码可运行。',
    });
  }

  for (const command of options.commands) {
    options.onProgress?.(`正在运行：${command}`);
    const result = await runCommand({ ...options, command });
    let details = '命令执行成功';
    if (result.killed)
      details = `命令超时或被终止（退出码 ${result.exitCode}）`;
    else if (result.exitCode !== 0) details = `命令退出码 ${result.exitCode}`;
    items.push({
      name: command,
      command,
      status: result.exitCode === 0 && !result.killed ? 'pass' : 'fail',
      exitCode: result.exitCode,
      details,
      output: result.output,
    });
    if (result.exitCode !== 0 || result.killed) break;
  }
  return items;
}

export async function persistCheckReport(
  root: string,
  report: CheckReport,
): Promise<{ jsonPath: string; markdownPath: string }> {
  const phase = safeName(report.phase, 'phase');
  const subject = safeName(report.subject, phase);
  const stem = `${phase}-${subject}-round-${report.round}-${safeName(report.createdAt, 'time')}`;
  const jsonPath = `reports/${stem}.json`;
  const markdownPath = `reports/${stem}.md`;
  await Promise.all([
    writeJsonAtomic(root, jsonPath, report),
    writeTextAtomic(root, markdownPath, formatCheckReport(report)),
  ]);
  return { jsonPath, markdownPath };
}

export async function runDocumentChecks(
  root: string,
  state: EvidenceState,
): Promise<{ report: CheckReport; jsonPath: string; markdownPath: string }> {
  const report = await validateDocumentPhase(root, state);
  return { report, ...(await persistCheckReport(root, report)) };
}

async function runModelingCheckItems(
  options: DomainCheckOptions,
): Promise<CheckItem[]> {
  const { modeling } = options.state;
  if (modeling.applicable !== true) {
    return [
      {
        name: 'FM applicability',
        status: modeling.applicable === false ? 'warn' : 'fail',
        details:
          modeling.applicable === false
            ? (modeling.rationale ?? '当前领域不适用履约建模')
            : '缺少履约建模适用性决策',
      },
    ];
  }
  const validation = await validateFmModel({
    pi: options.pi,
    root: options.root,
    modelDir: projectPath(options.root, FM_MODEL_ROOT),
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    onProgress: options.onProgress,
  });
  modeling.machineValidated = validation.machineValidated;
  modeling.simulationPassed = validation.simulationPassed;
  modeling.files = await listFmModelFiles(options.root);
  return validation.passed
    ? validation.items
    : [
        ...validation.items,
        {
          name: 'FM validation',
          status: 'fail',
          details: '履约模型校验未通过',
        },
      ];
}

export async function runDomainChecks(
  options: DomainCheckOptions,
): Promise<{ report: CheckReport; jsonPath: string; markdownPath: string }> {
  const documentReport = await validateDocumentPhase(
    options.root,
    options.state,
  );
  if (!documentReport.passed) {
    return {
      report: documentReport,
      ...(await persistCheckReport(options.root, documentReport)),
    };
  }

  const modelItems = await runModelingCheckItems(options);
  const items = [...documentReport.items, ...modelItems];
  const report: CheckReport = {
    ...documentReport,
    passed: items.every((item) => item.status !== 'fail'),
    warnings: items.filter((item) => item.status === 'warn').length,
    createdAt: new Date().toISOString(),
    items,
  };
  return {
    report,
    ...(await persistCheckReport(options.root, report)),
  };
}

export async function runCodingChecks(
  options: CodingCheckOptions,
): Promise<{ report: CheckReport; jsonPath: string; markdownPath: string }> {
  const items = await runQualityCommandItems({
    pi: options.pi,
    root: options.root,
    commands: options.config.qualityCommands,
    timeoutMs: options.config.commandTimeoutMs,
    signal: options.signal,
    onProgress: options.onProgress,
  });
  const report: CheckReport = {
    phase: 'coding',
    subject: options.storyId,
    round: options.state.round,
    passed: items.every((item) => item.status !== 'fail'),
    warnings: items.filter((item) => item.status === 'warn').length,
    createdAt: new Date().toISOString(),
    items,
  };
  return { report, ...(await persistCheckReport(options.root, report)) };
}

export async function runReviewChecks(
  options: ReviewCheckOptions,
): Promise<{ report: CheckReport; jsonPath: string; markdownPath: string }> {
  const documentReport = await validateDocumentPhase(
    options.root,
    options.state,
  );
  if (!documentReport.passed) {
    return {
      report: documentReport,
      ...(await persistCheckReport(options.root, documentReport)),
    };
  }

  const [backlog, finalReview] = await Promise.all([
    readText(options.root, 'artifacts/04-planning/sprint-1-backlog.md'),
    readText(options.root, 'artifacts/06-review/final-review.md'),
  ]);
  const storyIds = extractStoryIds(backlog);
  const missingStoryIds = storyIds.filter(
    (storyId) => !finalReview.includes(storyId),
  );
  const storyRecords = await Promise.all(
    storyIds.map(async (storyId) => ({
      storyId,
      exists: await projectEntryExists(
        options.root,
        `artifacts/05-coding/${storyId}.md`,
      ),
    })),
  );
  const missingStoryRecords = storyRecords.filter((item) => !item.exists);
  const traceabilityProblems: string[] = [];
  if (storyIds.length === 0)
    traceabilityProblems.push('Sprint 1 Backlog 没有 US-xxx');
  if (missingStoryIds.length > 0)
    traceabilityProblems.push(`审查报告缺少：${missingStoryIds.join(', ')}`);
  if (missingStoryRecords.length > 0) {
    traceabilityProblems.push(
      `编码记录缺少：${missingStoryRecords.map((item) => item.storyId).join(', ')}`,
    );
  }
  const traceabilityPassed = traceabilityProblems.length === 0;
  const traceabilityItem: CheckItem = {
    name: 'Sprint 1 story traceability',
    status: traceabilityPassed ? 'pass' : 'fail',
    details: traceabilityPassed
      ? `${storyIds.length} 个故事均有编码记录并出现在最终审查报告中`
      : traceabilityProblems.join('；'),
  };
  if (!traceabilityPassed) {
    const items = [...documentReport.items, traceabilityItem];
    const report: CheckReport = {
      ...documentReport,
      passed: false,
      warnings: items.filter((item) => item.status === 'warn').length,
      createdAt: new Date().toISOString(),
      items,
    };
    return {
      report,
      ...(await persistCheckReport(options.root, report)),
    };
  }

  const modelingItems = await runModelingCheckItems({
    ...options,
    timeoutMs: options.config.commandTimeoutMs,
  });
  if (modelingItems.some((item) => item.status === 'fail')) {
    const items = [...documentReport.items, traceabilityItem, ...modelingItems];
    const report: CheckReport = {
      ...documentReport,
      passed: false,
      warnings: items.filter((item) => item.status === 'warn').length,
      createdAt: new Date().toISOString(),
      items,
    };
    return {
      report,
      ...(await persistCheckReport(options.root, report)),
    };
  }

  const qualityItems = await runQualityCommandItems({
    pi: options.pi,
    root: options.root,
    commands: options.config.qualityCommands,
    timeoutMs: options.config.commandTimeoutMs,
    signal: options.signal,
    onProgress: options.onProgress,
  });
  const items = [
    ...documentReport.items,
    traceabilityItem,
    ...modelingItems,
    ...qualityItems,
  ];
  const report: CheckReport = {
    ...documentReport,
    passed: items.every((item) => item.status !== 'fail'),
    warnings: items.filter((item) => item.status === 'warn').length,
    createdAt: new Date().toISOString(),
    items,
  };
  return { report, ...(await persistCheckReport(options.root, report)) };
}
