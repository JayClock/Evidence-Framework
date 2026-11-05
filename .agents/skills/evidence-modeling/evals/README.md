# Evidence 技能持续评估调度器 (Unified Skills Evals)

本套评估体系作为 Harness 的质量防线与持续改进引擎，由编排技能 `evidence-modeling` 承载统一调度，同时保障各专业技能（Discovery / FM / Modeling）各自独立持有评测用例与基线结果。

## 架构布局

```text
.agents/skills/
├── evidence-discovery/
│   └── evals/
│       ├── cases.json          # 业务访谈专精用例 (C1~C2, T1~T2)
│       ├── eval_results.json   # Discovery 最新评测基线
│       └── README.md
├── evidence-fm/
│   └── evals/
│       ├── cases.json          # 形式化建模专精用例 (C1~C3, T1~T2)
│       ├── eval_results.json   # FM 最新评测基线
│       └── README.md
└── evidence-modeling/
    └── evals/
        ├── cases.json          # 编排分派与门禁专精用例 (T1~T3)
        ├── eval_results.json   # Modeling 最新评测基线
        ├── judge_prompts.py    # 裁判大模型判定模板与解析器
        ├── runner.py           # 统一调度器（支持按 Skill 单测或全局联跑）
        └── README.md
```

## 执行方式

统一调度器与编排 Skill 放置在一起，支持单个 Skill 独立评测与全局联合扫描：

```bash
# 1. 运行所有 Skill 的评估（全局看板）
python3 .agents/skills/evidence-modeling/evals/runner.py

# 2. 独立运行指定 Skill 的评估
python3 .agents/skills/evidence-modeling/evals/runner.py --skill evidence-discovery
python3 .agents/skills/evidence-modeling/evals/runner.py --skill evidence-fm
python3 .agents/skills/evidence-modeling/evals/runner.py --skill evidence-modeling

# 3. 快速自检 / 语法验证
python3 .agents/skills/evidence-modeling/evals/runner.py --dry-run
```

## 各 Skill 专属关注点

- **`evidence-discovery`**：聚焦现金权责双方锁定、凭证链深入追溯、依赖前沿同轮成组提问，严格隔离非业务咨询。
- **`evidence-fm`**：聚焦请求—确认履约对偶闭环、违约阶梯与外置策略隔离、最小保存单元与局部一致性、讨论只聊不落盘。
- **`evidence-modeling`**：聚焦意图分派与授权传递、未获人类结束确认时的阶段门禁阻断、责任断链时的阻断汇报。
