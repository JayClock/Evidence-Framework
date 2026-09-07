import type {
  DiscoveryContent,
  DiscoverySnapshot,
} from './discovery-schema.ts';
import { contractViewLines } from './discovery-contract-view.ts';

const discoveryFocusLabels = {
  scope: '核对具体业务边界',
  responsibilities: '合同双方与候选履约结构',
  evidence: '履约请求与确认凭证',
  lineage: '关键数据与历史依据',
  exceptions: '异常、更正与新责任',
  domain: '领域对象与规则',
  replay: '正常、边界与异常回放',
} satisfies Record<DiscoveryContent['focus'], string>;
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

function continuation(snapshot: DiscoverySnapshot, waiting: boolean): string {
  if (snapshot.interaction.stopped)
    return '人工已结束本轮问答：禁止自动追问；先消化已有回答，整理当前候选、范围和全部缺口。不把暂缓或未回答当成事实或范围排除。存在阻塞项时保存发现草稿并停止；无阻塞项时仍须通过原有来源、回放及定稿校验。仅人工 /evidence-discovery resume 可恢复提问。';
  if (snapshot.interaction.needsConsolidation)
    return '先保存消化结果，再决定下一问：读取最新回答及跳过记录，更新候选、案例、focus 与 contractView；简述本次明确了什么、还缺什么。不得直接弹出预排的下一题。';
  if (waiting) return '等待 /evidence-answer，不重复提问或代答。';
  if (snapshot.answers.length)
    return '先消化已保存的人工回答（每题以最新 A-ID 为准），承接当前候选与回放缺口；不要重新开始范围问卷。';
  if (snapshot.content)
    return '承接当前候选与回放缺口；已有材料明确的事实不重复询问。';
  return '从业务叙述识别有依据的候选上下文；有约定依据时先展示“履约请求 → 确认凭证”候选结构再问关键缺口。信息不足时问具体事实，不先索要范围清单，也不为展示而补造合同。';
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
    !snapshot.interaction.stopped &&
    (state.status === 'waiting_answer' ||
      pendingQuestions(snapshot).length > 0);
  const focus = snapshot.content
    ? discoveryFocusLabels[snapshot.content.focus]
    : '识别业务上下文';
  return `# Evidence 交互式业务发现与建模

- 当前阶段：modeling；发现版本：${state.discovery.revision}；修订轮次：${state.round}
- 当前焦点：${focus}（工作位置，不是必须顺序完成的阶段）
- 原始输入：\`${REQUIREMENTS_PATH}\`
- 发现快照：${state.discovery.path ? `\`${state.discovery.path}\`` : '无；从用户的业务叙述和材料开始'}
- 状态：${state.status}
- 尚未回答：${unanswered.join('、') || '无'}
- 暂缓问题：${snapshot.interaction.deferredQuestionIds.join('、') || '无'}（不是业务回答或范围排除）
- 未解决的阻塞项：${
    unresolvedBlockingQuestions(snapshot)
      .map((q) => q.id)
      .join('、') || '无'
  }
- 阻塞且仍未知：${unknown.join('、') || '无'}
- 本轮衔接：${continuation(snapshot, waiting)}

## 候选履约：请求与确认凭证（与问答界面同源）

${contractViewLines(snapshot)
  .map((line) => `- ${line}`)
  .join('\n')}

## 方法与工具边界

${instructions.skill}

## 本轮发现指南（已加载：\`${DISCOVERY_GUIDE_PATH}\`）

${instructions.guide}

## 执行检查点

读取原始输入、快照及引用材料，而不是用会话记忆替代依据。按上述指南推进当前具体缺口。
新保存的每个 candidate 必须分开提供 label（1–40字符的单行业务短名称，无首尾空白）和 description（完整业务说明、已知事实、推断理由与剩余缺口）。label 不含职责、来源、缺口、候选标记或建模纪律；标题与请求箭头只使用短名称。request／confirmation 各用简短业务说明，详细分析放 description／notes。局部未知不抹去已知事实，不因支付期限未明确重新询问已明确的付款义务。旧 v3 缺 label 时继续读取原说明，下一次正常保存再根据原材料补齐短名称，不覆盖历史；不要根据名称占位符臆造业务。
保存发现必须提供 contractView：contracts 用已有 C-ID 记录合同上下文、恰好两个角色位置及其履约权责；未知角色位置为 null，不造假角色。各履约记录权利方、义务方、request（谁向谁提出什么要求及依据，有来源才写代表／经办人）、deadline（期限依据）、confirmation（谁提供或形成什么凭证、证明什么结果）和来源；未知内容为 null，部分已知只记录已知部分并标明剩余待明确。Confirmation 不默认是人工审批，不从权责方推导确认人；独立验收须有业务依据。异常引出的新履约引用同一合同的 parentFulfillmentRef 和 trigger，不能循环，不把每个异常都造为履约。current 指向当前合同及可选履约；尚未定位为 null。无合同依据时 contracts 为空，不为纯领域或签约前协商补造合同。
提问前先展示有来源的候选结构、依据与不确定点，并保存当前理解，再围绕其中一个关键缺口提问；没有约定依据时先问一件真实发生的事，不生成完整模型供选择。问题必须提供 target（当前合同及可选履约，未定位为 null），引用已保存的合同视图。请求端箭头表示权利方要求义务方履约，不是资金方向，也不是 Agent 问答。视图是发现候选及关系的投影，不是另一套正式 FM；不记录虚假的已履约状态。
人工问答控制优先于上述指南中的追问建议：人工停止后只能整理或校验，不得自动恢复、换 Q-ID 追问或代答；暂缓的问题只保留为缺口，除非人工恢复问答或主动补充，不重复追问同一缺口。
问答开启时，每轮只问一个核心问题，通过 evidence_ask_questions 保存并停止等待；不在一个问题中捆绑多个子问题，不预排整套问卷。用户一次补充多项事实时全部消化，材料已明确的内容不重复问。
每次人工回答、未知、排除或跳过后，先通过 evidence_save_discovery 保存消化后的完整快照，再根据最新理解选一个必要缺口追问；简述“本次明确了什么、候选模型如何变化、还缺什么”，并将依据与变化记入 notes。跳过不提供业务事实，不换 Q-ID 重问同一缺口。没有必要问题时可在保存后停止，不强行凑题。
历史问题是可回访的业务缺口，不是必做题队列；需要继续讨论时可按已有 Q-ID 重用原文未答且未暂缓的一题。已答问题只由人工更正；过时的阻塞项仍需人工有依据地解决或排除，不能悄悄删除。
有完整 FM 候选时使用 evidence_check_model_draft 隔离检查。声明就绪后使用 evidence_finalize_discovery 开启定稿，不直接提交正式工件或创建 Gate。
所有发现工具传当前 expectedRevision，每次写入后使用返回的新版本；普通问答不消耗 maxRounds。
${instructions.feedback}`;
}
