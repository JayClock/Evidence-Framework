---
type: pipeline
title: 静态门禁、CEL 与样例求值
description: FM check v6 如何分开一致性与scope完整性，native cel-js如何分析/求值，以及内联样例oracle和真实HTTP验收之间的不可替代边界。
tags: [validation, check, cel, examples, traceability]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-20T12:30:09.424Z
sources:
  - id: openwiki-source-52a825b501b0001cef1b2ecc
    resource: repo://apps/cli/src/commands/check.ts
  - id: openwiki-source-74d7b554a01c3f371dc93772
    resource: repo://libs/desktop/feature-story/src/state/journeyPreview.ts
  - id: openwiki-source-9ad3f46aa18e9c002bf6f482
    resource: repo://libs/evidence-agent/src/sensors/sensorReport.ts
  - id: openwiki-source-4e8476923f1a3d656f3339cf
    resource: repo://libs/evidence-model-core/src/cel/transientSandbox.ts
  - id: openwiki-source-7f610f2a7e2a332dd6249f23
    resource: repo://libs/evidence-model-core/src/scenario/scenarioStudio.ts
  - id: openwiki-source-39aee7c17098a6b50b3614f9
    resource: repo://libs/evidence-model-core/src/trace/flowAggregator.ts
  - id: openwiki-source-1375ef32da94e5a47494a6c0
    resource: repo://libs/evidence-model-core/src/validation/breachFlow.ts
  - id: openwiki-source-65aecc4d0c320b921968555c
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.spec.ts
  - id: openwiki-source-9008514a60858ff717f539ab
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.ts
  - id: openwiki-source-f1f4a36fd7c708ebe345d142
    resource: repo://libs/evidence-model-core/src/validation/lintRules.ts
  - id: openwiki-source-bb6561cac02f8a21961ea926
    resource: repo://libs/evidence-model-core/src/validation/scope.ts
  - id: openwiki-source-88a3cc6d22f70a1b93ada22f
    resource: repo://libs/evidence-model-io/src/commands.ts
  - id: openwiki-source-5827654ee488871fab61b1a1
    resource: repo://libs/evidence-model-io/src/legacyRemoval.spec.ts
  - id: openwiki-source-58cc0dc028651165d939cdea
    resource: repo://libs/evidence-schema/src/ast/documentSemantics.ts
  - id: openwiki-source-f3dd6cff8734842de5630223
    resource: repo://libs/evidence-tools/src/index.ts
generated: { by: "pi", at: "2026-11-20T12:30:09.424Z" }
---

# 静态门禁、CEL 与样例求值

当前系统不再有旧 Scenario/Instance 文件、validation suite、持久化 replay 或 role-play pack。保留的是瞬态 CEL 样例求值和只读 What-If。历史页名为兼容导航保留，本页解释它们的实际替代：**静态FM v6 + native CEL + 编译期examples oracle + 标准HTTP验收**。

## FM check v6只证明静态事实

buildFmCheckReport同步聚合sourceIssues、strictValidateDomainModel的path/message、analyzeTraceability错误，去重后形成staticErrors/modelValidated。若用户提供scope且静态模型有效，再selectScope；ScopeSelectionError成为错误，其他内部异常不吞。completenessGaps仅在原模型有效时计算，target为selected或全模型。

currentDigest回调与输入digest比较，变化附Model inputs changed during validation，inputChanged=true、consistent=false。consistent=无静态错误且未变化；complete无scope为null，有scope为gaps为空且consistent；valid=无errors且complete!==false。所以无scope时有gaps仍可valid，不能把一致性当完整交付。

报告checkVersion=6，包含scopeRefs/contextRefs/gaps/errors、modelDigest/modelValidated/inputChanged、**testExampleCount（声明数量，不是执行数）**和humanConfirmation=not-asserted-by-machine。旧simulationPassed/scenarioResults/timelineSummary不再出现。advisories始终针对提交模型，名称建议如ROLE_DOMAIN_NAME_NOT_ANTHROPOMORPHIC不影响consistent/complete/valid。

## Scope是交付单位

selectScope只收独立Context，拒绝非Context、child slice、重复scope。保留整个Context subtree、真实引用/规则依赖和角色实现；共享participant.party不把另一合同整包拖入，未知context-role实现不能猜造。

completeness 要求每属性 valueType/required、显式业务时标、凭证归属与责任、请求有confirmation/evidence-role、confirmation有request引用、contract context存在primary request、双方都作primary履约权利人等；已经是static error的不重复成gap。**不再要求scope有内存scenario覆盖**。

