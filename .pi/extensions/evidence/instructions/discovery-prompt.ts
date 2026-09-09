import {
  MODELING_ADAPTER_PATH,
  DISCOVERY_SKILL_ROOT,
  FM_SKILL_ROOT,
} from '../contracts/paths.ts';
import {
  activeResolution,
  latestAnswer,
  pendingQuestions,
  unansweredQuestions,
  unresolvedBlockingQuestions,
} from '../modeling/discovery/questions.ts';
import {
  sameDiscussionTarget,
  type DiscoveryContent,
  type DiscoverySnapshot,
} from '../modeling/discovery/schema.ts';
import { REQUIREMENTS_PATH } from '../storage.ts';
import type { EvidenceState } from '../types.ts';
import {
  candidateContextLines,
  clipContext,
  DISCOVERY_PACKET_LIMIT,
  inputContextLines,
  readHint,
  type DiscoveryContext,
} from './discovery-context.ts';

const discoveryFocusLabels = {
  scope: '核对具体业务边界',
  responsibilities: '合同双方与候选履约结构',
  evidence: '履约请求与确认凭证',
  lineage: '关键数据与历史依据',
  exceptions: '异常、更正与新责任',
  domain: '领域对象与规则',
  replay: '正常、边界与异常回放',
} satisfies Record<DiscoveryContent['focus'], string>;

// Compose interview discipline with read-only FM knowledge, never the generation workflow.
export const DISCOVERY_GUIDE_PATH = `${FM_SKILL_ROOT}/references/business-analysis.md`;
export const DISCOVERY_POLICY_PATHS = [
  `${DISCOVERY_SKILL_ROOT}/SKILL.md`,
  `${DISCOVERY_SKILL_ROOT}/references/interview.md`,
  DISCOVERY_GUIDE_PATH,
  `${FM_SKILL_ROOT}/references/provenance.md`,
  `${FM_SKILL_ROOT}/references/scenario-validation.md`,
  MODELING_ADAPTER_PATH,
];

function continuation(snapshot: DiscoverySnapshot, waiting: boolean): string {
  if (snapshot.modelUpdateRequested)
    return '人工已选择「更新模型」：先消化全部新增回答并保存发现，然后必须调用 evidence_finalize_discovery，提交覆盖全部历史候选的 Context assessment v1。按需读 .pi/extensions/evidence/instructions/incremental-assessment.md：Domain、Channel、Contract、Fulfillment 按本批次职责评估具体 facts、requiredFactRefs、structure/provenance/decision 事实依赖及回放；阻塞题映射 affectedFactRefs。不要只看当前焦点，不要求关联 Context 整体完成；明确 ready、support、pending 和 remainingScope，没有可纳入职责也须提交实际评估。不得追问、代答、排除范围或捏造责任终点。';
  if (snapshot.interaction.stopped)
    return '人工已结束本轮问答：禁止自动追问；先消化已有回答，仅整理发现与缺口并停止，不更新正式模型，不调用 evidence_finalize_discovery。仅人工选择 /evidence-discovery update-model 才授权更新模型；/evidence-discovery resume 恢复提问。';
  if (snapshot.interaction.needsConsolidation)
    return '先保存消化结果，再决定下一问：读取最新回答及跳过记录，更新候选、案例、focus 与 businessView；简述本次明确了什么、还缺什么。不得直接弹出预排的下一题。';
  if (waiting) return '等待 /evidence-answer，不重复提问或代答。';
  if (snapshot.answers.length)
    return '此前人工回答已归入当前理解，承接当前候选与回放缺口；不要重新开始范围问卷或逐项重读历史回答。';
  if (snapshot.content)
    return '承接当前候选与回放缺口；已有材料明确的事实不重复询问。';
  return '从业务叙述识别有依据的候选上下文；有约定依据时先展示“履约请求 → 确认凭证”候选结构再问关键缺口。信息不足时问具体事实，不先索要范围清单，也不为展示而补造合同。';
}

// Stable instructions belong to the per-request system prompt, not repeated
// user messages in the persisted conversation. Recovery does not rely on a flag
// claiming that a previous (possibly compacted) turn has already read them.
export function renderDiscoveryPolicy(
  resources: { path: string; content: string }[],
): string {
  return `\n\n# Evidence 发现方法与工具边界（固定系统指令）\n\n${resources
    .map(({ path, content }) => `## 已加载指令：\`${path}\`\n\n${content}`)
    .join('\n\n')}`;
}

export function renderDiscoveryPrompt(
  state: EvidenceState,
  snapshot: DiscoverySnapshot,
  context: DiscoveryContext,
): string {
  const list = (ids: string[]) => clipContext(ids.join('、') || '无', 260);
  const unanswered = unansweredQuestions(snapshot).map((q) => q.id);
  const blocking = unresolvedBlockingQuestions(snapshot);
  const unknown = blocking.filter(
    (q) => latestAnswer(snapshot, q.id)?.status === 'unknown',
  );
  const waiting =
    !snapshot.interaction.stopped &&
    (state.status === 'waiting_answer' ||
      pendingQuestions(snapshot).length > 0);
  const related = (target: typeof context.target) =>
    sameDiscussionTarget(target, context.target);
  const gaps = blocking
    .filter((q) => related(q.target))
    .slice(0, 3)
    .map(
      (q) =>
        `${q.id}：${clipContext(q.prompt, 220)}；影响：${clipContext(q.impact, 120)}\n${readHint(context.ranges.get(`question:${q.id}`))}`,
    );
  const cases = (snapshot.content?.cases ?? [])
    .slice(-2)
    .map(
      (c) =>
        `${c.id} ${c.kind}：${clipContext(c.gap, 220)}\n${readHint(context.ranges.get(`case:${c.id}`))}`,
    );
  const prompt = `# Evidence 交互式业务发现与建模

