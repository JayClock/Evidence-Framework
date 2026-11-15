---
type: orchestration
title: 原生传感器与治理闭环
description: 共享 SensorReport 如何承载 FM 静态检查、关键数据和 API 诊断，以及 version 6 阶段门禁、独立漂移审计与真实 HTTP 验收治理的区别。
tags: [sensors, stage-gate, governance, drift, diagnostics]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-15T14:07:58.904Z
sources:
  - id: openwiki-source-f85ce0e3a462797434d822a8
    resource: repo://apps/desktop/src/main/agentIpcHandlers.ts
  - id: openwiki-source-fe198b09c0b1eeb6a6ebe4d9
    resource: repo://apps/desktop/src/main/agentRuntime.spec.ts
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-f278221a7db6307920fce03f
    resource: repo://apps/desktop/src/main/mcpRequestHandler.ts
  - id: openwiki-source-c72ee53c66b83fbe248c4854
    resource: repo://apps/desktop/src/main/reviewPreview.ts
  - id: openwiki-source-bc335f19a22e1758f9ecea1e
    resource: repo://apps/desktop/src/main/sensorRuntime.ts
  - id: openwiki-source-34616781ee43c94607ccca92
    resource: repo://apps/desktop/src/renderer/components/BottomStatusBar.tsx
  - id: openwiki-source-badae4d8a43ef4489bf1657f
    resource: repo://apps/desktop/src/renderer/components/console/problemFilters.ts
  - id: openwiki-source-807d0c599c1444f26f974d8d
    resource: repo://apps/desktop/src/renderer/components/console/ProblemsPanel.spec.tsx
  - id: openwiki-source-54bfa14340461b5df12c5a93
    resource: repo://apps/desktop/src/renderer/components/console/ProblemsPanel.tsx
  - id: openwiki-source-e0008b039e09cb0ae867a401
    resource: repo://apps/desktop/src/renderer/components/drift/DriftRadar.tsx
  - id: openwiki-source-9459ee1a8fc917f2d94619ce
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.tsx
  - id: openwiki-source-694f14a9d64dcf9f23bb8a3b
    resource: repo://apps/desktop/src/renderer/state/useSensorsState.ts
  - id: openwiki-source-62334b24779c75966cac5f92
    resource: repo://libs/desktop/feature-canvas/src/diagnosticIndex.spec.tsx
  - id: openwiki-source-f172557f5294fb7b6d40b660
    resource: repo://libs/desktop/feature-canvas/src/diagnosticIndex.ts
  - id: openwiki-source-172b58a8c9ee4fcc3b2b3daa
    resource: repo://libs/evidence-agent/src/governance/governanceLoop.ts
  - id: openwiki-source-5570b1437846809479c60f79
    resource: repo://libs/evidence-agent/src/sensors/native/driftSensor.ts
  - id: openwiki-source-eb29c98cfa71901c2675a7e4
    resource: repo://libs/evidence-agent/src/sensors/native/modelSources.ts
  - id: openwiki-source-feaf4e64c269397a25f93a3d
    resource: repo://libs/evidence-agent/src/sensors/native/nativeApiSensor.ts
  - id: openwiki-source-701227b6d41a5cbdfe79bcbf
    resource: repo://libs/evidence-agent/src/sensors/native/nativeDriftAudit.ts
  - id: openwiki-source-925f1915fe23c3f1c07b66e9
    resource: repo://libs/evidence-agent/src/sensors/native/nativeSensors.spec.ts
  - id: openwiki-source-819cda3e1e556eb778e9f02b
    resource: repo://libs/evidence-agent/src/sensors/native/nativeSensors.ts
  - id: openwiki-source-a51a313ecc5551e788fbf06c
    resource: repo://libs/evidence-agent/src/sensors/native/nativeStageGate.ts
  - id: openwiki-source-c1e4281890861794f7ffa119
    resource: repo://libs/evidence-agent/src/sensors/sensorReport.spec.ts
  - id: openwiki-source-9ad3f46aa18e9c002bf6f482
    resource: repo://libs/evidence-agent/src/sensors/sensorReport.ts
  - id: openwiki-source-42da6cbec5d78ace581498c6
    resource: repo://libs/evidence-agent/src/sensors/sensorsEngine.spec.ts
  - id: openwiki-source-ebeef9d445379fe3773732df
    resource: repo://libs/evidence-agent/src/sensors/sensorsEngine.ts
