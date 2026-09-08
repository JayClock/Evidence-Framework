import { type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { getExpectedArtifact, getPhaseDefinition } from '../../../phases.ts';
import type { EvidenceState } from '../../../types.ts';
import { currentCodingStory } from '../../../workflow.ts';

export function phaseLabel(state: EvidenceState): string {
  if (state.phase === 'complete') return '已完成';
  return getPhaseDefinition(state.phase).label;
}

export function subjectLabel(state: EvidenceState): string {
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

export function statusIcon(status: EvidenceState['status']): string {
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

export function progressText(state: EvidenceState): string {
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

export function statusMarkdown(
  state: EvidenceState,
  contractView: string[] = [],
): string {
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
    lines.push(
      '- 下一步：`/evidence-answer`（可跳过），或 `/evidence-discovery finish` 结束本轮并整理',
    );
  if (state.phase === 'coding')
    lines.push(`- TDD 检查点：\`${state.coding.tdd.stage}\``);
  if (state.lastError) lines.push(`- 最近错误：${state.lastError}`);
  if (state.feedback) lines.push('', '## 当前反馈', '', state.feedback);
  if (contractView.length)
    lines.push(
      '',
      '## 合同履约权责',
      '',
      ...contractView.map((line) => `- ${line}`),
    );
  return `${lines.join('\n')}\n`;
}

export function clearStatusDisplay(ctx: ExtensionContext): void {
  // Remove displays left by an earlier extension load; status now lives in messages.
  ctx.ui.setWidget('evidence', undefined);
  ctx.ui.setStatus('evidence', undefined);
  ctx.ui.setStatus('evidence-check', undefined);
}
