import { rm } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  isToolCallEventType,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  runCodingChecks,
  runDocumentChecks,
  runModelingChecks,
  runReviewChecks,
} from './checks.ts';
import {
  createGate,
  hashArtifacts,
  recordGateDecision,
  refreshGate,
} from './gates.ts';
import { captureCodingBaseline, verifyCodingChanges } from './git.ts';
import { registerTddTools, withCodingLock } from './tdd-tools.ts';
import { assertTestingInputs, validateTestingArtifact } from './test-plan.ts';
import {
  requireCompleteStory,
  loadStoryRecord,
  saveStoryRecord,
} from './testing-evidence.ts';
import { isTestFile, isProductionSourceFile } from './test-files.ts';
import type { StoryRecord } from './testing-schema.ts';
import {
  FM_MODEL_ROOT,
  FM_STATUS_PATH,
  listFmModelFiles,
  replaceFmModel,
} from './modeling.ts';
import {
  getExpectedArtifact,
  getPhaseDefinition,
  isDocumentPhase,
} from './phases.ts';
import { buildCurrentPrompt, buildPhaseGuard } from './prompts.ts';
import {
  CONFIG_PATH,
  REQUIREMENTS_PATH,
  STATE_PATH,
  appendHistory,
  createInitialState,
  ensureWorkspace,
  loadConfig,
  loadState,
  pathExists,
  projectPath,
  readJson,
  relativeProjectPath,
  readText,
  removeWorkflowState,
  saveState,
  writeTextAtomic,
} from './storage.ts';
import type { CheckReport, EvidenceConfig, EvidenceState } from './types.ts';
import { normalizeMarkdown, validateArtifactContent } from './validation.ts';
import {
  advanceAfterApproval,
  currentCodingStory,
  moveBackOnePhase,
  requestRevision,
} from './workflow.ts';

import {
  DISCOVERY_TOOL_NAMES,
  collectAnswer,
  registerDiscoveryTools,
} from './discovery-tools.ts';
import { requireFinalizing, withModelingLock } from './discovery.ts';

const DOCUMENT_TOOLS = ['read', 'bash', 'evidence_submit_artifact'];
const MODELING_TOOLS = ['read', 'bash', 'evidence_submit_fm_model'];
const REVIEW_TOOLS = ['read', 'bash', 'evidence_submit_artifact'];
const CODING_TOOLS = [
  'read',
  'bash',
  'edit',
  'write',
  'evidence_tdd_red',
  'evidence_tdd_green',
  'evidence_complete_tdd_cycle',
  'evidence_verify_task',
  'evidence_complete_story',
];
const NORMAL_TOOLS = ['read', 'bash', 'edit', 'write'];
const PROTECTED_PATHS = [
  '.evidence/',
  '.pi/extensions/evidence/',
  '.pi/skills/',
  '.pi/evidence.json',
  'artifacts/',
  'reports/',
  'AGENTS.md',
  'docs/evidence.md',
];

function isAllowedReadOnlyShell(
  command: string,
  allowQualityCommands: boolean,
): boolean {
  const normalized = command.trim();
  if (!normalized || /[\n\r;|&><`]|\$\(/.test(normalized)) return false;
  if (
    /(?:^|\s)(?:--output|--update(?:Snapshot)?|-delete|-exec(?:dir)?|-ok(?:dir)?|-fprint0?|-fls)(?:\s|=|$)/i.test(
      normalized,
    )
  )
    return false;

  const inspectionCommands = [
    /^(?:pwd|ls|tree|rg|grep|head|tail|wc|sort|uniq|cut|cat)\b/,
    /^find\b/,
    /^git\s+(?:status|diff|show|log|ls-files|grep|rev-parse)\b/,
    /^(?:node|npm|java|javac|pi)\s+(?:--version|-version|--list-models)\b/,
  ];
  if (inspectionCommands.some((pattern) => pattern.test(normalized)))
    return true;
  if (!allowQualityCommands) return false;
  return [
    /^npm\s+test\b/,
    /^npm\s+run\s+(?:test|lint|build)(?::[\w-]+)?\b/,
    /^npx\s+(?:nx\s+(?:test|lint|build)|vitest(?:\s+run)?|jest)\b/,
    /^(?:pnpm|yarn)\s+(?:test|lint|build)\b/,
    /^(?:\.\/)?[\w./-]*gradlew(?:\.bat)?\s+(?:test|check|build)\b/,
    /^(?:\.\/)?[\w./-]*mvnw(?:\.cmd)?\s+(?:test|verify|package)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isProtectedPath(path: string): boolean {
  return PROTECTED_PATHS.some((protectedPath) => {
    const prefix = protectedPath.replace(/\/$/, '');
    return path === prefix || path.startsWith(`${prefix}/`);
  });
}

function isRuntimeGeneratedPath(path: string): boolean {
  return (
    path === STATE_PATH ||
    path.startsWith('reports/') ||
    path.startsWith('artifacts/gates/') ||
    /^artifacts\/05-coding\/US-\d{3}\.(?:md|json)$/.test(path)
  );
}

function phaseLabel(state: EvidenceState): string {
  if (state.phase === 'complete') return '已完成';
  return getPhaseDefinition(state.phase).label;
}

function subjectLabel(state: EvidenceState): string {
  if (state.phase === 'complete') return '全部流程';
  if (state.phase === 'modeling' && state.discovery.stage === 'discovering')
    return '业务上下文识别与发现';
  if (state.phase === 'coding')
    return currentCodingStory(state) ?? '等待解析 Sprint Backlog';
  return (
    getExpectedArtifact(state.phase, state.currentArtifactIndex)?.label ??
    phaseLabel(state)
  );
}

function statusIcon(status: EvidenceState['status']): string {
  switch (status) {
    case 'ready':
      return '○';
    case 'running':
      return '▶';
    case 'waiting_answer':
    case 'waiting_review':
      return '⏸';
    case 'blocked':
      return '✗';
    case 'complete':
      return '✓';
    default: {
      const exhaustiveStatus: never = status;
      return exhaustiveStatus;
    }
  }
}

function statusColor(
  status: EvidenceState['status'],
): 'accent' | 'error' | 'success' | 'warning' {
  switch (status) {
    case 'blocked':
      return 'error';
    case 'waiting_answer':
    case 'waiting_review':
      return 'warning';
    case 'complete':
      return 'success';
    default:
      return 'accent';
  }
}

function progressText(state: EvidenceState): string {
  if (state.phase === 'complete') return '5/5';
  if (state.phase === 'modeling' && state.discovery.stage === 'discovering')
    return `发现 v${state.discovery.revision} · ${state.discovery.path ?? '从业务叙述识别上下文'}`;
  if (state.phase === 'coding') {
    const total = state.coding.storyIds.length;
    const current =
      total === 0 ? 0 : Math.min(state.coding.currentStoryIndex + 1, total);
    return `${current}/${total || '?'} stories · ${state.coding.cycles.length} cycles · ${state.coding.tdd.binding?.taskId ?? state.coding.tdd.stage}`;
  }
  const total = getPhaseDefinition(state.phase).artifacts.length;
  const current =
    state.status === 'waiting_review'
      ? total
      : Math.min(state.currentArtifactIndex, total);
  return `${current}/${total} artifacts`;
}

function statusMarkdown(state: EvidenceState): string {
  const lines = [
    '# Evidence 状态',
    '',
    `- 项目：${state.projectName}`,
    `- 目标：${state.goal}`,
    `- 阶段：${phaseLabel(state)}（\`${state.phase}\`）`,
    `- 当前对象：${subjectLabel(state)}`,
    `- 状态：${statusIcon(state.status)} \`${state.status}\`${state.paused ? '（已暂停）' : ''}`,
    `- 轮次：${state.round}`,
    `- 进度：${progressText(state)}`,
    `- 最近报告：${state.lastReport ? `\`${state.lastReport}\`` : '无'}`,
    `- 待审核 Gate：${state.pendingGate ? `\`${state.pendingGate.path}\`` : '无'}`,
  ];
  if (state.phase === 'modeling')
    lines.push(
      `- 发现：${state.discovery.stage} / v${state.discovery.revision} / ${state.discovery.path ?? '尚无记录'}`,
    );
  if (state.status === 'waiting_answer')
    lines.push('- 下一步：`/evidence-answer`');
  if (state.phase === 'coding')
    lines.push(`- TDD 检查点：\`${state.coding.tdd.stage}\``);
  if (state.lastError) lines.push(`- 最近错误：${state.lastError}`);
  if (state.feedback) lines.push('', '## 当前反馈', '', state.feedback);
  return `${lines.join('\n')}\n`;
}

