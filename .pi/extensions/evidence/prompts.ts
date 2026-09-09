import { prepareDiscoveryContext } from './instructions/discovery-context.ts';
import {
  DISCOVERY_GUIDE_PATH,
  renderDiscoveryPolicy,
  renderDiscoveryPrompt,
} from './instructions/discovery-prompt.ts';
import {
  getExpectedArtifact,
  getPhaseDefinition,
  TESTING_CONTRACT_INPUTS,
} from './phases.ts';
import {
  discoveryViewPath,
  loadDiscoveryEntries,
  refreshDiscoveryView,
  loadDiscovery,
  requireFinalizing,
} from './state/discovery/index.ts';
import { projectEntryExists, readText, REQUIREMENTS_PATH } from './storage.ts';
import { assertTestingInputs } from './test-plan.ts';
import { taskComplete } from './testing-evidence.ts';
import type { EvidenceConfig, EvidenceState } from './types.ts';
import { currentCodingStory } from './workflow.ts';

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim();
}

function inputList(paths: string[]): string {
  return paths.map((path) => `- \`${path}\``).join('\n');
}

function feedbackSection(state: EvidenceState): string {
  if (!state.feedback) return '';
  return `\n## 上一轮反馈\n\n${state.feedback}\n\n请明确修复反馈中的每一项。`;
}

async function requireInputs(root: string, paths: string[]): Promise<void> {
  const available = await Promise.all(
    paths.map((path) => projectEntryExists(root, path)),
  );
  const missing = paths.filter((_path, index) => !available[index]);
  if (missing.length > 0) {
    throw new Error(
      `当前任务缺少输入：${missing.join(', ')}。请使用 /evidence-back 修复上游阶段。`,
    );
  }
}

async function requireInstructions(
  root: string,
  path: string,
): Promise<string> {
  const content = await readText(root, path);
  if (!content.trim())
    throw new Error(`Evidence 指令文件不存在或为空：${path}`);
  return stripFrontmatter(content);
}

export async function buildDiscoveryPolicy(root: string): Promise<string> {
  const skill = await requireInstructions(
    root,
    getPhaseDefinition('modeling').skillFile,
  );
  const guide = await requireInstructions(root, DISCOVERY_GUIDE_PATH);
  return renderDiscoveryPolicy(skill, guide);
}

