# 专栏订阅 FM

## 结构

- `model.yaml`：FM Schema v3 模型入口。
- `entities/`：43 个业务对象，含合同上下文、履约上下文、双方角色、证明角色、具体凭证、主体及内容标的。
- `relationships/`：44 条关系，表达责任扮演、凭证先后、标的引用和必要补充证明。
- `rules/`：25 条 CEL 规则，包含关键值计算、访问资格、履约完成和违约判断。
- `validation/instances/`：27 份回放单据。
- `validation/scenarios/`：18 个正常、边界和异常场景。
- `generated/`：编译模型、属性追溯、模拟结果和业务时间线。

模型概览见 [00-overview.md](00-overview.md)，术语见 [01-glossary.md](01-glossary.md)，完整条款见 [业务规则](../discovery.md)。

## 校验

在项目根执行：

```bash
python3 .agents/skills/evidence-fm/scripts/check_fm.py "$PWD/.evidence/fm"
```

Python 环境需满足 `evidence-fm/requirements.txt`。命令只读取当前输入，修改模型后需重新执行。已保存结果位于 [checks/fm](../checks/fm/)。

## 验证边界

场景执行固定时刻下的凭证追加、可见性、属性计算、资格及责任状态判断，不执行真实支付、内容服务、数据库事务或认证流程。关系基数被静态校验；运行时唯一退款、幂等扣减和主体隔离应由实现测试验证。
