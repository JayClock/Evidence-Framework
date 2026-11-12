# FM 文件组织与结构契约入口

本页只维护文件组织、读写约定和契约导航，不维护字段表、枚举或必填项副本。创建或修改 JSON 时，直接读取下列对应 Schema；跨对象含义看 [语义](semantics.md)，保存权限与范围结束看 [责任方法](responsibility-closure.md)。

## 结构契约

### 模型类型源

| 要写的对象                         | 直接读取                                                   |
| ---------------------------------- | ---------------------------------------------------------- |
| 模型入口                           | [Model Schema](../schemas/model.schema.json)               |
| 业务对象、角色、凭证、上下文与履约 | [Entity Schema](../schemas/entity.schema.json)             |
| 引用与角色扮演                     | [Relationship Schema](../schemas/relationship.schema.json) |
| 可执行业务规则                     | [Rule Schema](../schemas/rule.schema.json)                 |

Schema 负责单对象可表达结构；引用存在、上下文归属、关系端点和规则依赖还须执行语义检查。通过 Schema 不表示完整；不能用 Schema 的可选项解释为业务上不需要。

### 验证输入

| 要写的输入      | 直接读取                                                             |
| --------------- | -------------------------------------------------------------------- |
| 凭证实例        | [Evidence Instance Schema](../schemas/evidence-instance.schema.json) |
| 场景            | [Scenario Schema](../schemas/scenario.schema.json)                   |
| 访谈追溯日志    | [Interview Trace Schema](../schemas/interview-trace.schema.json)     |

实例与场景的使用方法见 [追溯与模拟](traceability-and-simulation.md)。访谈追溯日志由 Discovery 维护，本包只提供结构契约与引用目标；它们都不是模型类型源，也不提供现实业务事实。

### 派生输出

| 要消费的输出 | 直接读取                                                             |
| ------------ | -------------------------------------------------------------------- |
| 编译模型     | [Compiled Model Schema](../schemas/compiled-model.schema.json)       |
| 属性追溯     | [Traceability Schema](../schemas/traceability.schema.json)           |
| 模拟报告     | [Simulation Report Schema](../schemas/simulation-report.schema.json) |
| 实例时间线   | [Timeline Schema](../schemas/timeline.schema.json)                   |

派生输出不能手改后回写类型源；生成和保存权限按 [校验纪律](validation.md) 执行。

## 文件组织

```text
.evidence/fm/
├── model.json
├── README.md
├── participants/          # 跨上下文的稳定主体
├── contexts/
│   └── <业务上下文>/
│       ├── context.json
│       ├── roles/
│       ├── relationships/
│       ├── things/        # 有实际领域对象时使用
│       ├── evidence/      # 有共享或辅助凭证时使用
│       ├── rules/
│       └── fulfillments/  # 有实际合同履约时使用
│           └── <履约项>/
├── relationships/         # 跨独立上下文关系
├── validation/
│   ├── instances/
│   └── scenarios/
└── generated/
```

目录只服务阅读，不定义业务身份、归属或发现顺序；没有实际对象就不建空目录或假对象。上下文内部关系放在最近共同上下文，跨独立上下文关系放在根目录，每个对象只定义一次。项目模型使用上下文内的短文件名；有多个同类对象时用业务名区分，不能覆盖。说明文件记录范围与来源，不保存第二份模型定义。

加载规则由引擎的 `readModelRoot`（`libs/evidence-model-core/src/adapters/modelRoot.ts`）实现：`model.json` 单独读取，分片按对象类型分发，`generated/`、隐藏路径与 `__pycache__` 不作为类型源。不要用文件名、目录位置或说明文字绕过加载与引用检查。

### 单文件模型

同一模型也可以是一个 `*.evidence.json` 单文件，用于分发、评审和拖拽打开；它不是第二份定义，`type`、`manifest`、三个对象数组与 `validation`、`readme` 就是上面的目录内容。

```text
<模型>.evidence.json
{ "type": "fm_bundle", "schemaVersion": "5.0",
  "manifest": …, "entities": […], "relationships": […], "rules": […],
  "validation": { "instances": […], "scenarios": […] }, "readme": … }
```

- 目录与单文件是同一模型的两种形态：`readModelRoot` 与 `loadValidationSuite` 都接受目录或单文件路径，判定结果一致；命令行 `check` 只读目录，单文件先 `unpack`。
- 打包与还原只在需要换形态时执行，不在编辑循环里来回转换：`evidence-model pack <目录> [--out <文件>]`、`evidence-model unpack <文件> [--out <目录>]`、`evidence-model inspect <文件|目录>`。还原不覆盖对象已一致的文件，因此不产生无意义的格式改动。
- `generated/` 不进单文件（派生输出），`discovery/` 也不进（访谈追溯由 Discovery 拥有）。只读检查与网络无关。
- 编辑单文件时，对象仍按相同 Schema、相同稳定 ID 与相同语义约束维护；不能因为是单文件就把实例、场景或派生结果写成模型类型源。

验证输入的文件名由 `expected_filename` 计算，分别放在实例与场景目录；类型源的文件名不承担稳定身份。重组目录须保留对象 ID、业务内容和场景预期，并核对编译结果。

## 编辑约定

- JSON 使用 UTF-8、两空格缩进、保留中文和文件末尾单个换行，一个文件一个顶层对象。键顺序不承载业务语义，不维护固定字段排序模板。
- 字段拼写、ID 和属性名的合法形式直接遵循对应 Schema；协议字段、业务属性、CEL 变量和外部原始字段不能混为一类做字符串替换。
- 名称与定义直接消费 [领域语言](domain-language.md)，不作为派生报告重建或回写，不另设术语索引。改显示名不改稳定身份；属性更名须核对规则、实例及下游引用。
- 同一业务概念复用既有 ID；替换概念时按授权一并处理旧引用，不以目录搬迁制造新身份。保留历史业务凭证和已引用运行证据。
- 有依据与授权即可渐进保存；未知保持缺失，不填占位值。已表达引用和类型必须一致，范围交付时再核对完整性；检查入口与结果含义统一看 [校验](validation.md)。

结构变化修改 Schema 及相应实现和测试；跨对象规则变化修改语义校验及行为测试。同步受影响的方法引用和可运行样例，不在本页补一套独立字段规范。发现契约、实现与业务依据冲突时停止受影响行动，交回拥有者，不按“哪个文件更新得晚”裁决。
