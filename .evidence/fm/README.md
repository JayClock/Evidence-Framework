# CRM 电话销售绩效协议 FM

## 结构

按业务上下文组织，履约中的凭证和规则就近存放：

```text
fm/
├── model.yaml
├── participants/user.yaml
├── contexts/
│   ├── sales-performance/
│   │   ├── context.yaml
│   │   ├── contract.yaml
│   │   ├── roles/
│   │   ├── relationships/
│   │   └── fulfillments/monthly-customer-contact/
│   └── customer-information/things/
├── relationships/
├── validation/
└── generated/
```

- [电话销售绩效协议](contexts/sales-performance/contract.yaml)与[客户信息领域](contexts/customer-information/context.yaml)是相互分离的边界：前者表达内部绩效履约，后者只提供客户档案标的物。
- `contexts/` 与 `participants/` 共含 10 个业务对象；共 5 条关系；1 条 CEL 完成规则。
- 月度客户联系目标履约目录以 `context.yaml` 表达责任边界，`request.yaml`、`confirmation.yaml`、`relationships/` 和 `rules/` 表达该履约的凭证与规则。
- 客户联系记录通过跨上下文 `references` 关系指向客户档案，`party.user` 分别扮演绩效管理者和电话销售角色。
- `validation/instances/`：5 份回放单据。
- `validation/scenarios/`：2 个场景，覆盖月度目标完成与不足。
- `generated/`：当前保留本次重建结果；消费前应从当前源 YAML 和 validation 重建。

模型概览见 [00-overview.md](00-overview.md)，术语见 [01-glossary.md](01-glossary.md)，CRM 本批次来源、纳入判断与缺口见 [crm-assessment.md](crm-assessment.md)。

## 主体与角色

用户（`party.user`）分别在电话销售绩效上下文中扮演绩效管理者（`role.performance-manager`）或电话销售（`role.tele-sales`）。同一 Participant 类型连接绩效协议双方，表示用户主体可承担任一角色，不证明同一协议实例由同一自然人同时承担双方。角色扮演不自动扩大办理权限。

## 范围

绩效管理者（`role.performance-manager`）和电话销售（`role.tele-sales`）通过绩效协议形成内部权责边界。管理者提出带周期和三项目标数的月度联系请求；电话销售每次联系客户后形成一份记录，记录必须指向客户档案并注明电话或邮件渠道。完成规则只在总数、电话数和邮件数均达到本次约定值时成立。

周度检查记录的责任方、目标设定方式和未达标后果缺少来源，当前不编成 Confirmation、breach 或补偿履约。具体判断见 [CRM 建模评估](crm-assessment.md)。

## 校验

在项目根执行：

```bash
python3 .agents/skills/evidence-fm/scripts/check_fm.py "$PWD/.evidence/fm"
```

Python 环境需满足 `evidence-fm/requirements.txt`。命令只读取当前输入，修改模型后需重新执行。已保存结果位于 [checks/fm](../checks/fm/)。

## 验证边界

场景执行固定时刻下的凭证追加、可见性、属性计算及完成状态判断，不执行真实电话或邮件联系、客户档案实例、数据库事务或认证流程。关系基数被静态校验；客户档案实例引用一致性和运行期唯一性应由实现测试验证。