function sessionName(state: EvidenceState): string {
  if (state.phase === 'complete') return 'evidence:complete';
  const subject = state.phase === 'coding' ? currentCodingStory(state) : null;
  return `evidence:${state.phase}${subject ? `:${subject}` : ''}:r${state.round}`;
}

function updateUi(ctx: ExtensionContext, state: EvidenceState | null): void {
  if (!state) {
    ctx.ui.setStatus('evidence', undefined);
    ctx.ui.setWidget('evidence', undefined);
    return;
  }

  const color = statusColor(state.status);
  const paused = state.paused ? ' paused' : '';
  ctx.ui.setStatus(
    'evidence',
    ctx.ui.theme.fg(
      color,
      `${statusIcon(state.status)} evidence:${state.phase}${paused}`,
    ),
  );
  ctx.ui.setWidget(
    'evidence',
    (_tui, theme) => ({
      render: () => [
        theme.fg(
          'muted',
          `Evidence · ${phaseLabel(state)} · ${subjectLabel(state)}`,
        ),
        theme.fg(
          'dim',
          `${progressText(state)} · round ${state.round} · ${state.status}${state.paused ? ' · paused' : ''}`,
        ),
      ],
      invalidate: () => {},
    }),
    { placement: 'belowEditor' },
  );
}

function configuredTools(state: EvidenceState): string[] {
  if (state.paused || state.phase === 'complete') return NORMAL_TOOLS;
  if (state.phase === 'coding') return CODING_TOOLS;
  if (state.phase === 'review') return REVIEW_TOOLS;
  if (state.status === 'waiting_answer') return ['read', 'bash'];
  if (state.phase === 'modeling') {
    if (state.discovery.stage === 'discovering') return DISCOVERY_TOOL_NAMES;
    const submission =
      getExpectedArtifact(state.phase, state.currentArtifactIndex)?.kind ===
      'fm-model'
        ? MODELING_TOOLS
        : DOCUMENT_TOOLS;
    return [
      ...new Set([
        ...submission,
        'evidence_ask_questions',
        'evidence_save_discovery',
      ]),
    ];
  }
  const artifact = getExpectedArtifact(state.phase, state.currentArtifactIndex);
  if (artifact?.kind === 'fm-model') return MODELING_TOOLS;
  return DOCUMENT_TOOLS;
}

function splitModelSpec(
  spec: string,
): { provider: string; modelId: string } | null {
  const slash = spec.indexOf('/');
  if (slash <= 0 || slash === spec.length - 1) return null;
  return { provider: spec.slice(0, slash), modelId: spec.slice(slash + 1) };
}

async function applyPhaseProfile(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: EvidenceState,
  config: EvidenceConfig,
): Promise<void> {
  const availableTools = new Set(pi.getAllTools().map((tool) => tool.name));
  const desiredTools = configuredTools(state);
  const validTools = desiredTools.filter((tool) => availableTools.has(tool));
  const missingTools = desiredTools.filter((tool) => !availableTools.has(tool));
  pi.setActiveTools(validTools);
  if (missingTools.length > 0) {
    ctx.ui.notify(`Evidence 未找到工具：${missingTools.join(', ')}`, 'warning');
  }

  if (state.phase === 'complete') return;
  const profile = config.models[state.phase];
  if (!profile.model) {
    pi.setThinkingLevel(profile.thinkingLevel);
    return;
  }

  const parsed = splitModelSpec(profile.model);
  if (!parsed) {
    pi.setThinkingLevel(profile.thinkingLevel);
    ctx.ui.notify(
      `${CONFIG_PATH} 中的模型必须使用 provider/model-id 格式：${profile.model}`,
      'warning',
    );
    return;
  }
  const model = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
  if (!model) {
    pi.setThinkingLevel(profile.thinkingLevel);
    ctx.ui.notify(
      `模型不存在：${profile.model}。使用 /model 或 pi --list-models 检查。`,
      'warning',
    );
    return;
  }
  if (!(await pi.setModel(model))) {
    ctx.ui.notify(`模型未配置认证：${profile.model}`, 'warning');
  }
  pi.setThinkingLevel(profile.thinkingLevel);
}

async function loadRequiredState(
  ctx: ExtensionContext,
): Promise<EvidenceState | null> {
  const state = await loadState(ctx.cwd);
  if (!state)
    ctx.ui.notify('Evidence 尚未初始化，请先运行 /evidence-init。', 'warning');
  return state;
}

async function ensureCodingStories(
  root: string,
  state: EvidenceState,
): Promise<void> {
  if (state.phase !== 'coding') return;
  if (state.coding.planDigest !== null) {
    await assertTestingInputs(root, state);
    return;
  }
  throw new Error('测试计划尚未通过 Planning Gate，请回退计划阶段重新审核。');
}

async function persistPassedGate(
  root: string,
  state: EvidenceState,
  config: EvidenceConfig,
  report: CheckReport,
  reportPath: string,
): Promise<string> {
  if (state.phase === 'complete') return '流程已完成';
  const gate = await createGate(root, state, report, reportPath);
  const gateMode = config.gates[state.phase];
  const requiresReview =
    gateMode === 'review' || (gateMode === 'review_if' && report.warnings > 0);

  if (requiresReview) {
    state.pendingGate = gate;
    state.status = 'waiting_review';
    appendHistory(state, 'gate_created', gate.id);
    await saveState(root, state);
    return `质量检查通过，等待人工审核：${gate.path}`;
  }

  await recordGateDecision(
    root,
    gate,
    'approved',
    `Gate 模式为 ${gateMode}，本地自动通过。`,
  );
  state.pendingGate = gate;
  const transition = advanceAfterApproval(state);
  await saveState(root, state);
  return `质量检查通过并自动推进到 ${transition.nextPhase}。运行 /evidence-run 继续。`;
}