generated: { by: "pi", at: "2026-11-15T14:07:58.904Z" }
---

# 原生传感器与治理闭环

`libs/evidence-agent/src/sensors` 分三层：native 传感器计算事实，sensorReport 折叠诊断，sensorsEngine 决定下游交付门禁。它们分析而不写模型。静态通过不是 HTTP 后端验收，也不是业务批准。

## 一份输入与报告协议

磁盘路径经 `loadModelSources` 读模型和原始文件字节，形成 sourceIssues、sha256 digest 与 rereadDigest；各传感器共享这份模型和内联 examples，不再加载 Scenario/Instance suite。FM check 默认再次读取摘要以检测输入漂移。直接的 `*.evidence.json` 路径被 native sensors 拒绝，宿主须按源格式适配。内存 document 则以 JSON 摘要和恒定 rereadDigest 建立固定快照，不会产生磁盘 FM_INPUT_CHANGED。engine 的 RunSensorsInput 不提供跳过二次读取选项。

SensorIssue 有五类 source（check_fm、audit_key_data、audit_api、audit_drift、stage_gate），severity=block/warn/info，稳定 code，以及可选 targetNodeId、contextRef、suggestion。通用 issue helper 用 source:code:message 形成身份；重写消息就是新身份。finalizeSensorReport 用 Map 按 issueId 去重（同 ID 后值覆盖、保留键顺序），重新计数；passed 和 canPreviewApi 仅表示 blockCount=0。不可用传感器必须产生 blocking SENSOR_UNAVAILABLE。

关键数据待决是 warn/KEY_DATA_DECISION_OWED，定位 entity#attribute。最多输出 40 条，summary 仍统计全量；无待决输出 info/KEY_DATA_RESOLVED（包括空台账）。resolvedCount=max(0,total-owed)。

`isStageGateReady` 还要求显式 passing stageGate、零待决、零 blocking，以及存在 apiSummary 时零缺口/破坏变更。普通 native run 和 review preview 不传 stageGate，因此其 false 不代表新增故障，不能把 status bar 当作自动批准。

## 传感器机制

- FM：errors → block/FM_INCONSISTENT；scope gaps → warn/FM_SCOPE_GAP；inputChanged → warn/FM_INPUT_CHANGED；advisories → 自身 code 的 warn 并定位 entityId。旧 FM_NO_SCENARIO 已移除。
- 台账：复用 FM 分析的 traceability，避免两份追溯相互矛盾。待提供方决议不是静态语法错误，但影响交付就绪。
- API：buildDelivery 当前/基线文档，通过 oasdiff 比较；覆盖率只统计 evidence 实体，不把 participant/role 当公共 CRUD。未覆盖为 API_COVERAGE_GAP 警告，snapshot error 变 block，其他诊断 warn；兼容变化 level>=2 在 draft 为 warn、release 为 block。无问题给 info/API_ALIGNED，非发布批准。summary 包括 routes、coverage、uncovered、breaking count、hasBaseline、modelDigest；旧手工 API_DERIVATION_DRIFT 不再单独计算。
- API 异常隔离：保留 FM/台账报告，仅追加 audit_api unavailable 的 block，不能抹掉原结论。

## Version 6 阶段门禁

`nativeStageGate` 消费已有 FM 报告而不重建模型：要求 **checkVersion=6**、consistent/complete/valid=true、inputChanged=false、无 errors/gaps、所有请求 scope 在报告 scopeRefs 内。空 scope 明确拒绝“无边界下游”；所有拒绝原因累积返回，不使用人工闭环标记。`isGateReadyReport` 是去掉空 scope 检查的同一谓词。

