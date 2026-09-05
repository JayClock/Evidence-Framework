import {
  getExpectedArtifact,
  getPhaseDefinition,
  TESTING_CONTRACT_INPUTS,
} from './phases.ts';
import { projectEntryExists, readText, REQUIREMENTS_PATH } from './storage.ts';
import { currentCodingStory } from './workflow.ts';
import type { EvidenceConfig, EvidenceState } from './types.ts';

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

export async function buildCurrentPrompt(
  root: string,
  state: EvidenceState,
  config: EvidenceConfig,
): Promise<string> {
  if (state.phase === 'complete') throw new Error('Workflow is complete');
  const definition = getPhaseDefinition(state.phase);
  const skill = await requireInstructions(root, definition.skillFile);

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
      'artifacts/02-domain/fm-model',
      'artifacts/04-planning/sprint-1-backlog.md',
      'artifacts/04-planning/definition-of-done.md',
      'README.md',
    ];
    await requireInputs(root, inputs);
    return `# Evidence 本地执行任务

## 当前任务

- 阶段：编码与 TDD
- 用户故事：\`${storyId}\`
- 轮次：${state.round}
- TDD 检查点：\`${state.coding.tdd.stage}\`
- 项目目标：${state.goal}

## 方法论

${skill}

## 必须读取的输入

${inputList(inputs)}

## 执行要求

1. 在 Sprint 1 Backlog 中定位 ${storyId}，只实现该故事的范围；保留验收场景 ID、任务 ID、工序 ID 及适用的 FM 引用。
2. 先检查现有代码与测试，不要假设技术栈。按已批准的测试策略和当前适用工序明确被测边界、真实依赖、测试替身、场景数据和预期结果；不把被测业务逻辑替换掉。
3. 当前检查点为 \`${state.coding.tdd.stage}\`。在 Red 阶段先写真实测试，再调用 \`evidence_tdd_red\` 让扩展执行聚焦测试并记录失败；不得把语法错误、命令错误或无关失败当作 Red。
4. Red 被记录后写最小实现，并调用 \`evidence_tdd_green\`；扩展会重新执行完全相同的聚焦测试，且必须通过。
5. Green 被记录后进行 Refactor，保持测试通过。最终由扩展再次执行聚焦测试以及这些质量命令：${config.qualityCommands.map((command) => `\`${command}\``).join('、') || '未配置'}。
6. 不要只生成 Markdown 或伪代码，必须修改真实项目源码和测试。完成前核对当前故事各验收场景的 Q2 证据、关联 Q1 测试与适用工序；在实现摘要中列明测试文件/用例、真实结果及未完成项，不以测试总数代替验收覆盖。
7. 当前扩展仍仅记录每故事每修订轮的一组故事级 Red/Green/Refactor，不代表逐工序 TDD 已被机器验证。不要为切换工序重置状态、重复调用已完成检查点或虚构逐工序工具；无法满足的要求应报告并交由人工处理。
8. 最后调用 \`evidence_complete_story\`，提交实现摘要、Refactor 摘要和全部真实变更文件。调用后停止。${feedbackSection(state)}
`;
  }

  const artifact = getExpectedArtifact(state.phase, state.currentArtifactIndex);
  if (!artifact)
    throw new Error(`No pending artifact for phase ${state.phase}`);
  const inputs = [...new Set([REQUIREMENTS_PATH, ...artifact.inputs])];
  await requireInputs(root, inputs);
  const artifactPrompt = await requireInstructions(root, artifact.promptFile);

  if (artifact.kind === 'fm-model') {
    const modelingSkill = await requireInstructions(
      root,
      artifact.skillFile ?? definition.skillFile,
    );
    return `# Evidence 履约建模任务

## 当前任务

- 阶段：${definition.label}（\`${state.phase}\`）
- 工件：${artifact.label}
- 模型目录：\`artifacts/02-domain/fm-model/\`
- 轮次：${state.round}
- 项目目标：${state.goal}

## 领域方法

${skill}

## 履约建模方法

${modelingSkill}

## 必须读取的输入

${inputList(inputs)}

## 工件要求

${artifactPrompt}

## 提交约束

- 先判断 FM 是否适用；不适用时必须给出具体理由。
- 适用时读取所需的 \`.pi/skills/evidence-modeling/references/\` 文件，构造完整的分片 YAML 和可选验证场景。
- 不要提交 \`generated/\`，它由扩展确定性生成。
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
  const subject =
    state.phase === 'coding'
      ? (currentCodingStory(state) ?? 'unknown story')
      : (getExpectedArtifact(state.phase, state.currentArtifactIndex)?.output ??
        state.phase);
  const tdd =
    state.phase === 'coding'
      ? `; TDD checkpoint: ${state.coding.tdd.stage}`
      : '';
  return `\n\n## Evidence active scope
The deterministic local workflow is active. Current phase: ${state.phase}; current subject: ${subject}; round: ${state.round}${tdd}. Stay inside this scope. Do not advance workflow state yourself. Finish through the designated evidence_* submission tool.`;
}