async function markFailedCheck(
  root: string,
  state: EvidenceState,
  config: EvidenceConfig,
  report: CheckReport,
  reportPath: string,
): Promise<void> {
  if (state.pendingGate) {
    await recordGateDecision(
      root,
      state.pendingGate,
      'cancelled',
      '重新检查未通过，原 Gate 失效',
    );
    state.pendingGate = null;
  }
  state.lastReport = reportPath;
  state.round += 1;
  state.currentArtifactIndex = 0;
  state.feedback = `质量检查未通过。请读取 ${reportPath}，修复所有失败项。`;
  state.lastError = report.items
    .flatMap((item) => (item.status === 'fail' ? [item.details] : []))
    .join('；');
  if (state.round >= config.maxRounds) {
    state.status = 'blocked';
    appendHistory(state, 'max_rounds_reached', state.lastError);
  } else {
    state.status = 'ready';
    appendHistory(state, 'quality_check_failed', reportPath);
  }
  await saveState(root, state);
}

async function finishPhaseSubmission(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: EvidenceState,
  config: EvidenceConfig,
  checked: Awaited<ReturnType<typeof runDocumentChecks>>,
): Promise<string> {
  state.lastReport = checked.markdownPath;
  let message: string;
  if (!checked.report.passed) {
    await markFailedCheck(
      ctx.cwd,
      state,
      config,
      checked.report,
      checked.markdownPath,
    );
    message = `阶段检查未通过，请查看 ${checked.markdownPath}。`;
  } else {
    message = await persistPassedGate(
      ctx.cwd,
      state,
      config,
      checked.report,
      checked.markdownPath,
    );
    await applyPhaseProfile(pi, ctx, state, config);
  }
  updateUi(ctx, state);
  return message;
}

