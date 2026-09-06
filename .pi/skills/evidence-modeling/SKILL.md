---
name: evidence-modeling
description: 在 Evidence Domain 阶段使用统一 FM / 8X Flow Schema v3 建模领域对象、关系、规则、签约前渠道和合同履约。凡需要创建、迁移、审查或校验客户档案、商品、内容等领域语义、RFP/Proposal、合同权责、KPI、履约请求与确认、Role、Participant、凭证链、CEL、属性追溯或业务模式时使用。纯领域和纯渠道仍使用同一 FM 格式，不强制生成合同或履约；仅无独立业务/领域语义的简单工具胶水可不建模。通过 Evidence 提交工具交付源文件，数据库和 API 留给架构阶段。
---

# 统一 FM / 8X Flow · Schema v3

## 权威规则与本地适配

先读 `references/README.md`，再按实际范围加载语义、格式、领域、CEL、发现及验证 reference。上游来源和本地差异见 `UPSTREAM.md`。

**同一格式、按上下文展开**：领域、渠道、合同履约不是三套 Schema 或互斥流水线。只接受 v3；旧模型按 `references/migration-v3.md` 显式重建，不能只改版本号。

Evidence 的阶段编排、路径保护和提交规则以本节为准：references 中独立使用的发现问答、直接写盘及 CLI 命令，不替代本地 Gate 和专用提交工具。

## 语义职责

- **Domain Context**：对象身份、属性、关系、能力、资格、前置条件、不变条件和计算，可独立成为模型入口。
- **Pre-contract/Channel Context**：RFP、Proposal、协商及签约来源；没有合同也可独立建模，不把协商伪装为履约。
- **Contract Context**：两个不同 Party Role 的交互聚合；内部绩效与对外交易共用权责机制。
- **Fulfillment Context**：父 Contract 的子上下文，包含当前履约 Request、Confirmation/Evidence Role 和 Rule；合同 Party Role 留在父上下文。
- **Role**：上下文身份或能力插槽，不等于稳定玩家或系统组件。只有来源明确时建立 Participant→Role 的 `plays_role`。
- **Participant**：Party/Place/Thing 为并列 kind；Party 在 Context 外，Place/Thing 属于 Domain Context。字段通常是属性，不为每个字段创建 Thing。
- **Trigger**：自动动作的实现机制，用 `actsForRoleRef` 指向所代表的合同 Role；系统、API、调度器不是业务参与方。

FM Context 不等于 DDD Bounded Context、聚合、模块或微服务；后续 DDD 文档说明有依据的设计映射，不建立第二份业务事实源。

## Evidence 执行顺序

1. **读取输入**：原始需求、已批准需求及统一语言；本工件在 DDD 限界上下文映射之前。不依赖尚未生成的 DDD 工件。
2. **确定当前问题与范围**：按独立业务/领域语义判断适用性，不按系统名称、是否出现合同或是否 CRUD 分类。没有履约不等于 FM 不适用，信息不足也不等于不适用。
3. **按事实展开**：领域按对象身份→关系→规则展开；渠道按真实协商凭证展开；有履约才按 Role-first 从收入、支出、目标—实际/KPI 展开权责脊梁。局部模型不补齐整个系统。
4. **核对依据和未知项**：使用 discovery 方法整理事实、候选、假设、来源与待决策项，问题写入工件，交由 Domain Gate 处理；不增加独立问答或基线确认步骤。依据不足以形成有效范围时明确阻塞，请人工补充或缩小范围，不能提交虚假的成功模型。
5. **表达规则与缺口**：使用稳定 ID、CEL、`keyData` 和 AST 派生 lineage。v3 没有第一等 Command/Operation/状态迁移实体，也不能完整表达关系基数；这些语义明确列为 gap，由 DDD/架构设计和后续 Q1/Q2 验证承担，不自造 DSL 或假 Fulfillment。
6. **履约专项核对**：每项履约位于子 Fulfillment Context，明确双方、Request interval、确认、完成策略、触发与异常。interval 起止引用 required、keyData timestamp；`openEndedReason` 必须有已确认依据，不能代表“材料没写期限”。
7. **按需验证与模式提取**：有金额、KPI、赔偿、审计或复杂完成策略的单据链，提供正常和异常/追责场景；实例只放 `validation/`，固定 `asOf`。纯领域的正常、边界和反例写入说明及后续测试要求，不创建假 Evidence 绕过模拟器。只有权责复用主张才提交 Business Pattern YAML。
8. **提交全部源文件**：最后调用 `evidence_submit_fm_model`，不适用传明确理由和空 files；适用传完整模型、必要说明及可选场景。不要直接写模型目录，不要自行运行生成命令，不提交派生产物。工具执行校验、lineage、适用单据模拟、模式文档生成和编译后原子保存。

## 事实与评审边界

- 分片 YAML 是可表达业务/领域语义的事实源；DDD 文档引用 Context/Entity/Rule 等稳定 ID，说明战术设计及表达缺口，不重复改写规则。
- `discovery/` 是候选、事实定位及问题整理，不是已确认模型事实；`validation/` 是测试数据，不是生产事实。
- Evidence 只追加：取消、退款、冲正、更正与补偿新增凭证或履约；该约束不代表所有领域对象不可修改。
- `modelStatus` 默认 `draft`，`stakeholderReview` 默认 `pending`；只有真实具名审核记录才能改变，不因机器校验、场景模拟或 Domain Gate 批准而自动提升。
- 模拟器只实例化 Evidence，不实例化 Thing/Party，也不证明领域操作或状态机已执行。没有适用单据场景时 `simulationPassed` 为 null/未执行，不是 true。
- REST、消息、SQL、数据库、页面和部署由 Architecture 投影，不写回 FM。

## 输出目录与允许路径

模型根目录固定为 `artifacts/02-domain/fm-model/`：

```text
fm-model/
├── model.yaml                       # 必需，schemaVersion: "3.0"
├── README.md                        # 范围、来源、假设、问题、表达 gap
├── 00-overview.md                   # 范围内上下文及连接
├── 01-glossary.md                   # 引用统一语言，不另造词义
├── entities/                        # 必需，至少一个实体和有效入口 Context
├── fulfillments/                    # 有履约才需要，可省略
├── relationships/                   # 可省略
├── rules/                           # 可省略
├── business-patterns/               # 可选源 YAML
├── discovery/                       # 可选单层 .md/.yaml，不作为模型事实
├── validation/instances/            # 可选单据数据
├── validation/scenarios/            # 可选单据场景
├── 02-business-patterns.md          # 扩展生成，不能提交
├── generated/                       # 扩展生成，不能提交
└── status.md                        # 扩展生成，不能提交
```

每个 YAML 文件一个文档，文件名小写 ASCII kebab-case，引用稳定 ID；模型分片名由 ID 中的点替换为双连字符。无履约模型编译为 `fulfillments: []`；空集合不能掩盖孤立 Request 或缺失确认。语义删除时提交完整新文件集，让扩展清理失效引用及派生产物。

## 回复要求

简要报告实际范围、上下文连接、来源明确的对象/权责、提交路径、机器校验与实际模拟结果、人工评审状态及待确认事实/gap。纯领域不报告虚构业务脊梁；建模不适用也是合法范围结论，但不是信息不足的退路。
