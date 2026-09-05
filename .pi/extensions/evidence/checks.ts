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
import { assertTestingInputs } from './test-plan.ts';
import { gateArtifactPaths, hashArtifacts } from './gates.ts';
import { loadStoryRecord, validateStoryEvidence } from './testing-evidence.ts';
import { hasInvalidTestOutput, testFileHashes } from './test-files.ts';
import type { StoryRecord, TestStory } from './testing-schema.ts';

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
  record?: StoryRecord;
  verifyChanges?: () => Promise<void>;
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

async function replayStoryChecks(
  options: CommandOptions & { onProgress?: (message: string) => void },
  story: TestStory,
): Promise<CheckItem[]> {
  const items: CheckItem[] = [];
  for (const task of story.tasks) {
    for (const check of task.checks) {
      const before = await testFileHashes(options.root, check.testFiles);
      options.onProgress?.(`重跑 ${task.id}/${check.id}：${check.command}`);
      const result = await runCommand({ ...options, command: check.command });
      const after = await testFileHashes(options.root, check.testFiles);
      const passed =
        result.exitCode === 0 &&
        !result.killed &&
        !hasInvalidTestOutput(result.output) &&
        JSON.stringify(before) === JSON.stringify(after);
      items.push({
        name: `${task.id}/${check.id}`,
        status: passed ? 'pass' : 'fail',
        details: passed
          ? '计划检查重新通过'
          : '计划检查失败、没有测试或测试文件已改变',
        ...result,
      });
      if (!passed) return items;
    }
  }
  return items;
}

export async function runCodingChecks(
  options: CodingCheckOptions,
): Promise<{ report: CheckReport; jsonPath: string; markdownPath: string }> {
  const items: CheckItem[] = [];
  try {
    await options.verifyChanges?.();
    const plan = await assertTestingInputs(options.root, options.state);
    const story = plan.stories.find((story) => story.id === options.storyId);
    if (!story) throw new Error('故事不在已批准计划中');
    const record =
      options.record ??
      (await loadStoryRecord(options.root, options.state, options.storyId));
    if (
      record.runId !== options.state.runId ||
      record.storyId !== story.id ||
      record.planDigest !== options.state.coding.planDigest
    )
      throw new Error('编码记录运行/契约不一致');
    validateStoryEvidence(
      story,
      record.cycles,
      record.verifications,
      record.revisionStart,
    );
    const sourcePaths = [
      ...record.changedFiles,
      ...story.tasks.flatMap((task) =>
        task.checks.flatMap((check) => check.testFiles),
      ),
    ];
    const sourceDigest = await hashArtifacts(options.root, sourcePaths);
    items.push({
      name: '工序与验收证据',
      status: 'pass',
      details: `${record.cycles.length} 个循环，全部适用任务有证据`,
    });
    items.push(...(await replayStoryChecks(options, story)));
    await assertTestingInputs(options.root, options.state);
    if (items.every((item) => item.status !== 'fail'))
      items.push(
        ...(await runQualityCommandItems({
          ...options,
          commands: options.config.qualityCommands,
          timeoutMs: options.config.commandTimeoutMs,
        })),
      );
    await assertTestingInputs(options.root, options.state);
    if (sourceDigest !== (await hashArtifacts(options.root, sourcePaths)))
      throw new Error('检查期间源码/测试发生变化，不能记录通过证据');
    await options.verifyChanges?.();
  } catch (error) {
    items.push({
      name: '工序与验收证据',
      status: 'fail',
      details: (error as Error).message,
    });
  }
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

  let stories: TestStory[];
  try {
    stories = (await assertTestingInputs(options.root, options.state)).stories;
  } catch (error) {
    const report: CheckReport = {
      ...documentReport,
      passed: false,
      items: [
        ...documentReport.items,
        {
          name: '测试计划追溯',
          status: 'fail',
          details: (error as Error).message,
        },
      ],
    };
    return { report, ...(await persistCheckReport(options.root, report)) };
  }
  const finalReview = await readText(
    options.root,
    'artifacts/06-review/final-review.md',
  );
  const storyIds = stories.map((story) => story.id);
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

  const proofPaths = gateArtifactPaths(options.state);
  const proofDigest = await hashArtifacts(options.root, proofPaths);
  const testingItems: CheckItem[] = [];
  try {
    for (const story of stories) {
      const record = await loadStoryRecord(
        options.root,
        options.state,
        story.id,
      );
      if (!record.passed) throw new Error(`${story.id} 尚无通过的编码记录`);
      validateStoryEvidence(
        story,
        record.cycles,
        record.verifications,
        record.revisionStart,
      );
      if (story.scenarioIds.some((id) => !finalReview.includes(id)))
        throw new Error(`${story.id} 的验收场景未出现在审查报告中`);
      testingItems.push(...(await replayStoryChecks(options, story)));
      if (testingItems.some((item) => item.status === 'fail')) break;
    }
    await assertTestingInputs(options.root, options.state);
  } catch (error) {
    testingItems.push({
      name: '逐故事工序证据',
      status: 'fail',
      details: (error as Error).message,
    });
  }
  if (testingItems.some((item) => item.status === 'fail')) {
    const report: CheckReport = {
      ...documentReport,
      passed: false,
      items: [
        ...documentReport.items,
        traceabilityItem,
        ...modelingItems,
        ...testingItems,
      ],
    };
    return { report, ...(await persistCheckReport(options.root, report)) };
  }

  const qualityItems = await runQualityCommandItems({
    pi: options.pi,
    root: options.root,
    commands: options.config.qualityCommands,
    timeoutMs: options.config.commandTimeoutMs,
    signal: options.signal,
    onProgress: options.onProgress,
  });
  try {
    await assertTestingInputs(options.root, options.state);
    if (proofDigest !== (await hashArtifacts(options.root, proofPaths)))
      throw new Error('Review 检查期间代码或证据发生变化');
  } catch (error) {
    testingItems.push({
      name: 'Review 证据一致性',
      status: 'fail',
      details: (error as Error).message,
    });
  }
  const items = [
    ...documentReport.items,
    traceabilityItem,
    ...modelingItems,
    ...testingItems,
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