- 当前阶段：modeling；发现版本：${snapshot.revision}；修订轮次：${state.round}
- 当前焦点：${snapshot.content ? discoveryFocusLabels[snapshot.content.focus] : '识别业务上下文'}（工作位置，不是阶段队列）
- 原始输入：\`${REQUIREMENTS_PATH}\`（首次或需要核对时读，不逐轮重读）
- 发现记录链末尾：${state.discovery.path ?? '无；从业务叙述开始'}
- 状态：${state.status}；本轮衔接：${continuation(snapshot, waiting)}
- 尚未回答：${list(unanswered)}（不含已关联有效解决依据的问题；不代表人工已回答）
- 已关联解决依据（Agent 解释）：${list(snapshot.questionResolutions.filter((r) => activeResolution(snapshot, r.questionId)).map((r) => r.questionId))}
- 暂缓问题：${list(snapshot.interaction.deferredQuestionIds)}（不是业务回答或范围排除）
- 未解决的阻塞项：${list(blocking.map((q) => q.id))}
- 阻塞且仍未知：${list(unknown.map((q) => q.id))}
- 依据失效：${list(snapshot.staleRecordKeys)}
- 上次成功更新模型：${snapshot.appliedModel ? `发现 v${snapshot.appliedModel.revision}；${snapshot.appliedModel.contexts.map((c) => `${c.contextRef}(${c.status})`).join('、') || 'FM 不适用'}；纳入事实 ${snapshot.appliedModel.includedFactRefs.length} 项；完整剩余职责见评估` : '尚无本运行的手动更新批次'}
- 当前操作：${snapshot.modelUpdateRequested ? '人工授权更新模型，整理后执行全历史评估' : '仅积累问答，不更新正式模型'}

## 本轮人工输入

${inputContextLines(context, snapshot)}

## 当前理解与讨论对象（有界摘要，不是完整模型）

范围：${clipContext(snapshot.content?.scope ?? '尚待发现', 420)}
已确认排除／尚未探索：${clipContext(snapshot.content?.excludedScope ?? '尚未明确，不自动排除', 260)}
${readHint(context.ranges.get('scope'))}

${candidateContextLines(snapshot, context)}

## 相关缺口

${gaps.join('\n') || '当前对象无已登记的未解决阻塞题；不代表其他对象无缺口。'}
回放缺口（最近 ${cases.length} 项，不代表全部）：
${cases.join('\n') || '尚无回放记录'}
完整缺口／暂缓索引：${readHint(context.ranges.get('gaps'))}
索引包含全部 Q-ID／gapKey／target 及解决依据 D-ID、来源和失效标记；提新题前核对相关缺口，resolution 原文按明细索引读取。

## 按需补读与本轮动作

此包适用于启动、续轮及恢复；依据来自校验后的发现记录，不把候选当人工确认。对象／问题／回答／notes 明细索引：${readHint(context.catalog)}。明细缓存 revision 必须与本轮一致；写入后旧行号不用于下一版本。无需新增查询工具，不默认整份 read current.json。
先消化全部新输入，以当前 D-ID 只追加本轮变化；保存后使用工具返回的新 revision。选定必要缺口后先展示有来源的候选结构、依据和未知，再通过 evidence_ask_questions 只问一个核心问题并停止等待；暂缓不得换 Q-ID 重问。停止状态仅整理；人工已选择更新模型时，整理后执行全历史评估，不因当前焦点或摘要遗漏丢掉其他已完整成果。定稿按纳入单元核对业务来源、必要依赖和正常／边界／异常回放；未纳入项仍保留缺口，不等同排除。
${state.feedback ? `\n上一轮反馈（摘录）：${clipContext(state.feedback, 600)}\n完整反馈见 ${readHint(context.ranges.get('feedback'))}` : ''}`;
  // Field excerpts and list counts are bounded above. Reject pathological metadata
  // rather than silently cutting the safety footer or unconsumed-input notice.
  if (prompt.length > DISCOVERY_PACKET_LIMIT)
    throw new Error('发现上下文包超出字符预算；请检查异常长度的对象标识或路径');
  return prompt;
}