flowKind 的完整性检查要求补偿请求/升级记录显式 references 被违约请求；补偿源须为新请求且链不得循环，升级须 other_evidence、责任角色及交接端点 notes。它只证明结构，不判法律终局，不能绕过请求自身的确认闭环。

readyScope重建同一scope并校验v6报告的一致/完整/有效、无errors/gaps、输入未变以及scope/context边界匹配；不验证已移除的replay/count字段。正式下游还有API projection/coverage门禁，见[传感器](../agents/sensor-orchestration.md)。

## 原生CEL是解析与求值权威

celEvaluator以@marcbachmann/cel-js Environment(unlistedVariablesAreDyn=true)直接parse，CompiledCel暴露native ParseResult/AST及可重复evaluate。native错误保留range/cause；isCelBuiltin排除内建常量/namespace，identifiers通过scoped walker排除宏局部变量，不再运行自制CEL解释器。

Timestamp输入按declared type变Date，Duration与UnsignedInt使用native类型。int/uint为精确bigint，不走double中间态；celValueToJson把safe整数变number，**较宽整数变精确十进制string**，Date/Duration/bytes/Map/容器递归归一化。validateTypedValue允许safe number或在int64/uint64范围的exact decimal string；拒绝unsafe number、越界/格式错误，而不是拒绝所有大于JS安全范围的合法CEL整数。

native scoped AST也用于属性lineage与Inspector诊断，many macro/shadowing与static index规则见[关键数据](../language/key-data-and-provenance.md)。表达式能parse不等于模型绑定正确，能求值不等于后端执行了它。

## 瞬态样例oracle

evaluateRuleOnExample(model,rule,{bindings,asOf})无Node I/O，不读环境时钟，不加载scenario文件。asOf必须RFC3339，拒绝未知alias、缺binding、one/list形态错误、无法解析entity或typed value。now/asOf的timestamp type-only alias由显式asOf注入，用户传不同值拒绝；其他scalar必须提供。

按模型属性类型转换独立clone的输入，compile/evaluate后celValueToJson，再验证resultType与JSON可表示性；拒绝undefined/non-finite/private runtime泄漏，失败保留rule ID与cause。它是**编译期预期生成器，不是backend simulator**。

evidence-acceptance projector 从 examples[].test解析flow依赖，先清asserted derived值、用upstream facts求规则，再对显式期望核对，冲突拒绝而非覆盖；`evidence test` 调用 Bruno 在真实后端检查状态与业务字段，再用响应做 Schema 校验；生成集合本身不是执行证据。int64/uint64精确string可保留到OpenAPI/测试literal，避免舍入制造伪绿。

## 故事与本地预演

当前 scenarioStudio 编辑的是实体 examples[].test 的 flow，不创建独立 Scenario/Instance 文件。flowAggregator 按显式 basedOn 与时点构造只读轨迹，供故事投影。桌面 journey preview 仅对当前可见前缀与唯一非 test 示例求规则，缺绑定保持未知，求值错误可见；它不执行 HTTP，也不形成持久化 replay 结论。卡片 What-If 是基于当前履约对的只读假设评估；补偿只有另行确认并建模才会写入。

## CLI和桌面当前入口

`evidence check [model] --scope <context> --json`共享报告，作用域可重复；统一app可加载树或Bundle。model-io兼容workflow有自身目录命令约束，不可把旧bin限制泛化到统一check。compile/lineage要求checkable，旧timeline/simulate/role-play命令明确移除，不返回空成功。

桌面ProblemsPanel读SensorReport：FM errors=block、gaps=warn、inputChanged=warn、advisories=warn；不再FM_NO_SCENARIO。报告documentRevision不等当前或loading/error则过期不标画布。实时静态检查不修改模型，不代替保存或业务批准。

## 验证与故障边界

fmCheck/scope specs保护v6字段、null complete、digest变化、独立边界、缺口和lint；celEvaluator/celAnalysis/traceability specs保护native功能、词法scope和精确整数；transientSandbox specs保护显式时钟、typed值、resultType/JSON、输入不变。API acceptance e2e 用独立 HTTP 后端验证真实红绿。

遇错按层定位：syntax/引用/lineage→修模型；scope gaps→补责任闭环；oracle绑定/期望→修examples或规则；HTTP失败→修实际实现；源变更→重查；工具缺失→显式setup，不编造一个成功结论。

相关：[语言](../language/fm-dsl.md) · [API验收投影](../contracts/api-projection.md) · [CLI双门禁](../workflows/cli-governance.md)
