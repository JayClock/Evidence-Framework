# 专栏订阅 FM

## 结构

按业务上下文组织，履约中的凭证、证明角色和规则就近存放：

```text
fm/
├── model.yaml
├── participants/user.yaml
├── contexts/
│   ├── subscription/
│   │   ├── context.yaml
│   │   ├── contract.yaml
│   │   ├── roles/
│   │   ├── relationships/
│   │   └── fulfillments/
│   │       ├── payment/
│   │       ├── access/
│   │       ├── refund/
│   │       └── restore/
│   ├── mobile/fulfillments/mobile/
│   ├── prepaid/fulfillments/prepaid/
│   └── content/things/
├── relationships/
├── validation/
└── generated/
```

- [订阅合同](contexts/subscription/contract.yaml)、[移动支付协议](contexts/mobile/contract.yaml)、[预付费账户协议](contexts/prepaid/contract.yaml)及[内容领域](contexts/content/context.yaml)分别保留业务边界。
- `contexts/` 与 `participants/` 共含 41 个业务对象；两处“专栏平台”角色仍使用各自 ID 和合同归属。
- 各履约目录以 `context.yaml` 表达责任边界，`request.yaml`、实际存在的 `confirmation.yaml`、`evidence/`、`roles/` 和 `rules/` 表达该履约的凭证与规则。订阅付款通过证明角色判断结果，不补造本地确认类型。
- 共 41 条关系：24 条放在两端最近的共同上下文的 `relationships/`，17 条跨独立上下文或主体扮演关系放在根 `relationships/`，不复制定义。免费恢复按两层基数表达：一份原订阅可对应多次恢复请求，但同一次重新上架活动至多对应一份有效恢复请求。
- 共 25 条 CEL 规则，就近放在所属履约的 `rules/` 中，包含关键值计算、访问资格、履约完成和违约判断。
- `validation/instances/`：27 份回放单据。
- `validation/scenarios/`：18 个正常、边界和异常场景。
- `generated/`：编译模型、属性追溯、模拟结果和业务时间线。

模型概览见 [00-overview.md](00-overview.md)，术语见 [01-glossary.md](01-glossary.md)，完整条款见 [业务规则](../discovery.md)。

本次目录重构按用户指定直接替换原扁平组织，迁移 107 份源 YAML（41 对象、41 关系、25 规则），原文件内容及稳定 ID 不变；不保留旧目录副本、软链接或路径映射。加载器按 YAML 的 `type` 递归识别源对象，目录不决定业务归属。测试实例、场景和本次迁移前已有的生成文件不改写。

## 主体与角色

用户（`party.user`）是跨合同保持身份的主体，分别在订阅、移动支付和预付费账户上下文中扮演读者（`role.reader`）、支付用户（`role.mobile-user`）和账户使用方（`role.account-user`）。凭证中的 `reader_id` 表示对应读者的主体编号，角色扮演不自动扩大办理权限。

按本次用户决定，不展开专栏运营企业和移动支付机构的 Party 节点：删除 `party.publisher`、`party.mobile-provider` 及其三条 `plays_role` 关系，保留 `role.publisher`、`role.account-provider`、`role.mobile-provider` 及原有合同权责。省略扮演者不表示现实中没有责任主体。方法依据为《使用履约建模法实施面向业务设计（中篇直播版）》第 55 页：在不影响分析和理解的前提下，可以选择性标注扮演者。

`generated/` 是从当前源 YAML 和 validation 重建的派生产物；后续消费仍应重新校验当前源文件。

## 校验

在项目根执行：

```bash
python3 .agents/skills/evidence-fm/scripts/check_fm.py "$PWD/.evidence/fm"
```

Python 环境需满足 `evidence-fm/requirements.txt`。命令只读取当前输入，修改模型后需重新执行。已保存结果位于 [checks/fm](../checks/fm/)。

## 验证边界

场景执行固定时刻下的凭证追加、可见性、属性计算、资格及责任状态判断，不执行真实支付、内容服务、数据库事务或认证流程。关系基数被静态校验；运行时唯一退款、幂等扣减和主体隔离应由实现测试验证。
