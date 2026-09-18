# CRM 电话销售建模评估

## 来源与范围

本批次依据用户直接提供的 CRM 电话销售业务要求，并纳入后续模型决定：“直接用 `.evidence/fm/participants/user.yaml` 进行扮演”。本文件只记录纳入判断，不保存外部材料的名称、文件路径、章节或摘要。

## 批次判断

| 职责             | 判断    | 纳入模型的事实或原因                                                                                           |
| ---------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| 客户信息领域     | support | 客户档案是电话销售实际联系的业务标的物；当前只需稳定档案身份，不宣称完整生命周期                               |
| 电话销售绩效协议 | ready   | 管理者与电话销售在周期开始时就绩效目标达成一致，构成内部权责约定                                               |
| 月度客户联系目标 | ready   | 管理者提出带业务周期及总数、电话数、邮件数目标的请求；电话销售每次联系形成记录，三项目标分别达到才完成         |
| 角色扮演主体     | support | 用户决定复用 `party.user` 分别扮演绩效管理者和电话销售；该类型关系不证明同一协议实例中由同一自然人承担双方     |
| 周度进度检查     | pending | 当前业务输入确认存在检查请求及检查记录，但没有明确检查记录由哪一方负责形成，不能建立合法 Confirmation 责任归属 |
| 目标设定流程     | pending | 不同目标设定方式下权利方和义务方可能不同，当前业务输入没有给出现实选择                                         |
| 未达标后果       | pending | 当前业务输入没有给出补偿、处分、违约或责任终点，不能建立 breach 或后续履约                                     |

## 来源到模型

- 客户档案：`context.customer-information`、`thing.customer-profile`。
- 内部绩效约定：`context.sales-performance`、`contract.sales-performance`、`role.performance-manager`、`role.tele-sales`。
- 角色扮演：`relation.user-as-performance-manager`、`relation.user-as-tele-sales` 均以 `party.user` 为玩家；不据此推导实例级双方同一性或额外权限。
- 月度目标：`fulfillment.monthly-customer-contact`、`request.monthly-customer-contact`。
- 联系凭证与完成判断：`confirmation.customer-contact-record`、`rule.monthly-customer-contact-completed`。
- “电话／邮件”仅作为来源明确的 `channel` 值；没有扩展为拨号器、页面、数据库或同步回调。

## 验证边界

场景中的协议编号、客户档案编号、时刻和 3／2／1 目标数均为合成数据，只用于验证来源规则，不表示真实企业已经采用这些指标。当前模拟器不能实例化 `thing.customer-profile`，所以客户档案实例引用一致性仍是验证缺口。