function modelingStatusMarkdown(options: {
  applicable: boolean;
  rationale: string;
  machineValidated: boolean;
  simulationPassed: boolean | null;
  files: string[];
}): string {
  const simulation =
    options.simulationPassed === null
      ? '未运行（未提交验证场景）'
      : options.simulationPassed
        ? '通过'
        : '失败';
  return `# 统一 FM 模型状态

## 适用性

- 结论：${options.applicable ? '适用' : '不适用'}
- 理由：${options.rationale.trim()}

## 机器校验

- machineValidated：${options.machineValidated}
- 说明：${options.applicable ? '模型结构、引用、CEL 与属性追溯由扩展执行确定性校验；架构中的 DDD 映射是设计投影，不是第二份业务事实源。' : '当前范围无独立业务或领域语义，不需生成 FM 定义。'}

## 场景模拟

- simulationPassed：${options.simulationPassed ?? 'not-run'}
- 结果：${simulation}

## 业务确认

- modelStatus / stakeholderReview：${options.applicable ? '以 model.yaml 为准；默认 draft / pending，本状态页不复制或提升人工评审状态。' : '不适用，未生成模型。'}
- 说明：机器校验、单据模拟与 Modeling Gate 不能替代具名业务／领域专家确认；纯领域未执行实例或状态机模拟。

## 模型文件

${options.files.length > 0 ? options.files.map((path) => `- \`${path}\``).join('\n') : '- 无'}
`;
}

async function startCurrentWork(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  await ctx.waitForIdle();
  const state = await loadRequiredState(ctx);
  if (!state) return;
  if (state.phase === 'complete' || state.status === 'complete') {
    ctx.ui.notify('Evidence 已完成。使用 /evidence-status 查看结果。', 'info');
    return;
  }
  if (state.status === 'waiting_answer') {
    ctx.ui.setEditorText('/evidence-answer');
    ctx.ui.notify(
      '当前等待业务回答，请运行 /evidence-answer；不会重复生成工件。',
      'info',
    );
    return;
  }
  if (state.status === 'waiting_review') {
    ctx.ui.notify('当前阶段等待人工审核，请运行 /evidence-review。', 'warning');
    return;
  }
  if (state.status === 'blocked') {
    ctx.ui.notify(
      `当前被阻塞：${state.lastError ?? '需要人工修订'}。使用 /evidence-revise 提供反馈后继续。`,
      'error',
    );
    return;
  }
  if (state.status === 'running') {
    ctx.ui.notify('当前任务仍在执行。', 'warning');
    return;
  }

  const config = await loadConfig(ctx.cwd);
  state.paused = false;
  try {
    await ensureCodingStories(ctx.cwd, state);
    if (state.phase === 'coding' && state.coding.baseline === null) {
      state.coding.baseline = await captureCodingBaseline(pi, ctx.cwd);
      appendHistory(
        state,
        'coding_baseline_captured',
        state.coding.baseline.capturedAt,
      );
    }
    await applyPhaseProfile(pi, ctx, state, config);
    const prompt = await buildCurrentPrompt(ctx.cwd, state, config);
    state.status = 'running';
    state.lastError = null;
    appendHistory(state, 'work_started', subjectLabel(state));
    await saveState(ctx.cwd, state);
    updateUi(ctx, state);
    pi.setSessionName(sessionName(state));
    pi.sendUserMessage(prompt);
  } catch (error) {
    state.status = 'blocked';
    state.lastError = (error as Error).message;
    appendHistory(state, 'work_start_failed', state.lastError);
    await saveState(ctx.cwd, state);
    updateUi(ctx, state);
    ctx.ui.notify(state.lastError, 'error');
  }
}

async function runCurrentCheck(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  state: EvidenceState,
  config: EvidenceConfig,
): Promise<void> {
  if (state.phase === 'complete') return;
  if (state.phase === 'coding') {
    const storyId = currentCodingStory(state);
    if (!storyId) throw new Error('没有当前用户故事');
    const summaryPath = `artifacts/05-coding/${storyId}.md`;
    if (
      state.coding.changedFiles.length === 0 ||
      !(await pathExists(projectPath(ctx.cwd, summaryPath)))
    ) {
      throw new Error(
        '当前故事还没有 TDD 完成记录，请通过 /evidence-run 完成后再重新检查。',
      );
    }
    const result = await runCodingChecks({
      verifyChanges: async () => {
        if (!state.coding.baseline) throw new Error('Coding 基线缺失');
        await verifyCodingChanges(
          pi,
          ctx.cwd,
          state.coding.baseline,
          state.coding.changedFiles,
          isRuntimeGeneratedPath,
        );
      },
      pi,
      root: ctx.cwd,
      state,
      config,
      storyId,
      onProgress: (message) => {
        ctx.ui.setStatus('evidence-check', ctx.ui.theme.fg('warning', message));
      },
      timeoutMs: config.commandTimeoutMs,
    });
    ctx.ui.setStatus('evidence-check', undefined);
    state.lastReport = result.markdownPath;
    if (!result.report.passed) {
      await markFailedCheck(
        ctx.cwd,
        state,
        config,
        result.report,
        result.markdownPath,
      );
      return;
    }
    const record = await loadStoryRecord(ctx.cwd, state, storyId);
    const story = await requireCompleteStory(ctx.cwd, state, storyId);
    await saveStoryRecord(ctx.cwd, state, story, {
      ...record,
      reportPath: result.markdownPath,
      passed: true,
    });
    if (state.pendingGate) {
      state.pendingGate = await refreshGate(
        ctx.cwd,
        state,
        result.report,
        result.markdownPath,
      );
      state.status = 'waiting_review';
      await saveState(ctx.cwd, state);
      return;
    }
    await persistPassedGate(
      ctx.cwd,
      state,
      config,
      result.report,
      result.markdownPath,
    );
    if (state.status === 'ready' || state.status === 'complete') {
      await applyPhaseProfile(pi, ctx, state, config);
    }
    return;
  }

  let result: Awaited<ReturnType<typeof runDocumentChecks>>;
  if (state.phase === 'review') {
    result = await runReviewChecks({
      pi,
      root: ctx.cwd,
      state,
      config,
      timeoutMs: config.commandTimeoutMs,
      onProgress: (message) => {
        ctx.ui.setStatus('evidence-check', ctx.ui.theme.fg('warning', message));
      },
    });
  } else if (state.phase === 'modeling') {
    result = await runModelingChecks({
      pi,
      root: ctx.cwd,
      state,
      timeoutMs: config.commandTimeoutMs,
      onProgress: (message) => {
        ctx.ui.setStatus('evidence-check', ctx.ui.theme.fg('warning', message));
      },
    });
  } else {
    result = await runDocumentChecks(ctx.cwd, state);
  }
  ctx.ui.setStatus('evidence-check', undefined);
  state.lastReport = result.markdownPath;
  if (!result.report.passed) {
    await markFailedCheck(
      ctx.cwd,
      state,
      config,
      result.report,
      result.markdownPath,
    );
    return;
  }
  if (state.pendingGate) {
    state.pendingGate = await refreshGate(
      ctx.cwd,
      state,
      result.report,
      result.markdownPath,
    );
    state.status = 'waiting_review';
    await saveState(ctx.cwd, state);
    return;
  }
  await persistPassedGate(
    ctx.cwd,
    state,
    config,
    result.report,
    result.markdownPath,
  );
  if (state.status === 'ready' || state.status === 'complete') {
    await applyPhaseProfile(pi, ctx, state, config);
  }
}

async function requestChanges(
  ctx: ExtensionCommandContext,
  state: EvidenceState,
  config: EvidenceConfig,
  providedFeedback?: string,
): Promise<void> {
  let feedback = providedFeedback?.trim();
  if (!feedback && ctx.hasUI)
    feedback = (
      await ctx.ui.editor('填写修改意见', state.feedback ?? '')
    )?.trim();
  if (!feedback) {
    ctx.ui.notify('未提供修改意见，操作已取消。', 'info');
    return;
  }
  if (state.pendingGate)
    await recordGateDecision(
      ctx.cwd,
      state.pendingGate,
      'changes_requested',
      feedback,
    );
  if (state.status === 'blocked') state.round = 0;
  requestRevision(state, feedback, config.maxRounds);
  await saveState(ctx.cwd, state);
  updateUi(ctx, state);
  ctx.ui.setEditorText('/evidence-run');
  ctx.ui.notify(
    state.status === 'blocked'
      ? '仍处于阻塞状态，请提高 maxRounds 或再次人工处理。'
      : '已记录反馈，运行 /evidence-run 开始修订。',
    'info',
  );
}

async function createLocalCheckpoint(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  config: EvidenceConfig,
  state: EvidenceState,
  files: string[],
  message: string,
): Promise<void> {
  if (!config.gitCheckpointOnApproval) return;
  const git = await pi.exec('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: ctx.cwd,
    timeout: 5_000,
  });
  if (git.code !== 0) return;
  const existingIndex = await pi.exec('git', ['diff', '--cached', '--quiet'], {
    cwd: ctx.cwd,
    timeout: 10_000,
  });
  if (existingIndex.code === 1) {
    ctx.ui.notify(
      'Git index 已有人工暂存内容；为避免混入提交，本次跳过自动检查点。',
      'warning',
    );
    return;
  }
  if (existingIndex.code !== 0) {
    ctx.ui.notify(`无法检查 Git index：${existingIndex.stderr}`, 'warning');
    return;
  }

  const paths = [...new Set([STATE_PATH, ...files])];
  const unstage = async () =>
    pi.exec('git', ['reset', '--', ...paths], {
      cwd: ctx.cwd,
      timeout: 30_000,
    });
  const add = await pi.exec('git', ['add', '--', ...paths], {
    cwd: ctx.cwd,
    timeout: 30_000,
  });
  if (add.code !== 0) {
    await unstage();
    ctx.ui.notify(`本地检查点暂存失败：${add.stderr}`, 'warning');
    return;
  }
  const diff = await pi.exec('git', ['diff', '--cached', '--quiet'], {
    cwd: ctx.cwd,
    timeout: 10_000,
  });
  if (diff.code === 0) return;
  if (diff.code !== 1) {
    await unstage();
    ctx.ui.notify(`无法检查本次暂存，已撤销：${diff.stderr}`, 'warning');
    return;
  }
  const commit = await pi.exec('git', ['commit', '-m', message], {
    cwd: ctx.cwd,
    timeout: 60_000,
  });
  if (commit.code !== 0) {
    await unstage();
    ctx.ui.notify(
      `本地检查点提交失败，已撤销本次暂存：${commit.stderr}`,
      'warning',
    );
  } else {
    ctx.ui.notify(`已创建本地 Git 检查点：${message}`, 'info');
  }
  updateUi(ctx, state);
}

async function reviewCurrentGate(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  await ctx.waitForIdle();
  const state = await loadRequiredState(ctx);
  if (!state) return;
  if (state.status !== 'waiting_review' || !state.pendingGate) {
    ctx.ui.notify('当前没有等待审核的 Gate。', 'info');
    return;
  }
  const config = await loadConfig(ctx.cwd);
  const gate = state.pendingGate;
  const currentDigest = await hashArtifacts(ctx.cwd, gate.artifactPaths);
  if (currentDigest !== gate.artifactDigest) {
    ctx.ui.notify(
      '工件在 Gate 创建后发生变化。请先运行 /evidence-check 重新检查。',
      'warning',
    );
    return;
  }

  const options = ['批准并继续', '要求修改', '重新运行质量检查'];
  if (isDocumentPhase(state.phase)) options.push('编辑文档工件');
  options.push('稍后决定');
  const decision = await ctx.ui.select(
    `审核 ${gate.subject}\nGate: ${gate.path}\nReport: ${gate.reportPath}`,
    options,
  );

  if (!decision || decision === '稍后决定') return;
  if (decision === '重新运行质量检查') {
    await runCurrentCheck(pi, ctx, state, config);
    const refreshed = await loadState(ctx.cwd);
    updateUi(ctx, refreshed);
    ctx.ui.notify(
      refreshed?.lastError ? '质量检查未通过。' : '质量检查完成。',
      refreshed?.lastError ? 'error' : 'info',
    );
    return;
  }
  if (decision === '要求修改') {
    await requestChanges(ctx, state, config);
    return;
  }
  if (decision === '编辑文档工件' && isDocumentPhase(state.phase)) {
    const definition = getPhaseDefinition(state.phase);
    const selected = await ctx.ui.select(
      '选择要编辑的工件',
      definition.artifacts
        .filter((item) => item.kind !== 'fm-model')
        .map((item) => item.output),
    );
    if (
      !selected ||
      !definition.artifacts.some(
        (item) => item.kind !== 'fm-model' && item.output === selected,
      )
    )
      return;
    const original = await readText(ctx.cwd, selected);
    const edited = await ctx.ui.editor(`编辑 ${selected}`, original);
    if (edited === undefined || edited === original) return;
    await writeTextAtomic(ctx.cwd, selected, normalizeMarkdown(edited));
    await runCurrentCheck(pi, ctx, state, config);
    const refreshed = await loadState(ctx.cwd);
    updateUi(ctx, refreshed);
    ctx.ui.notify(
      '工件已保存并重新检查，请再次运行 /evidence-review。',
      'info',
    );
    return;
  }

  const latest = await loadState(ctx.cwd);
  if (
    latest?.runId !== state.runId ||
    latest.pendingGate?.id !== gate.id ||
    latest.discovery.digest !== state.discovery.digest ||
    (await hashArtifacts(ctx.cwd, gate.artifactPaths)) !== gate.artifactDigest
  ) {
    ctx.ui.notify('审核期间证据或状态已改变，请重新检查。', 'warning');
    return;
  }
  await recordGateDecision(ctx.cwd, gate, 'approved');
  const checkpointFiles = [
    ...gate.artifactPaths,
    gate.path,
    gate.reportPath,
    gate.reportPath.replace(/\.md$/, '.json'),
  ];
  const transition = advanceAfterApproval(state);
  await saveState(ctx.cwd, state);
  await applyPhaseProfile(pi, ctx, state, config);
  await createLocalCheckpoint(
    pi,
    ctx,
    config,
    state,
    checkpointFiles,
    `evidence(${gate.phase}): approve ${gate.subject}`,
  );
  updateUi(ctx, state);

  if (state.phase === 'complete') {
    ctx.ui.notify('Evidence 全部阶段已完成。', 'info');
    pi.setSessionName('evidence:complete');
    return;
  }

  if (!config.newSessionPerPhase) {
    pi.setSessionName(sessionName(state));
    ctx.ui.setEditorText('/evidence-run');
    ctx.ui.notify(
      `已进入 ${transition.nextPhase}，运行 /evidence-run 继续。`,
      'info',
    );
    return;
  }

  const parentSession = ctx.sessionManager.getSessionFile();
  const result = await ctx.newSession({
    parentSession,
    withSession: async (replacementCtx) => {
      replacementCtx.ui.setEditorText('/evidence-run');
      replacementCtx.ui.notify(
        `已进入 ${transition.nextPhase}。提交 /evidence-run 开始。`,
        'info',
      );
    },
  });
  if (result.cancelled)
    ctx.ui.notify('新 Session 创建已取消；当前阶段状态已推进。', 'warning');
}

export default function evidenceExtension(pi: ExtensionAPI): void {
  const refreshDiscovery = async (
    ctx: ExtensionContext,
    state: EvidenceState,
  ) => {
    await applyPhaseProfile(pi, ctx, state, await loadConfig(ctx.cwd));
    updateUi(ctx, state);
  };
  registerDiscoveryTools(pi, refreshDiscovery);
  pi.registerTool({
    name: 'evidence_submit_artifact',
    label: 'Submit Evidence Artifact',
    description:
      'Submit the complete Markdown for the single artifact currently expected by the local Evidence workflow. The extension validates and atomically writes the configured path.',
    promptSnippet: 'Validate and submit the current Evidence document artifact',
    promptGuidelines: [
      'Use evidence_submit_artifact exactly once as the final action for a Evidence document task; do not write that artifact directly.',
    ],
    parameters: Type.Object({
      content: Type.String({
        description: 'Complete Markdown document without an outer code fence',
        minLength: 100,
      }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return withModelingLock(ctx.cwd, async () => {
        const state = await loadState(ctx.cwd);
        if (!state)
          throw new Error('Evidence is not initialized. Run /evidence-init.');
        if (state.status !== 'running')
          throw new Error(
            `Workflow status is ${state.status}, expected running.`,
          );
        if (!isDocumentPhase(state.phase))
          throw new Error(
            `evidence_submit_artifact is unavailable in phase ${state.phase}.`,
          );
        const config = await loadConfig(ctx.cwd);
        const artifact = getExpectedArtifact(
          state.phase,
          state.currentArtifactIndex,
        );
        if (!artifact)
          throw new Error(
            `No artifact expected at index ${state.currentArtifactIndex}.`,
          );
        if (artifact.kind === 'fm-model') {
          throw new Error(
            '统一 FM 模型必须通过 evidence_submit_fm_model 提交。',
          );
        }

        if (state.paused) throw new Error('Evidence 已暂停。');
        if (state.phase === 'modeling') await requireFinalizing(ctx.cwd, state);
        const content = normalizeMarkdown(params.content);
        const validation = validateArtifactContent(artifact, content);
        if (!validation.passed) {
          throw new Error(
            `工件校验失败：\n${validation.issues.map((issue) => `- ${issue.message}`).join('\n')}`,
          );
        }

        await validateTestingArtifact(ctx.cwd, artifact.key, content);
        await writeTextAtomic(ctx.cwd, artifact.output, content);
        state.currentArtifactIndex += 1;
        state.lastError = null;
        appendHistory(state, 'artifact_submitted', artifact.output);
        onUpdate?.({
          content: [{ type: 'text', text: `已写入 ${artifact.output}` }],
          details: { path: artifact.output },
        });

        const nextArtifact = getExpectedArtifact(
          state.phase,
          state.currentArtifactIndex,
        );
        if (nextArtifact) {
          await applyPhaseProfile(pi, ctx, state, config);
          if (config.autoContinueArtifacts) {
            state.status = 'running';
            await saveState(ctx.cwd, state);
            updateUi(ctx, state);
            const nextPrompt = await buildCurrentPrompt(ctx.cwd, state, config);
            pi.sendUserMessage(nextPrompt, { deliverAs: 'followUp' });
            return {
              content: [
                {
                  type: 'text',
                  text: `已提交 ${artifact.output}；下一工件：${nextArtifact.output}`,
                },
              ],
              details: { path: artifact.output, next: nextArtifact.output },
              terminate: true,
            };
          }
          state.status = 'ready';
          await saveState(ctx.cwd, state);
          updateUi(ctx, state);
          return {
            content: [
              {
                type: 'text',
                text: `已提交 ${artifact.output}。运行 /evidence-run 生成 ${nextArtifact.output}。`,
              },
            ],
            details: { path: artifact.output, next: nextArtifact.output },
            terminate: true,
          };
        }

        let checked: Awaited<ReturnType<typeof runDocumentChecks>>;
        if (state.phase === 'review') {
          checked = await runReviewChecks({
            pi,
            root: ctx.cwd,
            state,
            config,
            signal,
            timeoutMs: config.commandTimeoutMs,
            onProgress: (progress) => {
              onUpdate?.({
                content: [{ type: 'text', text: progress }],
                details: { path: artifact.output },
              });
            },
          });
        } else if (state.phase === 'modeling') {
          checked = await runModelingChecks({
            pi,
            root: ctx.cwd,
            state,
            signal,
            timeoutMs: config.commandTimeoutMs,
            onProgress: (progress) => {
              onUpdate?.({
                content: [{ type: 'text', text: progress }],
                details: { path: artifact.output },
              });
            },
          });
        } else {
          checked = await runDocumentChecks(ctx.cwd, state);
        }
        const message = await finishPhaseSubmission(
          pi,
          ctx,
          state,
          config,
          checked,
        );
        return {
          content: [{ type: 'text', text: message }],
          details: {
            path: artifact.output,
            report: checked.markdownPath,
            passed: checked.report.passed,
          },
          terminate: true,
        };
      });
    },
  });

  pi.registerTool({
    name: 'evidence_submit_fm_model',
    label: 'Submit FM Model',
    description:
      'Submit a unified FM Schema v3 bundle for domain, channel, fulfillment or mixed scope. No contract is required for pure domain/channel models. Only simple glue without independent semantics may be not applicable. The extension validates, traces, simulates applicable evidence and derives patterns/compiled outputs.',
    promptSnippet: 'Validate and submit the current unified FM v3 model bundle',
    promptGuidelines: [
      'Use evidence_submit_fm_model only for the current fulfillment-model artifact (unified FM). Submit source YAML, discovery notes and validation scenarios; never generated files or 02-business-patterns.md.',
    ],
    parameters: Type.Object({
      applicable: Type.Boolean({
        description:
          'Whether the scope has independent domain, channel or fulfillment semantics; absence of contracts is not a reason to skip FM',
      }),
      rationale: Type.String({
        description:
          'Concrete applicability decision and remaining assumptions',
        minLength: 40,
      }),
      files: Type.Array(
        Type.Object({
          path: Type.String({
            description:
              'Path relative to the FM model root, such as model.yaml or entities/role--buyer.yaml',
            minLength: 1,
          }),
          content: Type.String({
            description: 'Complete UTF-8 YAML or Markdown file content',
            minLength: 1,
            maxLength: 500_000,
          }),
        }),
        { maxItems: 200 },
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return withModelingLock(ctx.cwd, async () => {
        const state = await loadState(ctx.cwd);
        if (
          !state ||
          state.phase !== 'modeling' ||
          state.status !== 'running'
        ) {
          throw new Error('A running modeling FM task is required.');
        }
        const artifact = getExpectedArtifact(
          state.phase,
          state.currentArtifactIndex,
        );
        if (artifact?.kind !== 'fm-model') {
          throw new Error('当前工件不是统一 FM 模型。');
        }
        if (state.paused) throw new Error('Evidence 已暂停。');
        await requireFinalizing(ctx.cwd, state);
        if (!params.applicable && params.files.length > 0) {
          throw new Error('FM 不适用时不得提交模型文件。');
        }
        if (params.applicable && params.files.length === 0) {
          throw new Error('FM 适用时必须提交模型文件。');
        }

        const config = await loadConfig(ctx.cwd);
        let files: string[];
        let machineValidated = false;
        let simulationPassed: boolean | null = null;
        if (params.applicable) {
          const validation = await replaceFmModel({
            pi,
            root: ctx.cwd,
            files: params.files,
            timeoutMs: config.commandTimeoutMs,
            signal,
            onProgress: (progress) => {
              onUpdate?.({
                content: [{ type: 'text', text: progress }],
                details: { path: FM_MODEL_ROOT },
              });
            },
          });
          if (!validation.passed) {
            throw new Error(
              `统一 FM 模型校验失败：\n${validation.items
                .filter((item) => item.status === 'fail')
                .map((item) => `- ${item.name}: ${item.details}`)
                .join('\n')}`,
            );
          }
          files = validation.files;
          machineValidated = validation.machineValidated;
          simulationPassed = validation.simulationPassed;
        } else {
          await rm(projectPath(ctx.cwd, FM_MODEL_ROOT), {
            recursive: true,
            force: true,
          });
          files = [];
        }

        await writeTextAtomic(
          ctx.cwd,
          FM_STATUS_PATH,
          modelingStatusMarkdown({
            applicable: params.applicable,
            rationale: params.rationale,
            machineValidated,
            simulationPassed,
            files,
          }),
        );
        files = await listFmModelFiles(ctx.cwd);
        state.modeling = {
          applicable: params.applicable,
          rationale: params.rationale.trim(),
          files,
          machineValidated,
          simulationPassed,
        };
        state.currentArtifactIndex += 1;
        state.lastError = null;
        appendHistory(
          state,
          'fm_model_submitted',
          params.applicable ? `${files.length} files` : 'not applicable',
        );

        // FM is followed by software scope and acceptance, sharing one Modeling Gate.
        state.status = config.autoContinueArtifacts ? 'running' : 'ready';
        await saveState(ctx.cwd, state);
        await applyPhaseProfile(pi, ctx, state, config);
        updateUi(ctx, state);
        if (config.autoContinueArtifacts)
          pi.sendUserMessage(await buildCurrentPrompt(ctx.cwd, state, config), {
            deliverAs: 'followUp',
          });
        return {
          content: [
            {
              type: 'text',
              text: 'FM 已提交；接下来从模型收敛软件范围、故事和验收标准，尚未创建 Gate。',
            },
          ],
          details: {
            applicable: params.applicable,
            files,
            path: FM_STATUS_PATH,
            next: getExpectedArtifact(state.phase, state.currentArtifactIndex)
              ?.output,
          },
          terminate: true,
        };
      });
    },
  });

  registerTddTools(pi, updateUi);

  pi.registerTool({
    name: 'evidence_complete_story',
    label: 'Complete TDD Story',
    description:
      'Complete the story only after all planned tasks and TDD cycles are evidenced. Re-run every planned check and all quality commands before creating a gate.',
    promptSnippet: 'Verify and complete the current Evidence TDD story',
    promptGuidelines: [
      'Use evidence_complete_story as the final action after changing real code and completing Red, Green, and Refactor for the current story.',
    ],
    parameters: Type.Object({
      storyId: Type.String({
        description: 'Current story ID, for example US-001',
      }),
      summary: Type.String({
        description: 'Concise implementation and design summary',
        minLength: 40,
        maxLength: 2000,
      }),
      changedFiles: Type.Array(Type.String(), {
        description: 'All project-relative source and test files changed',
        minItems: 2,
      }),
      refactorSummary: Type.String({
        description: 'Refactoring performed while preserving behavior',
        minLength: 20,
        maxLength: 2000,
      }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return withCodingLock(ctx.cwd, async () => {
        const state = await loadState(ctx.cwd);
        if (!state)
          throw new Error('Evidence is not initialized. Run /evidence-init.');
        if (
          state.phase !== 'coding' ||
          state.status !== 'running' ||
          state.paused
        ) {
          throw new Error(
            `Expected running coding phase, got ${state.phase}/${state.status}.`,
          );
        }
        const storyId = currentCodingStory(state);
        if (!storyId || params.storyId !== storyId) {
          throw new Error(
            `Expected story ${storyId ?? 'none'}, received ${params.storyId}.`,
          );
        }
        const story = await requireCompleteStory(ctx.cwd, state, storyId);

        const changedFiles = [
          ...new Set(
            params.changedFiles.map((path) =>
              relativeProjectPath(ctx.cwd, path),
            ),
          ),
        ];
        for (const path of changedFiles) {
          const absolute = projectPath(ctx.cwd, path);
          if (!(await pathExists(absolute)))
            throw new Error(`Changed file does not exist: ${path}`);
          if (isProtectedPath(path)) {
            throw new Error(
              `Workflow control file cannot be submitted as a code change: ${path}`,
            );
          }
        }
        if (!changedFiles.some(isTestFile)) {
          throw new Error(
            'TDD completion must include at least one changed test file.',
          );
        }
        if (!changedFiles.some(isProductionSourceFile)) {
          throw new Error(
            'Story completion must include at least one changed production source file.',
          );
        }
        if (!state.coding.baseline)
          throw new Error('Coding 基线缺失，请重新运行 /evidence-run。');
        await verifyCodingChanges(
          pi,
          ctx.cwd,
          state.coding.baseline,
          changedFiles,
          isRuntimeGeneratedPath,
        );

        const config = await loadConfig(ctx.cwd);
        const sourceDigest = await hashArtifacts(ctx.cwd, changedFiles);
        const record: StoryRecord = {
          version: 1,
          runId: state.runId,
          storyId,
          planDigest: state.coding.planDigest!,
          cycles: state.coding.cycles,
          verifications: state.coding.verifications,
          revisionStart: state.coding.revisionStart,
          changedFiles,
          summary: params.summary,
          refactorSummary: params.refactorSummary,
          reportPath: 'pending',
          passed: false,
        };
        const checked = await runCodingChecks({
          record,
          pi,
          root: ctx.cwd,
          state,
          config,
          storyId,
          signal,
          timeoutMs: config.commandTimeoutMs,
          onProgress: (message) => {
            onUpdate?.({
              content: [{ type: 'text', text: message }],
              details: { storyId },
            });
          },
        });
        await verifyCodingChanges(
          pi,
          ctx.cwd,
          state.coding.baseline,
          changedFiles,
          isRuntimeGeneratedPath,
        );
        await assertTestingInputs(ctx.cwd, state);
        if (sourceDigest !== (await hashArtifacts(ctx.cwd, changedFiles)))
          throw new Error('质量检查期间源文件发生变化，请重新验证。');
        state.lastReport = checked.markdownPath;
        state.coding.changedFiles = changedFiles;
        await saveStoryRecord(ctx.cwd, state, story, {
          ...record,
          reportPath: checked.markdownPath,
          passed: checked.report.passed,
        });
        appendHistory(state, 'coding_story_submitted', storyId);

        let message: string;
        if (!checked.report.passed) {
          await markFailedCheck(
            ctx.cwd,
            state,
            config,
            checked.report,
            checked.markdownPath,
          );
          message = `最终质量命令未通过。读取 ${checked.markdownPath} 后修复，再运行 /evidence-run。`;
        } else {
          message = await persistPassedGate(
            ctx.cwd,
            state,
            config,
            checked.report,
            checked.markdownPath,
          );
          await applyPhaseProfile(pi, ctx, state, config);
        }
        updateUi(ctx, state);
        return {
          content: [{ type: 'text', text: message }],
          details: {
            storyId,
            changedFiles,
            report: checked.markdownPath,
            passed: checked.report.passed,
          },
          terminate: true,
        };
      });
    },
  });

  pi.registerCommand('evidence-init', {
    description: '初始化本地 Evidence 工作流',
    handler: async (args, ctx) => {
      await ctx.waitForIdle();
      const existing = await loadState(ctx.cwd);
      if (existing && ctx.hasUI) {
        const confirmed = await ctx.ui.confirm(
          '重新初始化 Evidence？',
          '状态会重置，已有工件默认保留。使用 /evidence-reset 可删除工件。',
        );
        if (!confirmed) return;
      }

      const currentInput = await readText(ctx.cwd, REQUIREMENTS_PATH);
      const currentGoal = currentInput.replace(/^# 原始需求\s*/i, '').trim();
      const initialGoal = currentGoal.startsWith(
        '运行 Pi 后使用 `/evidence-init` 输入项目目标和原始需求',
      )
        ? ''
        : currentGoal;
      let goal = args.trim();
      if (!goal && ctx.hasUI) {
        goal =
          (
            await ctx.ui.editor('输入项目目标和原始需求', initialGoal)
          )?.trim() ?? '';
      }
      if (!goal) {
        ctx.ui.notify(
          '项目目标不能为空。也可以使用 /evidence-init <需求描述>。',
          'warning',
        );
        return;
      }

      await ensureWorkspace(ctx.cwd);
      const packageJson = await readJson<{ name?: string }>(
        ctx.cwd,
        'package.json',
      );
      const projectName = packageJson?.name ?? basename(ctx.cwd);
      await writeTextAtomic(
        ctx.cwd,
        REQUIREMENTS_PATH,
        `# 原始需求\n\n${goal}\n`,
      );
      const state = createInitialState(projectName, goal);
      await saveState(ctx.cwd, state);
      const config = await loadConfig(ctx.cwd);
      await applyPhaseProfile(pi, ctx, state, config);
      pi.setSessionName(sessionName(state));
      updateUi(ctx, state);
      ctx.ui.notify(
        'Evidence 已初始化，直接开始问题定位与交互式建模。',
        'info',
      );
      await startCurrentWork(pi, ctx);
    },
  });

  pi.registerCommand('evidence-run', {
    description: '执行当前阶段的下一个工件或用户故事',
    handler: async (_args, ctx) => startCurrentWork(pi, ctx),
  });

  pi.registerCommand('evidence-status', {
    description: '显示 Evidence 当前状态',
    handler: async (_args, ctx) => {
      const state = await loadRequiredState(ctx);
      if (!state) return;
      pi.sendMessage({
        customType: 'evidence-status',
        content: statusMarkdown(state),
        display: true,
      });
      updateUi(ctx, state);
    },
  });

  pi.registerCommand('evidence-check', {
    description: '重新运行当前工件或代码的本地质量检查',
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const state = await loadRequiredState(ctx);
      if (!state || state.phase === 'complete') return;
      if (
        state.phase === 'modeling' &&
        (state.discovery.stage !== 'finalizing' ||
          state.currentArtifactIndex <
            getPhaseDefinition('modeling').artifacts.length)
      ) {
        ctx.ui.notify(
          '请先完成发现与全部正式工件；草稿使用 evidence_check_model_draft，不以阶段重查跳过发现。',
          'warning',
        );
        return;
      }
      const config = await loadConfig(ctx.cwd);
      try {
        await ensureCodingStories(ctx.cwd, state);
        await runCurrentCheck(pi, ctx, state, config);
        const refreshed = await loadState(ctx.cwd);
        updateUi(ctx, refreshed);
        ctx.ui.notify(
          refreshed?.lastError ? '检查未通过，请查看报告。' : '检查通过。',
          refreshed?.lastError ? 'error' : 'info',
        );
      } catch (error) {
        ctx.ui.setStatus('evidence-check', undefined);
        ctx.ui.notify((error as Error).message, 'error');
      }
    },
  });

  pi.registerCommand('evidence-review', {
    description: '审核当前 Gate：批准、修改、编辑或重查',
    handler: async (_args, ctx) => reviewCurrentGate(pi, ctx),
  });

  pi.registerCommand('evidence-next', {
    description: '继续工作流；等待审核时打开 Gate，否则运行当前任务',
    handler: async (_args, ctx) => {
      const state = await loadRequiredState(ctx);
      if (!state) return;
      if (state.status === 'waiting_review') await reviewCurrentGate(pi, ctx);
      else if (state.status === 'waiting_answer')
        await collectAnswer(pi, ctx, refreshDiscovery);
      else await startCurrentWork(pi, ctx);
    },
  });

  pi.registerCommand('evidence-revise', {
    description: '记录人工修改意见并重新执行当前对象',
    handler: async (args, ctx) => {
      await ctx.waitForIdle();
      const state = await loadRequiredState(ctx);
      if (!state || state.phase === 'complete') return;
      const config = await loadConfig(ctx.cwd);
      await requestChanges(ctx, state, config, args);
    },
  });

  pi.registerCommand('evidence-back', {
    description: '回退到上一工程阶段，保留已有工件',
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const state = await loadRequiredState(ctx);
      if (!state) return;
      const previous =
        state.phase === 'modeling'
          ? null
          : moveBackOnePhase(structuredClone(state));
      if (!previous) {
        ctx.ui.notify('已经位于第一个阶段，无法继续回退。', 'info');
        return;
      }
      const confirmed = await ctx.ui.confirm(
        '回退工程阶段？',
        `将从 ${state.phase} 回退到 ${previous}。已有工件不会删除。`,
      );
      if (!confirmed) return;
      if (state.pendingGate)
        await recordGateDecision(
          ctx.cwd,
          state.pendingGate,
          'cancelled',
          '人工回退阶段',
        );
      moveBackOnePhase(state);
      await saveState(ctx.cwd, state);
      await applyPhaseProfile(pi, ctx, state, await loadConfig(ctx.cwd));
      updateUi(ctx, state);
      ctx.ui.setEditorText('/evidence-run');
      ctx.ui.notify(`已回退到 ${previous}。`, 'info');
    },
  });

  pi.registerCommand('evidence-pause', {
    description: '暂停 Evidence 约束并恢复 Pi 默认工具',
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const state = await loadRequiredState(ctx);
      if (!state) return;
      state.paused = true;
      appendHistory(state, 'workflow_paused');
      await saveState(ctx.cwd, state);
      pi.setActiveTools(
        NORMAL_TOOLS.filter((name) =>
          pi.getAllTools().some((tool) => tool.name === name),
        ),
      );
      updateUi(ctx, state);
      ctx.ui.notify(
        'Evidence 已暂停。运行 /evidence-resume 恢复阶段约束。',
        'info',
      );
    },
  });

  pi.registerCommand('evidence-resume', {
    description: '恢复 Evidence 阶段模型与工具约束',
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const state = await loadRequiredState(ctx);
      if (!state) return;
      state.paused = false;
      appendHistory(state, 'workflow_resumed');
      await saveState(ctx.cwd, state);
      await applyPhaseProfile(pi, ctx, state, await loadConfig(ctx.cwd));
      updateUi(ctx, state);
      ctx.ui.notify('Evidence 阶段约束已恢复。', 'info');
    },
  });

  pi.registerCommand('evidence-reset', {
    description: '重置 Evidence 状态，可选择删除生成工件',
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const choice = await ctx.ui.select('重置 Evidence', [
        '仅重置状态，保留所有工件',
        '重置状态并删除生成的工件与报告',
        '取消',
      ]);
      if (!choice || choice === '取消') return;
      const removeArtifacts = choice.startsWith('重置状态并删除');
      const confirmed = await ctx.ui.confirm(
        '确认重置？',
        removeArtifacts
          ? '生成工件和报告将被删除，此操作不可撤销。'
          : '流程状态将被删除，已有工件保留。',
      );
      if (!confirmed) return;
      await removeWorkflowState(ctx.cwd, removeArtifacts);
      updateUi(ctx, null);
      pi.setActiveTools(
        NORMAL_TOOLS.filter((name) =>
          pi.getAllTools().some((tool) => tool.name === name),
        ),
      );
      ctx.ui.notify('Evidence 已重置。运行 /evidence-init 重新开始。', 'info');
    },
  });

  pi.on('session_start', async (_event, ctx) => {
    const state = await loadState(ctx.cwd);
    if (!state) {
      updateUi(ctx, null);
      return;
    }
    if (state.status === 'running') {
      state.status = 'ready';
      state.lastError =
        '上一次执行在提交完成标记前中断，可以重新运行当前任务。';
      appendHistory(state, 'interrupted_run_recovered');
      await saveState(ctx.cwd, state);
    }
    await applyPhaseProfile(pi, ctx, state, await loadConfig(ctx.cwd));
    pi.setSessionName(sessionName(state));
    updateUi(ctx, state);
  });

  pi.on('before_agent_start', async (event, ctx) => {
    const state = await loadState(ctx.cwd);
    if (!state || state.paused) return;
    const guard = buildPhaseGuard(state);
    if (!guard) return;
    return { systemPrompt: event.systemPrompt + guard };
  });

  pi.on('agent_settled', async (_event, ctx) => {
    const state = await loadState(ctx.cwd);
    if (!state) return;
    if (state.status === 'running') {
      state.status = 'ready';
      const discovering =
        state.phase === 'modeling' && state.discovery.stage === 'discovering';
      state.lastError = discovering
        ? null
        : 'Agent 已结束，但没有调用当前阶段要求的 evidence_* 提交工具。';
      appendHistory(
        state,
        discovering ? 'discovery_paused' : 'agent_stopped_without_submission',
        subjectLabel(state),
      );
      await saveState(ctx.cwd, state);
      ctx.ui.notify(
        discovering
          ? '发现进度已保留，可运行 /evidence-run 继续。'
          : `${state.lastError} 运行 /evidence-run 重试。`,
        discovering ? 'info' : 'warning',
      );
    }
    updateUi(ctx, state);
  });

  pi.on('tool_call', async (event, ctx) => {
    const state = await loadState(ctx.cwd);
    if (!state || state.paused || state.phase === 'complete') return;

    if (
      isToolCallEventType('edit', event) ||
      isToolCallEventType('write', event)
    ) {
      let path: string;
      try {
        path = relativeProjectPath(ctx.cwd, event.input.path);
      } catch {
        return {
          block: true,
          reason: `Evidence blocks paths outside the project root: ${event.input.path}`,
        };
      }
      if (isProtectedPath(path)) {
        return {
          block: true,
          reason: `Evidence protects workflow control path: ${path}`,
        };
      }
      if (state.phase !== 'coding') {
        return {
          block: true,
          reason: `Direct ${event.toolName} is disabled in ${state.phase}; use evidence_submit_artifact.`,
        };
      }
    }

    if (isToolCallEventType('bash', event)) {
      const command = event.input.command;
      const referencesProtectedPath = PROTECTED_PATHS.some((value) => {
        const relativePath = value.replace(/\/$/, '');
        return (
          command.includes(relativePath) ||
          command.includes(projectPath(ctx.cwd, relativePath))
        );
      });
      if (referencesProtectedPath) {
        return {
          block: true,
          reason:
            'Evidence blocks shell access to workflow state, gates, reports, and extension files.',
        };
      }
      if (
        /\bgit\s+(?:add|commit|reset|checkout|restore|clean|switch|merge|rebase|cherry-pick|stash)\b/i.test(
          command,
        )
      ) {
        return {
          block: true,
          reason:
            'Git mutations are reserved for the optional extension-owned local checkpoint.',
        };
      }
      if (
        state.phase !== 'coding' &&
        !isAllowedReadOnlyShell(command, state.phase === 'review')
      ) {
        return {
          block: true,
          reason: `Only allowlisted inspection${state.phase === 'review' ? ' and quality' : ''} commands are enabled in read-only ${state.phase}.`,
        };
      }
    }
    return undefined;
  });
}
