/**
 * How a large model is asked to read business prose into a draft.
 *
 * The lecture's method is a reading discipline, not a diagram style: find the
 * contract, split what came before it, pair every claim with the delivery that
 * answers it, and turn each failure into another explicit claim. The prompt
 * therefore states the five readings in order, because an extraction that starts
 * from the documents instead of the contract produces a document list with no
 * responsibilities in it.
 *
 * The prompt lives here rather than in the desktop so the rules travel with the
 * code, exactly like the modeling instructions a session already carries.
 */
export const INGESTION_PROMPT = `# 把业务叙述读成履约草稿

你的输入是一段业务自然语言：合同条款、需求文档、访谈记录或流程说明。你的输出是一个 JSON 草稿，供工作台编译成履约模型。你不画图，不解释，只输出 JSON。

## 七步读法（按顺序执行）

1. **先分三类。** 合约原文不是模型：把句子分成业务逻辑（谁在什么时刻向谁交付什么）、领域逻辑（计价、折算、校验等能写成算法的规则）、纯法务条款（管辖、仲裁、免责、送达、保密、份数）。业务条款才落成凭证，领域条款落成领域标的物，纯法务条款不进模型。一句话同时约定动作与算法的，动作进业务，算法另外抽成领域组件。

2. **先找合约。** 找双方形成法律或口头约束的那一刻，它是 \`contract\`，只有一个 \`signed_at\`。合约是双边协议，所以必须有两位当事人；它们成为合约绑定的两个角色。
3. **再分合约前的上下文。** 签约之前的询价、比价、方案征询是 \`rfp\`；报价、方案、套餐是 \`proposal\`。两者都是时段，归入 \`pre_contract\` 上下文，并指明它溯源到哪一份合约。
4. **然后成对读履约。** 权利方主张、义务方交付，构成一对：主张是 \`fulfillment_request\`（时段，有开始与截止），交付是 \`fulfillment_confirmation\`（时刻，有确认时间）。有请求而没有确认，就是业务缺口，不要补一个想象中的确认。
5. **把违约读成新履约。** 未按时履约的处理方案（退款、补偿、赔付、罚息）不是技术上的回滚，而是一个新的履约对，用 \`breachCompensations\` 指向被违反的那一对。
6. **然后分离标的物。** 交易对象（商品、课件、病历、设备）不是合约，是 \`things\`，归入 \`domain\` 上下文。
7. **最后抽出计算。** 算出来的值（阶梯价、折扣、等级、有效期、资格）写成 \`domainRole\` 为 \`calculator\` 或 \`checker\` 的标的物，并在 \`meaning\` 里写清它依据哪一句条款。

## 硬性约束

- **不臆造事实。** 文中没写的时限、金额、当事人，留空或省略字段，不要填“大约”“默认”的值。
- **每个元素都要有出处。** 每个凭证、角色、标的物的 \`provenance.text\` 必须是输入原文中的原句，\`provenance.locator\` 写“第 N 句”。
- **法务条款不许改写成履约。** 读不到业务动作的句子就留在模型之外；宁可少一个凭证，也不要把一条免责声明变成义务。
- **合约只有两个角色。** 其他参与人（财务、库管、销售）是 \`participants\`，通过 \`roles\` 的 \`playedByParticipantRef\` 扮演合约的两方；不要为每个人新建角色。
- **一个时刻只能承担一次确认。** 时段类凭证（\`rfp\`、\`proposal\`、\`fulfillment_request\`）不能当作履约完成的结果。
- **只输出 JSON。** 不要 Markdown 代码块以外的任何文字。

## 输出形状

\`\`\`json
{
  "modelName": "业务名称",
  "description": "一句话说明这份草稿覆盖的业务范围",
  "source": "contract | prd | interview | unknown",
  "contexts": [{ "id": "context.x", "label": "上下文名称", "kind": "contract | pre_contract | domain", "parentContextRef": "context.x", "rootRefs": ["contract.x"], "provenance": { "text": "原句", "locator": "第 1 句" } }],
  "participants": [{ "id": "party.x", "label": "当事人", "kind": "party" }],
  "roles": [{ "id": "role.x", "label": "角色", "kind": "party", "contextRef": "context.x", "playedByParticipantRef": "party.x" }],
  "things": [{ "id": "thing.x", "label": "标的物", "meaning": "业务含义", "contextRef": "context.domain", "domainRole": "calculator | checker" }],
  "evidences": [{ "id": "contract.x", "label": "凭证名称", "kind": "rfp | proposal | contract | fulfillment_request | fulfillment_confirmation | other_evidence", "contextRef": "context.x", "responsibleRoleRef": "role.x", "roleRefs": ["role.a", "role.b"], "attributes": [{ "name": "signed_at", "label": "签署时间", "meaning": "谁在什么业务动作中给出", "valueType": "timestamp", "required": true, "keyData": true }], "provenance": { "text": "原句", "locator": "第 1 句" } }],
  "fulfillmentPairs": [{ "id": "pair.x", "label": "请求 → 确认", "requestRef": "request.x", "confirmationRef": "confirmation.x", "proofRef": "evidence.x", "description": "这一对交付什么" }],
  "breachCompensations": [{ "id": "breach.x", "label": "违约处理", "triggeredByPairRef": "pair.x", "compensationPairRef": "pair.y", "conditionDescription": "什么情况下触发" }],
  "relationships": [{ "id": "relation.x", "kind": "references | plays_role", "sourceRef": "confirmation.x", "targetRef": "request.x", "label": "确认引用所属请求" }]
}
\`\`\`

时间属性是必填项：\`rfp\`、\`proposal\`、\`fulfillment_request\` 需要 \`started_at\` 与 \`expired_at\`；\`contract\` 需要 \`signed_at\`；\`fulfillment_confirmation\` 需要 \`confirmed_at\`；\`other_evidence\` 需要 \`created_at\`。`;

/**
 * Two readings that pin the prompt to the lecture's own cases.
 *
 * They are shipped with the prompt because the method's hard part is deciding
 * what is an evidence and what is prose: an example that only demonstrates the
 * JSON shape teaches nothing about the split.
 */
export const INGESTION_EXAMPLES: readonly {
  input: string;
  note: string;
}[] = [
  {
    note: '合同条款：一对履约，一个证明单据，一个违约退款',
    input:
      '当甲乙双方签订《企业级云服务采购协议》后，甲方需在 5 个工作日内完成首期技术服务费支付，并提供银行转账凭证；乙方在确认到账后 2 个工作日内开通企业账号权限并出具开通确认函。若乙方未在期限内开通服务，甲方有权发起违约退款申请，乙方应在 3 个工作日内全额原路退还。',
  },
  {
    note: '订阅规则：正向履约之外，断更触发的补偿履约',
    input:
      '读者订阅极客时间专栏后，可在订阅期内访问付费内容。读者未在 15 分钟内完成支付，订单自动关闭。若专栏出现断更，极客时间须在 3 个工作日内下架专栏并全额退款；退款完成后，下次同专栏上架不再向原读者收费。',
  },
];

/** Renders one extraction request: the discipline plus the business text. */
export const buildIngestionPrompt = (input: {
  text: string;
  modelName?: string;
}): { systemPrompt: string; userPrompt: string } => ({
  systemPrompt: INGESTION_PROMPT,
  userPrompt: [
    input.modelName === undefined ? '' : `模型名称：${input.modelName}`,
    '以下为需要阅读的业务原文：',
    '"""',
    input.text.trim(),
    '"""',
  ]
    .filter((line) => line.length > 0)
    .join('\n'),
});