export async function buildCurrentPrompt(
  root: string,
  state: EvidenceState,
  config: EvidenceConfig,
): Promise<string> {
  if (state.phase === 'complete') throw new Error('Workflow is complete');
  const definition = getPhaseDefinition(state.phase);
  const skill = await requireInstructions(root, definition.skillFile);

  if (state.phase === 'modeling' && state.discovery.stage === 'discovering') {
    const snapshot = await refreshDiscoveryView(root, state);
    await requireInputs(root, [REQUIREMENTS_PATH]);
    // Validate required policy before starting work, but inject it through
    // before_agent_start rather than duplicating it in every user message.
    await requireInstructions(root, DISCOVERY_GUIDE_PATH);
    const context = await prepareDiscoveryContext(
      root,
      state,
      snapshot,
      await loadDiscoveryEntries(root, state),
    );
    return renderDiscoveryPrompt(state, snapshot, context);
  }
  if (state.phase === 'modeling') {
    await requireFinalizing(root, state);
    await refreshDiscoveryView(root, state);
  }

  if (state.phase === 'coding') {
    const storyId = currentCodingStory(state);
    if (!storyId)
      throw new Error('No current coding story. Check Sprint 1 backlog first.');
    const inputs = [
      REQUIREMENTS_PATH,
      'artifacts/01-requirements/story-map.md',
      'artifacts/03-architecture/architecture-style.md',
      'artifacts/03-architecture/module-structure.md',
      'artifacts/03-architecture/api-contracts.md',
      ...TESTING_CONTRACT_INPUTS,
      'artifacts/02-modeling/fm-model',
      'artifacts/04-planning/sprint-1-backlog.md',
      'artifacts/04-planning/definition-of-done.md',
      'README.md',
    ];
    await requireInputs(root, inputs);
    const story = (await assertTestingInputs(root, state)).stories.find(
      (story) => story.id === storyId,
    )!;
    const progress = story.tasks
      .map(
        (task) =>
          `- ${task.id} / ${task.procedureId} / ${task.mode}：${taskComplete(task, state.coding.cycles, state.coding.verifications) ? '已记录' : '待完成'}；场景 ${task.scenarioIds.join(', ')}；依赖 ${task.dependsOn.join(', ') || '无'}；检查 ${task.checks.map((check) => `${check.id}: ${check.command}`).join('；') || task.reason}`,
      )
      .join('\n');
    return `# Evidence 本地执行任务

## 当前任务

- 阶段：编码与 TDD
- 用户故事：\`${storyId}\`
- 轮次：${state.round}
- TDD 检查点：\`${state.coding.tdd.stage}\`
- 已完成循环：${state.coding.cycles.length}；本修订须有循环索引大于 ${state.coding.revisionStart}
- 活动任务/检查：${state.coding.tdd.binding ? `${state.coding.tdd.binding.taskId}/${state.coding.tdd.binding.checkId}` : '无，可开始下一循环或验证任务'}
- 已记录 Red 命令：${state.coding.tdd.red?.command ?? '无'}
- 已记录 Red 观察：${state.coding.tdd.red?.observation ?? '无'}
- 项目目标：${state.goal}

## 计划与恢复进度

${progress}

状态和命令来自已批准机器计划及扩展记录；恢复后沿用当前检查点，不重新造 Red，不重置 Git 基线。

## 方法论

${skill}

## 必须读取的输入

${inputList(inputs)}

## 执行要求

1. 在 Sprint 1 Backlog 中定位 ${storyId}，只实现该故事的范围；保留验收场景 ID、任务 ID、工序 ID 及 FM Context/Entity/Rule ID，以及适用的 Fulfillment/Evidence/Scenario ID；纯领域运行时行为仍需 Q1/Q2 验证。
2. 先检查现有代码与测试，不要假设技术栈。按已批准的测试策略和当前适用工序明确被测边界、真实依赖、测试替身、场景数据和预期结果；不把被测业务逻辑替换掉。
3. 当前检查点为 \`${state.coding.tdd.stage}\`。按前置依赖选 tdd 任务，先写真实行为测试，再调用 \`evidence_tdd_red\`，传 storyId、taskId、checkId、与计划完全一致的 command 及 expectedFailure。环境、语法、零测试和无关失败不算 Red。
4. Red 后只写最小实现，再调用 \`evidence_tdd_green\`。扩展运行完全相同的命令，并要求 Red 的测试文件未改变；不能删除、削弱失败测试取得 Green。
5. Green 后进行 Refactor，调用 \`evidence_complete_tdd_cycle\` 传 storyId、refactorSummary；聚焦测试再次通过才追加循环并返回 Red。可继续同一检查项或下一任务，不重置状态，不消耗修订轮次。
6. 对 verify 任务调用 \`evidence_verify_task\`，传 storyId、taskId；扩展检查依赖并实际执行全部计划检查。复用测试不造 Red；not-applicable 必须来自已批准计划中的明确理由。
7. 每个 tdd CHECK 至少一个完整循环、所有适用任务/场景的 Q1/Q2 声明都有记录后才能完成故事。不能仅生成 Markdown，必须改变真实生产源码和测试。机器只验证声明及执行，不证明断言语义、完整验收覆盖或 Q3/Q4/UAT 结论。
8. 最后调用 \`evidence_complete_story\`，提交实现摘要、Refactor 摘要和全部真实变更文件。扩展重跑所有适用计划检查以及 ${config.qualityCommands.map((command) => `\`${command}\``).join('、') || '未配置的质量命令'}，生成逐循环 JSON/Markdown 记录及 Gate。调用后停止；契约不符或缺失时必须回退上游修订，不能手改状态或工件。${feedbackSection(state)}
`;
  }

  const artifact = getExpectedArtifact(state.phase, state.currentArtifactIndex);
  if (!artifact)
    throw new Error(`No pending artifact for phase ${state.phase}`);
  const inputs = [
    ...new Set([
      REQUIREMENTS_PATH,
      ...artifact.inputs,
      ...(state.phase === 'modeling' && state.discovery.path
        ? [discoveryViewPath(state)]
        : []),
    ]),
  ];
  await requireInputs(root, inputs);
  let artifactPrompt = await requireInstructions(root, artifact.promptFile);
  if (state.phase === 'modeling')
    artifactPrompt += `\n发现版本：${state.discovery.revision}。扩展已重建完整视图：${discoveryViewPath(state)}，使用现有 read 按需分页读取，核对 revision；历史依据位于 ${state.discovery.path} 所属记录链。单个 revision 文件仅为追加记录，不是完整快照。当前视图只是可重建缓存，不作为独立业务来源。术语和 FM 依据发现记录；不依赖后生成的故事。FM 之后生成的软件范围与 US/AC 只选择本次实现部分，不把全部业务活动自动变成功能。发现冲突时用 evidence_ask_questions 或 evidence_save_discovery 重新打开发现，旧定稿失效，不私改其他工件。`;

  if (state.phase === 'modeling') {
    const snapshot = await loadDiscovery(root, state);
    if (snapshot.modelUpdateRequested)
      artifactPrompt +=
        '\n本次是人工触发的模型更新批次，不是结束 Modeling。先读取现有统一语言和 FM（若存在），保留稳定 ID；纳入已积累发现，更新成功后等待人工继续问答或进入需求收敛。不能要求先完成全部履约链。';
    if (snapshot.formalization)
      artifactPrompt += `\n本次 Context 评估：${snapshot.formalization.contexts.map((c) => `${c.contextRef}(${c.status})`).join('、') || '无独立业务 Context；不适用理由见 assessment.applicability'}。纳入事实：${snapshot.formalization.includedFactRefs.join('、') || '无'}。ready 仅表示本批次职责就绪；support 只表达已纳入的支撑事实，不声称关联 Context 全部完成。读取 formalization.assessment 核对职责、事实来源、具体依赖和 remainingScope；缺口不编成正式事实。适用 FM 必须提交 discovery/formalization.md 中唯一 JSON 块，结构为 version:1、kind:discovery-coverage、revision:${snapshot.revision}、contexts:[{contextRef,status,modelRefs,retainedFactRefs,remainingScope}]、facts:[{factRef,modelRefs}]。contexts 覆盖全部评估 Context，pending 的 modelRefs 为空，其他 Context 映射到同 kind 的实际 Context ID；retainedFactRefs 列该 Context 全部未纳入事实，remainingScope 保持评估原文。facts 精确映射全部 includedFactRefs 到存在的模型 ID。说明与上一批次相比的新增、修订、撤回与未纳入原因。不可用旧 candidates 覆盖协议。详情按需读 .pi/skills/evidence-modeling/references/incremental-assessment.md。需求文档只以已纳入的模型为依据。`;
  }

  if (artifact.kind === 'fm-model') {
    return `# Evidence 统一 FM 建模任务

