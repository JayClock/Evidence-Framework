import type {
  DiscoveryContent,
  DiscoverySnapshot,
} from './discovery-schema.ts';
import {
  latestAnswer,
  pendingQuestions,
  unansweredQuestions,
  unresolvedBlockingQuestions,
} from './discovery.ts';
import { REQUIREMENTS_PATH } from './storage.ts';
import type { EvidenceState } from './types.ts';

// One maintained discovery method for both standalone skill use and runtime injection.
export const DISCOVERY_GUIDE_PATH =
  '.pi/skills/evidence-modeling/references/discovery-workshop.md';

const focusLabels = {
  scope: '核对具体业务边界',
  responsibilities: '合同双方与履约项',
  evidence: '请求、完成与确认凭证',
  lineage: '关键数据与历史依据',
  exceptions: '异常、更正与新责任',
  domain: '领域对象与规则',
  replay: '正常、边界与异常回放',
} satisfies Record<DiscoveryContent['focus'], string>;

function continuation(snapshot: DiscoverySnapshot, waiting: boolean): string {
  if (snapshot.interaction?.stopped)
    return '人工已结束本轮问答：禁止自动追问；先消化已有回答，整理当前候选、范围和全部缺口。不把暂缓或未回答当成事实或范围排除。存在阻塞项时保存发现草稿并停止；无阻塞项时仍须通过原有来源、回放及定稿校验。仅人工 /evidence-discovery resume 可恢复提问。';
  if (waiting) return '等待 /evidence-answer，不重复提问或代答。';
  if (snapshot.answers.length)
    return '先消化已保存的人工回答（每题以最新 A-ID 为准），承接当前候选与回放缺口；不要重新开始范围问卷。';
  if (snapshot.content)
    return '承接当前候选与回放缺口；已有材料明确的事实不重复询问。';
  return '从业务叙述识别有依据的候选上下文；信息不足时问具体事实，不先索要范围清单。';
}

// Presentation only: business context selection belongs to evidence-led reasoning,
// not a keyword classifier, a new persisted mode, or an automatic approval.
export function renderDiscoveryPrompt(
  state: EvidenceState,
  snapshot: DiscoverySnapshot,
  instructions: { skill: string; guide: string; feedback: string },
): string {
  const unanswered = unansweredQuestions(snapshot).map((q) => q.id);
  const unknown = snapshot.questions.flatMap((q) =>
    q.blocking && latestAnswer(snapshot, q.id)?.status === 'unknown'
      ? [q.id]
      : [],
  );
  const waiting =
    !snapshot.interaction?.stopped &&
    (state.status === 'waiting_answer' ||
      pendingQuestions(snapshot).length > 0);
  const focus = snapshot.content
    ? focusLabels[snapshot.content.focus]
    : '识别业务上下文';
  return `# Evidence 交互式业务发现与建模

- 当前阶段：modeling；发现版本：${state.discovery.revision}；修订轮次：${state.round}
- 当前焦点：${focus}（工作位置，不是必须顺序完成的阶段）
- 原始输入：\`${REQUIREMENTS_PATH}\`
- 发现快照：${state.discovery.path ? `\`${state.discovery.path}\`` : '无；从用户的业务叙述和材料开始'}
- 状态：${state.status}
- 尚未回答：${unanswered.join('、') || '无'}
- 暂缓问题：${snapshot.interaction?.deferredQuestionIds.join('、') || '无'}（不是业务回答或范围排除）
- 未解决的阻塞项：${
    unresolvedBlockingQuestions(snapshot)
      .map((q) => q.id)
      .join('、') || '无'
  }
- 阻塞且仍未知：${unknown.join('、') || '无'}
- 本轮衔接：${continuation(snapshot, waiting)}

## 方法与工具边界

${instructions.skill}

## 本轮发现指南（已加载：\`${DISCOVERY_GUIDE_PATH}\`）

${instructions.guide}

## 执行检查点

读取原始输入、快照及引用材料，而不是用会话记忆替代依据。按上述指南推进当前具体缺口。
人工问答控制优先于上述指南中的追问建议：人工停止后只能整理或校验，不得自动恢复、换 Q-ID 追问或代答；暂缓的问题只保留为缺口，除非人工恢复问答或主动补充，不重复追问同一缺口。
问答开启时，问题仅通过 evidence_ask_questions 保存并停止等待；发现成果通过 evidence_save_discovery 保存完整快照，也可在保存后停止。
有完整 FM 候选时使用 evidence_check_model_draft 隔离检查。声明就绪后使用 evidence_finalize_discovery 开启定稿，不直接提交正式工件或创建 Gate。
所有发现工具传当前 expectedRevision，每次写入后使用返回的新版本；普通问答不消耗 maxRounds。
${instructions.feedback}`;
}
