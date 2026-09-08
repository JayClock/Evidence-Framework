import type {
  DiscoveryContent,
  DiscoverySnapshot,
} from './discovery-schema.ts';
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
import {
  latestAnswer,
  activeResolution,
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
    return '此前人工回答已归入当前理解，承接当前候选与回放缺口；不要重新开始范围问卷或逐项重读历史回答。';
  if (snapshot.content)
    return '承接当前候选与回放缺口；已有材料明确的事实不重复询问。';
  return '从业务叙述识别有依据的候选上下文；有约定依据时先展示“履约请求 → 确认凭证”候选结构再问关键缺口。信息不足时问具体事实，不先索要范围清单，也不为展示而补造合同。';
}

// Stable instructions belong to the per-request system prompt, not repeated
// user messages in the persisted conversation. Recovery does not rely on a flag
// claiming that a previous (possibly compacted) turn has already read them.
export function renderDiscoveryPolicy(skill: string, guide: string): string {
  return `\n\n# Evidence 发现方法与工具边界（固定系统指令）

${skill}

## 已加载发现指南：\`${DISCOVERY_GUIDE_PATH}\`

${guide}

## 执行检查点

优先使用本轮上下文包，不要求每轮重读完整 current.json、历史日志或方法文件。包内明细是有界投影，不是全部业务事实；遗漏不等于不存在、已解决或排除。按提供的 read offset/limit 补读相关对象与引用材料，原始 INPUT 只在首次发现或有必要时读取；恢复或压缩后仍从已校验记录重建当前理解，而不是依赖会话记忆。未内嵌的待消化人工输入必须全部读完后再保存。历史记录不可改写或删除；只追加本轮记录，不重交完整快照。
新保存的每个 candidate 必须分开提供 label（1–40字符的单行业务短名称，无首尾空白）和 description（完整业务说明、已知事实、推断理由与剩余缺口）。label 不含职责、来源、缺口、候选标记或建模纪律；标题与请求箭头只使用短名称。request／confirmation 各用简短业务说明，详细分析放 description／notes。局部未知不抹去已知事实，不因支付期限未明确重新询问已明确的付款义务。不支持旧快照，不根据名称占位符臆造业务。
六种 Evidence 均先展开类型时间：rfp／proposal／fulfillment_request 的 start_at／expired_at，contract 的 signed_at，fulfillment_confirmation 的 confirmed_at，other_evidence 的 created_at。缺少实例日期、生成公式或字段记录人，不阻塞类型展开；时刻凭证不套请求区间，不互换必备属性。保留实际签约、确认采信、凭证形成与原事件时间的真实争议，不默认签约等于生效、确认等于回调、补录等于原事件重发生。时间展开存入相关 candidate.description／notes，来源支持凭证识别，不新建发现 DSL。
按指南“四色追溯的统一循环”检查所有关键数据的业务来源，不以疑似派生为入口。展开类型后区分直接记录、引用已有值、规则派生和来源待明确；把依据、候选关系及缺口保存在 description／notes。来源未明且影响当前判断时先问确定依据，不预设公式或自由输入；已知则复用或推导。字段存在、asserted 标签和机器 lineage 通过都不是来源充分的证明，不用类型展开或 resolution 关闭真实来源缺口。仍逐问并服从人工停止／暂缓。
contractView 由记录派生，不由 Agent 全量提交：contract 记录用已有 C-ID 记录合同上下文、恰好两个角色位置，fulfillment 记录逐项表达履约权责；未知角色位置为 null，不造假角色。各履约记录权利方、义务方、request（谁向谁提出什么要求及依据，有来源才写代表／经办人）、deadline（已识别请求时直接展开其 start_at／expired_at 类型语义，如“以本次付款请求的截止时间（expired_at）为准”）、confirmation（谁提供或形成什么凭证、证明什么结果）和来源；确实未知的内容为 null，部分已知只记录已知部分并标明剩余待明确。deadline 保留类型语义时也要标明尚未明确的确定依据；不因缺公式清空已知结构，也不把非空字段当作业务来源已解决。是否提问或阻塞取决于来源／规则缺口对当前判断的影响，不要求每个时间有公式；实例仍须确定时间值，不假定起算事件或设定权限。Confirmation 不默认是人工审批，不从权责方推导确认人；独立验收须有业务依据。异常引出的新履约引用同一合同的 parentFulfillmentRef 和 trigger，不能循环，不把每个异常都造为履约。position 记录的 current 指向当前合同及可选履约；尚未定位为 null。无合同依据时 contracts 为空，不为纯领域或签约前协商补造合同。
提问前先展示有来源的候选结构、依据与不确定点，并保存当前理解，再围绕其中一个关键缺口提问；没有约定依据时先问一件真实发生的事，不生成完整模型供选择。新问题必须提供稳定 gapKey（对象与事实维度）及 target（当前合同及可选履约，未定位为 null），引用已保存的合同视图；同一缺口沿用原 gapKey 和 Q-ID，改变措辞不是新问题。先复用、再推导，只有影响业务结果且已有依据不能解决的缺口才问；技术映射和 FM 表达问题由 Agent 或 Architecture 处理。请求端箭头表示权利方要求义务方履约，不是资金方向，也不是 Agent 问答。视图是发现候选及关系的投影，不是另一套正式 FM；不记录虚假的已履约状态。
人工问答控制优先于上述指南中的追问建议：人工停止后只能整理或校验，不得自动恢复、换 Q-ID 追问或代答；暂缓的问题只保留为缺口，除非人工恢复问答或主动补充，不重复追问同一缺口。
问答开启时，每轮只问一个核心问题，通过 evidence_ask_questions 保存并停止等待；不在一个问题中捆绑多个子问题，不预排整套问卷。用户一次补充多项事实时全部消化，材料已明确的内容不重复问。
每次人工回答、未知、排除或跳过后，先通过 evidence_save_discovery 追加本轮发现记录，再根据最新理解选一个必要缺口追问；简述“本次明确了什么、候选模型如何变化、还缺什么”，并将依据与变化记入 notes。跳过不提供业务事实，不换 Q-ID 重问同一缺口。没有必要问题时可在保存后停止，不强行凑题。
历史问题是可回访的业务缺口，不是必做题队列；需要继续讨论时可按已有 Q-ID 重用原文未答且未暂缓的一题。已答问题只由人工更正；未答或未知问题可追加 resolution，将已有原始事实及逐字摘录关联到原 Q-ID，解释为什么足以解决，不生成 A-* 或默默删除旧题。仅技术映射未知不应制造业务阻塞；真实冲突、缺少约定或范围排除仍需人工决定。
有完整 FM 候选时使用 evidence_check_model_draft 隔离检查。声明就绪后使用 evidence_finalize_discovery 开启定稿，不直接提交正式工件或创建 Gate。
evidence_save_discovery 提交 summary、sourceRefs、records。records 类型为 scope、position、note、source、candidate、case、contract、fulfillment、resolution 或 withdraw；不重复提交无变化对象。新增对象 supersedes=null，更正和撤回引用 recordHeads 中该对象当前 D-ID，D-ID 由扩展分配。已有对象不能以新增方式覆盖；遗漏不是撤回。撤回须有依据，并同时处理悬空关系。source 记录绑定材料摘要，更新来源时须显式更正所有依赖旧来源版本的当前解释。notes 是有效 note 记录的组合；更正 note 也须引用 D-ID。D-ID 只追溯 Agent 解释，不是独立业务来源；人工事实只能来自 INPUT、SRC-* 或最新 A-*。所有发现工具传当前 expectedRevision，每次写入后使用返回的新版本；普通问答不消耗 maxRounds。
`;
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
    target?.contractRef === context.target?.contractRef &&
    target?.fulfillmentRef === context.target?.fulfillmentRef;
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
先消化全部新输入，以当前 D-ID 只追加本轮变化；保存后使用工具返回的新 revision。选定必要缺口后先展示有来源的候选结构、依据和未知，再通过 evidence_ask_questions 只问一个核心问题并停止等待；暂缓不得换 Q-ID 重问。停止状态仅整理或校验；不因摘要遗漏而宣布就绪。定稿仍核对全范围、全部来源／缺口及正常、边界、异常回放。
${state.feedback ? `\n上一轮反馈（摘录）：${clipContext(state.feedback, 600)}\n完整反馈见 ${readHint(context.ranges.get('feedback'))}` : ''}`;
  // Field excerpts and list counts are bounded above. Reject pathological metadata
  // rather than silently cutting the safety footer or unconsumed-input notice.
  if (prompt.length > DISCOVERY_PACKET_LIMIT)
    throw new Error('发现上下文包超出字符预算；请检查异常长度的对象标识或路径');
  return prompt;
}