engine 在 target=api 或未提供 saved report 时跑 fresh sensors，给 API 使用 release 模式。API gate 收集所有高于 info 的 audit_api 诊断，并比较 saved/fresh modelDigest，摘要不同必须重查；visualization gate 保持 FM-only，不因 API 覆盖缺口拒绝审查页。MCP 投影 passed、exitCode、driftDetected、blockingReasons；异常关闭门禁而不伪造退出码 0。

## 独立漂移与治理

漂移不属于 runFullSensors。nativeDriftAudit 读取已保存模型和 OTLP/JSON trace，合并源读取错误；finding 带 commit、evidenceRef、contextRef、modelExpectation、remediation。

| kind | 默认严重性 |
| --- | --- |
| UNMODELED_EVIDENCE_COMMITTED、DERIVED_VALUE_SUPPLIED | block |
| UNMODELED_ATTRIBUTE_WRITTEN、CROSS_CONTEXT_WRITE、BREACH_WITHOUT_FOLLOW_UP | warn |

可选 driftIssues 把证据引用映射 target、remediation 映射 suggestion，trace-read errors 为 DRIFT_TRACE_UNREADABLE 警告。桌面当前入口是独立 DriftRadar（不是已删除 SimulationSandbox），MCP 走 audit_production_drift。

纯策略 `decideGovernance` 对每种 finding 给一个行动/工具；未知类型升级人工 ticket，派生值输入错误应修服务。补偿缺口建议 add_breach_compensation；跨上下文写入要求归还所有者。策略优先 production_overreach > needs_repair > model_lagging > healthy。外部 HTTP acceptance 缺失不能确认实现，空、畸形或非全绿追加 repair_implementation。只有无 blocking、提供非空全绿验收且 model_lagging 才 canPatchModel；这不是自动执行补丁的调度器，桌面测试调用策略不代表生产 UI 自动调用。

## 诊断如何到达界面

主进程 runtime 默认 800ms debounce 合并编辑；捕获 live snapshot、run sequence 和 documentRevision，晚到旧结果丢弃。debouncer 捕获 run 拒绝，通过注入 onError 处理。useSensorsState 先查 latestReport，无结果才触发 fresh run，再订阅按 root 过滤的 push；refresh 立即重查，保存后也重查。

editor 在 loading/error、live bridge 错误或 report revision 不等于当前 revision 时，给画布空报告，防旧诊断污染。`createDiagnosticIndex` 仅接受明确引用：targetNodeId 的 # 前缀须存在，否则 contextRef 必须真是 context；不从消息猜 ID。每节点去重并取最高 severity。

ProblemsPanel 展示严重级别 tabs、报告计数、过期标记、active row、code/target/建议和定位动作；filterIssues 在组件外可独立测试。定位支持 entity#attribute、context 或关系。空状态明确“机器检查不等于业务批准”。reviewPreview 复用未保存 document 的 FM/台账报告，追加 validation: 前缀的严格诊断及 objectId，不从 prose 猜目标；预览期间磁盘摘要变化则拒绝。

## 验证与邻接

sensorReport/nativeSensors/sensorsEngine specs 保护严重性、计数、台账上限、不可用失败、v6/空 scope 门禁和 API/visualization 非对称；nativeApiSensor specs 保护草稿/发布差异与 API 故障隔离。driftSensor/governanceLoop specs 覆盖五种漂移、真实验收门槛和行动优先级。diagnosticIndex 与 ProblemsPanel specs 覆盖引用定位、去重、tabs、过期与定位。

参见[静态检查](../model/checks-and-simulation.md)、[关键数据](../language/key-data-and-provenance.md)、[Pi 工具](./pi-harness.md)、[CLI 双门禁](../workflows/cli-governance.md)。
