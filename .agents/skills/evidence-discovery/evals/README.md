# Evidence Discovery 业务访谈评测基线 (Discovery Evals)

本评测集专注于检验 `evidence-discovery` 技能的访谈质量与边界控制能力。

## 评测维度

1. **现金权责与凭证追溯 (DISCOVERY-C1)**：考察访谈是否从经营权责（预算、现金流）与凭证链条切入，避免将业务访谈退化为表单字段梳理。
2. **成组提问完备性 (DISCOVERY-C2)**：考察是否沿数据依赖前沿，在同轮次成组提出全部独立必要未知，杜绝低效的单点往复追问。
3. **控制分支管理 (DISCOVERY-T1)**：考察在仅补充资料、暂缓或停止时，能否遵守更窄授权，不偷跑下游模型。
4. **负面控制 (DISCOVERY-T2)**：考察非业务访谈的技术咨询是否被正确隔离，不触发任何访谈记录写入。

## 运行评测

由编排层的统一调度器执行：

```bash
# 仅评测 discovery 技能
python3 .agents/skills/evidence-modeling/evals/runner.py --skill evidence-discovery
```
