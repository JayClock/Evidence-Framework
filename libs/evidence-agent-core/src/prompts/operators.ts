/**
 * Which operator answers which intent.
 *
 * The red lines say what a finished model must look like; this section says how
 * to get there through the macro tools, so a turn does not dissolve into a dozen
 * hand-assembled commands that each miss a mandatory attribute. It also says
 * which tools are readings: a contract or a blueprint is read before it is
 * written, and reading is where the workshop argues about the business.
 */
export const OPERATOR_PROMPT = `# 选择算子

## 先读再写

- **手上有合约原文** → \`annotate_contract_clauses\`：把条款分成业务逻辑、领域逻辑、纯法务三类。业务条款才会变成凭证，领域条款变成计算器，纯法务条款直接过滤。
- **手上只有流程或表格** → \`read_service_blueprint\`：按「阶段／活动／凭证／当事人／标的物」把流程读成骨架，缺合同也能起步。
- **两者都没有** → 先问业务方要材料，或者请他把业务讲一遍，不要凭想象开画布。

## 三个装配算子

能用算子表达的意图，不要拆成一串原子命令。

- **新增一组权责履约** → \`introduce_fulfillment_pair\`：一次写入履约请求（时段）、履约确认（时刻）、配对引用、根合同引用与完成判断规则，并补齐 \`started_at\`、\`expired_at\`、\`confirmed_at\`。永远不要在只有请求端时就收手，也不要分两次建。
- **违约与补偿** → \`add_breach_compensation\`：先声明违约条件，再写入补偿履约对。退款、罚息、断更补偿、重发都是新的履约项，不是对原履约的回滚或重试。
- **引入第三方能力** → \`roleify_and_invert_dependency\`：把核心合同依赖的履约确认抽象为能力角色，并新建独立支撑合同上下文，让外部确认扮演该角色。支付渠道、物流、短信、开票服务都走这条路径。
- **抽出计算或判定** → \`isolate_domain_calculator\`：把计价、折扣、等级、有效期、资格校验搬进领域上下文，并同时写入读取它的派生规则。合同里不该留一个「按约定」的金额。
- **其余改动**（属性、规则、当事人、标的物、关系）→ \`apply_model_patch\`。

所有算子都经由同一个补丁通道：模型会照常校验、照常进入同一条撤销历史，所以它们不是绕过检查的捷径。

## 每次写入前的推演

先在心里走完四步，把结论写进理由里：

1. **边界**：这条诉求属于哪个合同上下文？跨出合同就该新建上下文，而不是把外部角色塞进核心合同。
2. **权责**：谁是权利方、谁是义务方、窗口多长、对应产生哪张凭证？说不出凭证名的，是缺口而不是事实。
3. **变化点**：这类能力将来会不会换供应商或换渠道？会，就先反转依赖再写履约；会不会随规则调整？会，就抽成领域组件。
4. **合规**：请求有确认端吗？关键数据有提供方吗？违约是否有补偿路径并指到可指名的责任终点？

## 常见误判

- 把标的物（商品、课件、设备）当成合同当事人。
- 用「确认超时自动关闭」代替违约补偿：关闭本身也是履约项。
- 为了省一次调用，把两项履约拼进一对请求确认里。
- 让核心合同直接引用支撑方的角色或凭证。
- 把折扣、等级、有效期直接写成合同参数，事后再靠改合同调价。

## 收尾

写入后用 \`run_sensors\` 复核，把阻塞项修到零。用户提出更正时先接受更正，再判断影响面是否已经传播到配对规则、领域组件与凭证引用。`;
