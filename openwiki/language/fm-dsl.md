---
type: language
title: FM v5 语言与严格契约
description: Zod 定义的 FM v5 AST、跨对象语义约束和稳定诊断，实体/角色/Context/关系/规则红线，以及 examples[].test 的标准验收元数据。
tags: [fm, dsl, schema, entities, rules, validation, vocabulary, zod]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-18T09:45:40.969Z
sources:
  - id: openwiki-source-39112fa2dcba304148e956e8
    resource: repo://libs/desktop/feature-agent/src/components/agent/AgentCopilot.tsx
  - id: openwiki-source-848e24844e664baadc8329eb
    resource: repo://libs/evidence-canvas-interaction/src/engine/layoutEngine.ts
  - id: openwiki-source-b4abb2821db0f045818014a1
    resource: repo://libs/evidence-model-core/src/session/createModelSession.ts
  - id: openwiki-source-88a3cc6d22f70a1b93ada22f
    resource: repo://libs/evidence-model-io/src/commands.ts
  - id: openwiki-source-dd948eb74e58734da3b37ea9
    resource: repo://libs/evidence-schema/package.json
  - id: openwiki-source-75b4a800cf064015957f9321
    resource: repo://libs/evidence-schema/src/ast/clause.ts
  - id: openwiki-source-52858d6130375e8776a048e7
    resource: repo://libs/evidence-schema/src/ast/document.ts
  - id: openwiki-source-58cc0dc028651165d939cdea
    resource: repo://libs/evidence-schema/src/ast/documentSemantics.ts
  - id: openwiki-source-c265f00105116b029505cbda
    resource: repo://libs/evidence-schema/src/ast/entity.ts
  - id: openwiki-source-3a0a328f2c66bce9f017bb17
    resource: repo://libs/evidence-schema/src/ast/id.ts
  - id: openwiki-source-33794ec4dbf0b0b8815e5e81
    resource: repo://libs/evidence-schema/src/ast/lifecycle.ts
  - id: openwiki-source-6dd8352adfce201b404ea1bf
    resource: repo://libs/evidence-schema/src/ast/provenance.ts
  - id: openwiki-source-88797fd20ee6b84a485fa4c7
    resource: repo://libs/evidence-schema/src/ast/relationship.ts
  - id: openwiki-source-e32f800f7852b379dbe14855
    resource: repo://libs/evidence-schema/src/ast/rule.ts
  - id: openwiki-source-81352b1a378745cf2308d10d
    resource: repo://libs/evidence-schema/src/ast/values.ts
  - id: openwiki-source-7c4fe492c1d97855af624246
    resource: repo://libs/evidence-schema/src/ast/workshop.ts
  - id: openwiki-source-a7be6659247893a47c92f244
    resource: repo://libs/evidence-schema/src/validation/mapZodIssues.ts
  - id: openwiki-source-3a801269d4e9a920c1e0021d
    resource: repo://libs/evidence-schema/src/validation/strictValidate.ts
  - id: openwiki-source-976e28bc7b01588161a1f7bd
    resource: repo://libs/evidence-schema/src/vocabulary.ts
generated: { by: "pi", at: "2026-11-18T09:45:40.969Z" }
---

# FM v5 语言与严格契约

FM 以权责、请求/确认、事实与边界建模，不是 CRUD 表清单。`libs/evidence-schema` 是语言入口：AST 的 **Zod schemas 是运行时权威，类型由 z.infer 推导**；随包 JSON Schemas 是外部合同，不再以手写 validator 维护另一套字段集合。

## 文档与标识符

DomainModelDocument 是 manifest + entities/relationships/rules 三平集合，可携 portable envelope 的 type=fm_bundle/schemaVersion=5.0/readme。manifest strict：type=fm_model、schemaVersion=5.0、ruleLanguage=CEL、非空 name、semver、非空且唯一 entryContextRefs，每项必须是 Context；可选 description 与私有 sourceDocument（协议全文及条款字符范围）。旧 validation/scenario/instance 顶层不是兼容扩展，拒绝。

ID 为小写字母开头的点/横线分段；属性 lower_snake_case；CEL alias为字母/下划线开头；version按semver grammar。ID跨实体/关系/规则全局唯一，重复对象报id.duplicate且不替换首次索引。VALUE_TYPES 包含CEL scalar和decimal/date/money/enum/id/list/map/dynamic等业务便利类型。

closed vocab按落盘字符串只声明一次，vocabularyIds/Labels/Field/guard派生顺序与展示标签；声明顺序是阅读顺序，不是当前ELK画布的硬编码泳道。

## 四类实体与业务时间

| category | kinds | 关键语义 |
| --- | --- | --- |
| evidence | rfp、proposal、contract、fulfillment_request、fulfillment_confirmation、other_evidence | 责任与事实，不是任意记录 |
| participant | party、thing | 实际参与方或领域对象 |
| role | party、domain、third_party、context、evidence | 能力/责任插槽，不是实现者 |
| context | contract、pre_contract、domain | 唯一所属与依赖边界 |

rfp/proposal/request必须started_at+expired_at，contract为signed_at，confirmation为confirmed_at，other为created_at；所有认出的业务时间都需required/keyData/timestamp。时段不是确认时刻。

非contract Evidence须responsibleRoleRef为合法Party Role，且符合合同责任边界；pre_contract借parent contract双方。contract必须属于contract Context、列入其rootRefs，并恰有两个不同的同Context party roles。实际participant可以尚未确定，角色不能少一方。