## 当前任务

- 阶段：${definition.label}（\`${state.phase}\`）
- 工件：${artifact.label}
- 模型目录：\`artifacts/02-modeling/fm-model/\`
- 轮次：${state.round}
- 项目目标：${state.goal}

## 统一建模方法

${skill}

## 必须读取的输入

${inputList(inputs)}

## 工件要求

${artifactPrompt}

## 提交约束

- 先判断当前范围是否有独立业务/领域语义；纯领域、纯渠道仍用同一 FM v3，不因没有合同而跳过。不适用仅限简单胶水等无独立语义范围，必须给出具体理由。
- 适用时读取所需的 \`.pi/skills/evidence-modeling/references/\` 文件，构造完整的分片 YAML 和可选验证场景。
- 不要提交 \`generated/\`、\`02-business-patterns.md\` 或 \`status.md\`，它们由扩展确定性生成。
- 不要使用 \`write\` 或 \`edit\` 写入模型目录。
- 最后调用 \`evidence_submit_fm_model\`，传入适用性、理由以及全部模型文件；该工具必须是最后一个动作。${feedbackSection(state)}
`;
  }

  return `# Evidence 本地执行任务

## 当前任务

- 阶段：${definition.label}（\`${state.phase}\`）
- 工件：${artifact.label}
- 输出路径：\`${artifact.output}\`
- 轮次：${state.round}
- 项目目标：${state.goal}

## 方法论

${skill}

## 必须读取的输入

${inputList(inputs)}

如果输入是目录，请只读取与当前工件相关的文件。若输出文件已经存在，也要先读取它，将本轮作为有依据的修订。

## 工件模板与质量要求

${artifactPrompt}

## 提交约束

- 不要使用 \`write\` 或 \`edit\` 直接写这个工件。
- 不要在普通回答中粘贴最终工件。
- 完成后把完整 Markdown 作为 \`content\` 调用 \`evidence_submit_artifact\`。
- \`evidence_submit_artifact\` 必须是最后一个动作。${feedbackSection(state)}
`;
}

export function buildPhaseGuard(state: EvidenceState): string {
  if (state.phase === 'complete' || state.status !== 'running') return '';
  const discovering =
    state.phase === 'modeling' && state.discovery.stage === 'discovering';
  const subject = discovering
    ? `interactive discovery revision ${state.discovery.revision}`
    : state.phase === 'coding'
      ? (currentCodingStory(state) ?? 'unknown story')
      : (getExpectedArtifact(state.phase, state.currentArtifactIndex)?.output ??
        state.phase);
  const tdd =
    state.phase === 'coding'
      ? `; TDD checkpoint: ${state.coding.tdd.stage}; completed cycles: ${state.coding.cycles.length}; active task/check: ${state.coding.tdd.binding ? `${state.coding.tdd.binding.taskId}/${state.coding.tdd.binding.checkId}` : 'none'}`
      : '';
  const checkpoint = discovering
    ? 'Use evidence_ask_questions to persist questions and stop for human answers, or evidence_save_discovery to save a checkpoint. Q&A accumulates discovery only. evidence_finalize_discovery requires the human update-model action and assesses the current batch; finish alone does not authorize publication. FM update returns to discovery, and requirements convergence is a separate human action. Do not require a formal artifact at the end of a discovery turn.'
    : 'Finish through the designated evidence_* submission tool.';
  return `\n\n## Evidence active scope
The deterministic local workflow is active. Current phase: ${state.phase}; current subject: ${subject}; round: ${state.round}${tdd}. Stay inside this scope. Do not advance workflow state yourself. ${checkpoint}`;
}
