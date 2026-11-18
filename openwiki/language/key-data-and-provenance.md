---
type: concept
title: 关键数据、派生与来源追溯
description: 八类来源分类、关键数据台账与 native CEL 属性依赖链如何协作，以及 sourceSnippet、业务时间、JSON精确整数和审查结论的边界。
tags: [key-data, provider, provenance, ledger, lineage, business-time, sensors]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-18T12:34:41.390Z
sources:
  - id: openwiki-source-14c1bd0ebaba9f1349ef58a4
    resource: repo://libs/desktop/feature-inspector/src/inspector/AttributeDataGrid.spec.tsx
  - id: openwiki-source-000b39f31699cab4b8d68ff9
    resource: repo://libs/desktop/feature-inspector/src/inspector/AttributeDataGrid.tsx
  - id: openwiki-source-294ae639434a4e29c9572cbc
    resource: repo://libs/desktop/feature-inspector/src/inspector/KeyDataLedgerSheet.tsx
  - id: openwiki-source-3046611767bc0c00a44d0bdb
    resource: repo://libs/desktop/feature-inspector/src/inspector/KeyDataProvenancePicker.tsx
  - id: openwiki-source-80031f5421964a543e95e5ba
    resource: repo://libs/evidence-agent/src/sensors/native/nativeKeyDataAudit.ts
  - id: openwiki-source-925f1915fe23c3f1c07b66e9
    resource: repo://libs/evidence-agent/src/sensors/native/nativeSensors.spec.ts
  - id: openwiki-source-819cda3e1e556eb778e9f02b
    resource: repo://libs/evidence-agent/src/sensors/native/nativeSensors.ts
  - id: openwiki-source-c1e4281890861794f7ffa119
    resource: repo://libs/evidence-agent/src/sensors/sensorReport.spec.ts
  - id: openwiki-source-9ad3f46aa18e9c002bf6f482
    resource: repo://libs/evidence-agent/src/sensors/sensorReport.ts
  - id: openwiki-source-ece7f3389ee03e6d65881863
    resource: repo://libs/evidence-agent/src/story/flowStoryProjector.ts
  - id: openwiki-source-484dbf9c991f78fe31f89b8f
    resource: repo://libs/evidence-agent/src/story/storyAgent.ts
  - id: openwiki-source-e2bfe2b62dac07a26ade079e
    resource: repo://libs/evidence-api/src/delivery/modelDelivery.ts
  - id: openwiki-source-bab9cd022cd0c06c4edacf32
    resource: repo://libs/evidence-model-core/src/diff/modelDiff.ts
  - id: openwiki-source-f02b234edea2573a78a178f1
    resource: repo://libs/evidence-model-core/src/ingestion/compileDraft.ts
  - id: openwiki-source-f4983b717b76eb5f0cfd69e1
    resource: repo://libs/evidence-model-core/src/keyData/keyDataLedger.spec.ts
  - id: openwiki-source-affb6c00c48ce99fa8d2ada0
    resource: repo://libs/evidence-model-core/src/keyData/keyDataLedger.ts
  - id: openwiki-source-9008514a60858ff717f539ab
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.ts
  - id: openwiki-source-94d8041b675559a722964cce
    resource: repo://libs/evidence-model-core/src/validation/traceability.ts
  - id: openwiki-source-75b4a800cf064015957f9321
    resource: repo://libs/evidence-schema/src/ast/clause.ts
  - id: openwiki-source-58cc0dc028651165d939cdea
    resource: repo://libs/evidence-schema/src/ast/documentSemantics.ts
  - id: openwiki-source-c265f00105116b029505cbda
    resource: repo://libs/evidence-schema/src/ast/entity.ts
  - id: openwiki-source-b97f3973d38b3f2eec517bcb
    resource: repo://libs/evidence-schema/src/ast/keyData.spec.ts
  - id: openwiki-source-649ec2659fe489d0f9323bc2
    resource: repo://libs/evidence-schema/src/ast/keyData.ts
  - id: openwiki-source-6dd8352adfce201b404ea1bf
    resource: repo://libs/evidence-schema/src/ast/provenance.ts
generated: { by: "pi", at: "2026-11-18T12:34:41.390Z" }
---

# 关键数据、派生与来源追溯

四个机制不可混淆：keyData标记决定纳入台账；来源分类解释提供方；lineage证明公式读了哪些模型属性；sourceSnippet说明对象从哪句文本读出。它们都不证明实际后端执行正确。

## 八类来源与分类局限

buildKeyDataLedger只统计attribute.keyData=true，金额名称不会自动强制打标；未标价格可能通过结构检查，建模纪律依赖人和prompt。KEY_DATA_SOURCE_DEFINITIONS单源声明label/resolved，分类优先级：

| 条件 | source |
| --- | --- |
| derivedByRuleRef存在 | derived |
| evidence.contract | contract-term |
| participant.thing | domain-source |
| rfp/proposal | negotiation-source |
| confirmation/other_evidence | result-fact |
| fulfillment_request且字段在形成事实白名单 | request-input |
| request其他字段 | needs-decision |
| role/context等其他类别 | other |

