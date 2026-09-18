# 专栏订阅与 CRM 电话销售 FM

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
│   ├── content/things/
│   ├── sales-performance/
│   │   ├── contract.yaml
│   │   ├── roles/
│   │   └── fulfillments/monthly-customer-contact/
│   └── customer-information/things/
├── relationships/
├── validation/
└── generated/
```

- [订阅合同](contexts/subscription/contract.yaml)、[移动支付协议](contexts/mobile/contract.yaml)、[预付费账户协议](contexts/prepaid/contract.yaml)及[内容领域](contexts/content/context.yaml)分别保留原有业务边界。
- [电话销售绩效协议](contexts/sales-performance/contract.yaml)与[客户信息领域](contexts/customer-information/context.yaml)是新增且相互分离的边界：前者表达内部绩效履约，后者只提供客户档案标的物。
- `contexts/` 与 `participants/` 共含 50 个业务对象；两处“专栏平台”角色仍使用各自 ID 和合同归属。
- 各履约目录以 `context.yaml` 表达责任边界，`request.yaml`、实际存在的 `confirmation.yaml`、`evidence/`、`roles/` 和 `rules/` 表达该履约的凭证与规则。订阅付款通过证明角色判断结果，不补造本地确认类型。
- 共 46 条关系；CRM 中的客户联系记录通过跨上下文 `references` 关系指向客户档案，`party.user` 分别扮演绩效管理者和电话销售角色。
- 共 26 条 CEL 规则；新增规则分别核对月度联系总数、电话数和邮件数。
- `validation/instances/`：32 份回放单据。
- `validation/scenarios/`：20 个正常、边界和异常场景，其中 2 个覆盖 CRM 月度目标完成与不足。
- `generated/`：当前保留上次重建结果，本批次未请求刷新；消费前应从当前源 YAML 和 validation 重建。

模型概览见 [00-overview.md](00-overview.md)，术语见 [01-glossary.md](01-glossary.md)，CRM 本批次来源、纳入判断与缺口见 [crm-assessment.md](crm-assessment.md)，原订阅业务条款见 [业务规则](../discovery.md)。

原目录重构保留原有订阅模型稳定 ID；本批次新增 CRM 上下文时同样按 YAML 的 `type` 递归识别源对象，目录不决定业务归属。CRM 不与专栏订阅建立业务关系，只作为同一模型中的独立入口。

## 主体与角色

用户（`party.user`）是跨合同保持身份的主体，分别在订阅、移动支付、预付费账户和电话销售绩效上下文中扮演读者（`role.reader`）、支付用户（`role.mobile-user`）、账户使用方（`role.account-user`）、绩效管理者（`role.performance-manager`）或电话销售（`role.tele-sales`）。同一 Participant 类型连接绩效协议双方，表示用户主体可承担任一角色，不证明同一协议实例由同一自然人同时承担双方。角色扮演不自动扩大办理权限。

按已有业务决定，不展开专栏运营企业和移动支付机构的 Party 节点：保留 `role.publisher`、`role.account-provider`、`role.mobile-provider` 及原有合同权责，但不建立对应 Party 与 `plays_role` 关系。省略扮演者不表示现实中没有责任主体。

## CRM 范围

绩效管理者（`role.performance-manager`）和电话销售（`role.tele-sales`）通过绩效协议形成内部权责边界。管理者提出带周期和三项目标数的月度联系请求；电话销售每次联系客户后形成一份记录，记录必须指向客户档案并注明电话或邮件渠道。完成规则只在总数、电话数和邮件数均达到本次约定值时成立。

周度检查记录的责任方、目标设定方式和未达标后果缺少来源，当前不编成 Confirmation、breach 或补偿履约。具体判断见 [CRM 建模评估](crm-assessment.md)。

## 校验

在项目根执行：

```bash
python3 .agents/skills/evidence-fm/scripts/check_fm.py "$PWD/.evidence/fm"
```

Python 环境需满足 `evidence-fm/requirements.txt`。命令只读取当前输入，修改模型后需重新执行。已保存结果位于 [checks/fm](../checks/fm/)。

## 验证边界

场景执行固定时刻下的凭证追加、可见性、属性计算、资格及责任状态判断，不执行真实支付、内容服务、客户档案实例、数据库事务或认证流程。关系基数被静态校验；运行时唯一退款、幂等扣减、主体隔离和客户档案实例引用应由实现测试验证。
