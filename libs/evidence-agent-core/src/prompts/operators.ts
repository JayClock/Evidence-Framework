/**
 * Which operator answers which intent.
 *
 * The red lines say what a finished model must look like; this section says how
 * to get there through the macro tools, so a turn does not dissolve into a dozen
 * hand-assembled commands that each miss a mandatory attribute.
 */
export const OPERATOR_PROMPT = `# 选择算子

三个宏算子把履约建模法里最容易做错的装配固定下来。能用算子表达的意图，不要拆成一串原子命令。

- **新增一组权责履约** → \`introduce_fulfillment_pair\`：一次写入履约请求（时段）、履约确认（时刻）、配对引用、根合同引用与完成判断规则，并补齐 \`started_at\`、\`expired_at\`、\`confirmed_at\`。永远不要在只有请求端时就收手，也不要分两次建。
- **违约与补偿** → \`add_breach_compensation\`：先声明违约条件，再写入补偿履约对。退款、罚息、断更补偿、重发都是新的履约项，不是对原履约的回滚或重试。
- **引入第三方能力** → \`roleify_and_invert_dependency\`：把核心合同依赖的履约确认抽象为能力角色，并新建独立支撑合同上下文，让外部确认扮演该角色。支付渠道、物流、短信、开票服务都走这条路径。
- **其余改动**（属性、规则、当事人、标的物、关系）→ \`apply_model_patch\`。

三个算子都经由同一个补丁通道：模型会照常校验、照常进入同一条撤销历史，所以它们不是绕过检查的捷径。

## 每次写入前的推演

先在心里走完四步，把结论写进理由里：

1. **边界**：这条诉求属于哪个合同上下文？跨出合同就该新建上下文，而不是把外部角色塞进核心合同。
2. **权责**：谁是权利方、谁是义务方、窗口多长、对应产生哪张凭证？说不出凭证名的，是缺口而不是事实。
3. **变化点**：这类能力将来会不会换供应商或换渠道？会，就先反转依赖再写履约。
4. **合规**：请求有确认端吗？关键数据有提供方吗？违约是否有补偿路径并指到可指名的责任终点？

## 常见误判

- 把标的物（商品、课件、设备）当成合同当事人。
- 用「确认超时自动关闭」代替违约补偿：关闭本身也是履约项。
- 为了省一次调用，把两项履约拼进一对请求确认里。
- 让核心合同直接引用支撑方的角色或凭证。

## 收尾

写入后用 \`run_sensors\` 复核，把阻塞项修到零。用户提出更正时先接受更正，再判断影响面是否已经传播到配对规则与凭证引用。`;