白名单为started_at、request_number、delivery_address、return_address、fault_description、asset_code、billing_period、settlement_period。expired_at不在其中：履约请求的必填截止时间必须有来源决议，常通过derivation建立。

分类是kind/name/ref的语法推断，不读取meaning、不验证事实真伪。isKeyDataDecisionOwed只识needs-decision，isKeyDataResolved排除needs-decision/other；但sensor summary以total-owed计算resolved，因此other可能被summary算已解决、却无真实提供方。不可将该计数当业务充分性证明。人类picker词表也不是持久化provider字段。

## 同一台账，两个消费者

Inspector的AttributeDataGrid、KeyDataProvenancePicker、宽KeyDataLedgerSheet和nativeKeyDataAudit复用buildKeyDataLedger。展示来源label、derivation provider alias→对象/运行时type、规则和待决计数；按钮是绑定规则或撤回keyData，不可输入一个自由文本供应方。修改通过guarded mutator/session.mutate，规则formula bar也同会话撤销，旧UpdateAttribute/UpdateRule Command已撤。

native audit输出checkVersion1、valid=true、bucket counts、needsDecision的entity#attribute/context/meaning/type，以及traceability得到的derived sources；note明确待决不是错误。sensor只发最多40个KEY_DATA_DECISION_OWED warn，summary全量；无待决给KEY_DATA_RESOLVED info。passed只看block，stage-ready另需passing gate、零待决、零blocks/coverage/breaking。

## 业务时间属于模型红线

rfp/proposal/request需started_at+expired_at，contract signed_at，confirmation confirmed_at，other created_at；任何认出的时间属性需required/keyData/timestamp。documentSemantics报告attribute.time.missing/notKeyTimestamp，不再由巨大手写strictValidate函数实现。业务发生时间与技术写入时间不同，不能把客户端任意回填当合同事实。

## Native CEL scoped AST 的lineage

extractRuleAttributeAccesses直接编译cel-js AST，以walkCelAst/resolveCelReference跟踪宏词法scope，不用旧手写parser或regex。a.field、a['field']、optional访问等静态成员可追溯；many必须通过collection macro，macro不能把one绑定当many，动态索引不能假装确定属性。嵌套宏变量/shadowing按作用域解回模型binding，字符串内容不产生假read。

analyzeTraceability建立entity#attribute nodes、source→target经rule edges、non-derivation constraints，排序稳定。它拒绝：未知属性、binding/ref不匹配、重复derivation目标、属性/target反向不对齐、lineage cycle。ParseError留给CEL静态诊断避免重复语法噪音，其他内部错误不伪装成功。

关键派生还必须至少读一个modeled attribute；**实际读取**的type-only scalar binding必须建成模型属性。仅声明但没用的scalar不会误报；宏局部变量不算自由scalar。注意这不是“禁止所有数字常量”：表达式中的字面量税率并不因这条规则自动识别为隐藏提供方，业务审查仍须判断。

lineage errors进入FM check.errors→check_fm/FM_INCONSISTENT block；provider owed只是audit_key_data warn。一个问谁提供，一个问公式读了什么，不可互相替代。

## 精确整数边界

cel-js运行时int/uint用bigint精确运算。JSON输入允许safe number或CEL int64/uint64范围内的精确十进制string，unsafe number和类型越界值拒绝；celValueToJson把安全整数转number、较宽合法整数保留decimal string，绝不Number静默舍入。内联样例 oracle 与生成的 Bruno 请求、断言复用此纪律，精确十进制字符串不能转换成浮点数再比较。canonical JSON与hash要一致，不能只换序列化样式当格式调整。详见[检查与CEL](../model/checks-and-simulation.md)。

## 文本来源是元素级记录

draft element.provenance的text/locator/source(kind contract/prd/interview/blueprint/unknown)经compileDraft复制到entity.sourceSnippet；Zod EntityBase明确允许ProvenanceSnippetSchema，DraftAttribute没有独立来源字段。手写模型可以省略；导入时可记录合同全文与条款范围，检查器可显示已选对象自己的来源片段。annotation 的分类与理由是对文本的解读。

native sensors不对照访谈记录，模型是唯一输入；interview仅是来源kind。对话里说过但未落成模型不算验证证据。公开 API 与 flow story 投影不输出 sourceDocument/sourceSnippet；旧离线 workbench 已撤除，作者可以看模型不等于有权看来源材料。

## 邻接与验证

diffDomainModels复算两侧ledger，报告source/rule/expression变化、hasKeyDataDrift和两侧owed计数；这是模型比较能力，不表示桌面有 branch API。

keyDataLedger/keyData specs保护八类优先级、counts、other局限和未标排除；traceability/celAnalysis specs保护native成员/macro/shadowing、动态索引、cycle、scalar纪律。FM/sensor specs保护warn/block区分，Inspector specs保护来源展示/绑定/撤回的一次撤销与Sheet header。审查还需补问未标金额、other提供方、语义正确性、真实HTTP实现和scope闭环。

相关：[语言](./fm-dsl.md) · [静态/CEL](../model/checks-and-simulation.md) · [传感器](../agents/sensor-orchestration.md) · [Inspector](../desktop/canvas-and-inspector.md)