participant.party不得contextRef，允许跨合同扮演；thing必须domain Context，可选domainRole=calculator/checker，不允许给Party装计算器标记。Role必须所属Context，不可携Evidence的responsibleRoleRef/roleRefs。Context不得contextRef，可有parentContextRef但不得循环；contract/domain须真实rootRefs，contract恰一owned evidence.contract根。

attribute要求name/label/meaning、可选合法valueType、boolean required/keyData，实体内名称唯一，未知字段拒绝。derivedByRuleRef必须指向同Context、target精确entity+attribute的derivation，反向target也必须被属性回指。

## 两类关系与跨界白名单

关系只有plays_role/references，端点须存在，不允许self或Contract-Contract；cardinality min≥0整数、max正整数或many、min≤max。可选 flowKind 为 primary/breach_compensation/escalation；缺省按 primary 阅读，不把默认值物化到源文件。

plays_role允许party→party/third_party role、thing→domain role、Context→context role，以及跨Context moment Evidence→evidence role。moment是contract/confirmation/other_evidence，rfp/proposal/request时段不够资格，给relationship.playsRole.momentOnly。

references 同 Context 按端点规则。跨界白名单包括 contract 到其 pre_contract 子 Context 的 proposal、Evidence 到 thing 或 confirmation/other_evidence，以及履约确认到履约请求。跨界引用 evidence role、Context 链和跨 Context contract 等不合法。Evidence Role 作为 socket 的实现必须隔离在另一 Context。

## 六类CEL规则

derivation可产生任意合法resultType且必须target；precondition/invariant/eligibility/completion/breach必须bool且禁止target。label/description/expression非空，contextRef真实。binding为{ref,cardinality?:one|many}或{type}的严格互斥形态，alias为CEL标识符，ref须解析实体。schema只校验形态/图语义，不执行CEL；作用域、追溯和表达式求值在model-core。

## 内联 examples 是验收输入

实体examples可带test：flow、tags、actingRoleRef、显式offset RFC3339 asOf、basedOn、expectedStatus、inputs、pathParameters(exampleRef/jsonpath)、expect(JSONPath→期望)。对象strict、JSON值须真实可序列化，tags/basedOn唯一；**inputs覆盖只允许显式>=400负向测试**。静态图级检查补充示例标签/引用等约束；创建入口映射、角色、依赖隔离/排序、捕获和CEL oracle属于 evidence-acceptance projector，不把投影条件塞进schema。

没有 test 的 example 仍是示例，不臆造业务流程。AcceptanceFlow 是临时编译 IR，不是新的建模源格式；Bruno 集合也是导出结果。真实 HTTP 验收另见 [CLI](../workflows/cli-governance.md)。

## 严格校验的实际流水线

`DomainModelDocumentSyntaxSchema` strict对象 + category discriminatedUnion定义语法；`DomainModelDocumentSchema=...superRefine(refineDomainModel)`负责已类型化图语义：建唯一索引 → manifest entry → entities/ownership/time/root → relationships → rules → derivation symmetry。错误使用custom params保留FM code/objectId。

`strictValidateDomainModel` safeParse → mapZodIssues → dedupeIssues；成功不归一化/修改调用者输入。映射器把Zod union/unrecognized_keys/refinement转为既有closed ValidationCode、pointer-like path、message、可选objectId，去重code/path/message。assertValidDomainModel抛携同issues的DomainModelValidationError。

旧ENTITY_KEYS/validateNonContextEntity大函数已移除，category-specific结构键限制直接在Zod branch表达，再由documentSemantics补跨引用检查。语法错误时不保证继续遍历所有不安全图对象；不要要求旧手写validator的执行顺序作为公开契约。

静态gate被FM check、compile/lineage、API projection、可选validateOnDispatch复用。渐进会话默认不强制静态全有效，projectStore.save也不等同门禁；用户可以保存半建模型，但正式交付拒绝。scope完整性、key-data provider、CEL、HTTP实现为独立问题。

## 阅读词汇不是新实体

lifecycle stages=rfp/proposal/contract/fulfillment，schema helpers按kind/Context内容推导；角色/参与者无自己的stage，other_evidence继承Context。topology 使用 ELK，另有独立七阶段业务泳道模式；布局不改变实体语义。clause分business→evidence、domain→domain-thing、boilerplate→none；annotation保留原句/理由，计算可另标computesValue。

WORKSHOP_STEPS七步：anchor-contract、pair-fulfillment、name-things、invert-dependency、close-breach、trace-key-data、connect-flow。rank是1-based，focus给Agent步骤前缀；REVERSE_CONTRACT_MODE从需要留存事实反推。它们都不作为FM落盘状态。

sourceSnippet 可选保存 text/locator/source(contract/prd/interview/blueprint/unknown)、clauseIndex 与成对 charStart/charEnd；范围必须与 UTF-16 snippet 长度一致。manifest.sourceDocument 的条款须顺序连续且精确匹配原文切片。它们供作者本地审计，不是运行时授权或 key-data provider 证据，也不进入公开 API/故事模型投影。

## 验证入口

AST/strictValidate/zodPipeline specs覆盖语法strict、category unions、FM codes/objectId、图refinement、无输入突变；exampleTest specs保护clock/负向覆盖/JSON shape。golden product-procurement模型作为稳定基线，每case clone后破坏一条红线。vocabulary/lifecycle/clause/workshop/inspector specs验证共享词表与展示合同。

相关：[源格式](../model/source-formats.md) · [关键数据](./key-data-and-provenance.md) · [检查与CEL](../model/checks-and-simulation.md) · [事务](../model/commands-and-session.md)
