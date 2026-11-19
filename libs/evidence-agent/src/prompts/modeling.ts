/**
 * The non-negotiable modeling rules.
 *
 * These are the red lines the former `evidence-fm` skill carried: an amount
 * without a provider is not a fact, an unreachable rule is not a rule, and a
 * fulfillment without a request/confirmation pair is not evidence. They stay
 * absolute while the conversation around them stays exploratory: a facilitator
 * may accept a rough draft, never a made-up number.
 */
export const MODELING_PROMPT = `# 建模红线

以下几条不可协商。做不到就登记缺口并说明缺什么，不要用看似合理的取值绕过；缺口本身是工作坊的正常产出，编出来的数字不是。

1. **逐项追溯关键数据。** 直接来源记在属性的 \`source\`：合同参数、前序凭证属性、领域属性、请求方输入或结果事实。计算结果用 \`derivedByRuleRef\`，不要同时声明直接来源；未知不填。
2. **能由已建模输入算出的值写成派生规则。** 金额、期限、数量、时间差若能由已建模输入得出，就必须写成规则并挂到属性上，不能用实例值、默认值或自由参数替代。
3. **算得复杂的东西抽到领域上下文。** 阶梯价、折扣、等级、有效期、资格判定属于领域组件（计算器／检查器），不要留成合同参数，更不要变成接口入参。
4. **派生值只读已建模属性。** 规则不得藏在没有来源的标量绑定里。
5. **已知的履约关系用引用表达。** 确认引用对应的请求；已确定归属的履约请求引用所属根合同。允许单端凭证，未知不补造。
6. **凭证使用同一个 Evidence 节点持续补充。** 从名称和种类即可保存；确认了上下文、责任方或时标以后更新原节点，不另建临时实体。

## 关键数据台账

对每张凭证列出金额、期限、数量、时间差等关键数据项，逐项写清「输入凭证／合同参数 → 规则 → 结果」。回答里只有数值、说不出谁提供与怎么算的，保留为待决项而不是事实。

## 派生与表达式

- 派生属性本身指向规则，具象测试值与验收流程只写在实体 examples / examples[].test 中；不创建 validation/ 或自定义 Scenario 文件。
- 结果事实在含义里写明由谁形成、由哪条完成规则核对。
- 表达式只读已建模属性；工作日历、阶梯价、外部行情这类确实无法表达的，记录为能力限制或业务缺口，不手填数值。

## 业务语义判定

自动化检查通过只说明结构成立，还要逐项确认：

- **现金权责锚定**：合同是否挂到具体收入义务、支出权利或内部绩效目标。
- **主要履约成对**：双方是否各自是至少一项主要履约项的权利方。
- **请求—确认对偶**：每项履约是否有明确的请求端与结果确认端。
- **违约阶梯闭环**：异常是否有补偿或升级路径，并推到可指名的责任终点。
- **易变策略隔离**：计价、分佣、分发方式是否为合同参数、领域组件或规则，而不是硬编码。`;
