# 可追溯订阅付款：从依据到正式表达

这是一个合成的付款表达切片，不代表完整订阅业务已追责结束。内容提供、退款及其后续责任不在这个技术样例中展开；真实正式编辑不能用该切片缩小人类确认的业务范围。

## 合成依据与映射

样例约定：订阅合同提供价格与币种，付款请求引用合同；请求开始后 30 分钟截止，确认金额和币种须匹配请求，合格结果须在请求时段内形成。具体支付回执为确认提供补充证据。30 分钟及全部实例值都是合成条件，不是生产默认规则。

| 依据或判断       | 正式位置                                                                                                                            | 为什么这样表达                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 同一订阅责任边界 | [合同 Context](entities/context-contract--content-subscription.json)                                                                | 付款属于合同内履约，不另建责任边界              |
| 签约参数与双方   | [合同](entities/evidence-contract--content-subscription.json)                                                                       | 约定价格不是后续实付金额                        |
| 付款义务         | [履约](entities/fulfillment--content-payment.json)                                                                                  | 只声明合同归属，成员由自身归属与引用确定        |
| 要求及截止       | [付款请求](entities/evidence-fulfillment-request--content-payment.json)                                                             | 请求本身是时段凭证，关键属性显式定义            |
| 截止计算         | [期限规则](rules/rule--payment-deadline.json)                                                                                       | 在独立 CEL Rule 中派生，属性引用唯一规则        |
| 付款结果         | [付款确认](entities/evidence-fulfillment-confirmation--content-payment.json)                                                        | 完成证据与请求要求分开，业务时刻不是回调时刻    |
| 合格完成         | [完成规则](rules/rule--content-payment-completed.json)                                                                              | 结合匹配与时间判断，不在 Fulfillment 内重复规则 |
| 正常与逾期       | [正常场景](validation/scenarios/scenario--successful-payment.json)、[逾期场景](validation/scenarios/scenario--overdue-payment.json) | 预期由合成规则确定，不靠校验器输出反改预期      |

引用按消费凭证指向依据：付款请求 → 合同，付款确认 → 请求和补充回执。类型引用不是实例已形成的证明，实例依赖由 basedOn 指向已存在证据。

## 运行与反馈

用满足依赖的 Python 及实际安装目录，检查结果放在样例目录之外：

```bash
"$PYTHON" -B "$FM_SKILL_DIR/scripts/check_fm.py" \
  "$FM_SKILL_DIR/examples/valid-traceable-subscription" > "$FM_CHECK_FILE"
```

预期 valid 为 true，两项场景实际执行且 simulationPassed 为 true。运行前这些只是预期，实际退出码、摘要、覆盖和未执行项仍须报告。检查不会写入模型或批准业务。

## 反例

- 把付款建成 Context：混淆合同责任边界与合同内履约。
- 只在 Markdown 说明截止时间而删除请求属性：类型源缺少 required 时间定义，应检查失败。
- 把请求金额复制为自由输入：丢失合同到关键值的依据与派生关系。
- 用同字段的无关回执替换 basedOn：字段相同不能证明实例属于本次业务。
- 为了逾期场景通过而修改完成规则：倒改独立预期。

需要变化时修改临时副本并检查正反例，不直接更改样例条件或项目业务来源。
