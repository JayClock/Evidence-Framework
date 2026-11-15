---
type: architecture
title: 受控模型变更、会话与历史
description: Immer recipes、guarded mutators与标准RFC6902如何构成原子模型事务，历史、选择、同步事件和Agent/MCP边界的真实安全语义。
tags: [mutations, session, undo, subscriptions, patches, diff, graph, purity]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-15T14:07:58.904Z
sources:
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-71f7c0262d5ba642c71843ea
    resource: repo://apps/desktop/src/main/ingestionIpc.ts
  - id: openwiki-source-4847134dd2de8026fd1ac93f
    resource: repo://apps/desktop/src/renderer/state/useAgentPatchBridge.ts
  - id: openwiki-source-f0f06a0981a7ca97c510b44d
    resource: repo://apps/desktop/src/renderer/state/useEditorSession.ts
  - id: openwiki-source-46aa2f0fdf6e50b3fa7d4eb0
    resource: repo://apps/desktop/src/renderer/state/useLiveModelBridge.spec.tsx
  - id: openwiki-source-87e5669496e1e215691f3e0c
    resource: repo://apps/desktop/src/renderer/state/useLiveModelBridge.ts
  - id: openwiki-source-034a304691f6c1f77f682d25
    resource: repo://apps/desktop/src/renderer/state/useMcpBridge.ts
  - id: openwiki-source-ef46d50ae45e81fdfe3ff913
    resource: repo://apps/desktop/src/renderer/state/usePatchReview.ts
  - id: openwiki-source-25f64c8e5d94b447bfe67308
    resource: repo://apps/desktop/src/shared/delivery.ts
  - id: openwiki-source-418388028b19fdeb893f56a8
    resource: repo://libs/evidence-agent/src/tools/evidenceTools.ts
  - id: openwiki-source-bab9cd022cd0c06c4edacf32
    resource: repo://libs/evidence-model-core/src/diff/modelDiff.ts
  - id: openwiki-source-f02b234edea2573a78a178f1
    resource: repo://libs/evidence-model-core/src/ingestion/compileDraft.ts
  - id: openwiki-source-c6f998270d30fac839dc0715
    resource: repo://libs/evidence-model-core/src/model/graph.ts
  - id: openwiki-source-5f7aa18271519108d52c8b0d
    resource: repo://libs/evidence-model-core/src/mutations/attributeMutations.ts
  - id: openwiki-source-6aa88597ad507455da0395d6
    resource: repo://libs/evidence-model-core/src/mutations/derivationMutations.ts
  - id: openwiki-source-f9bdd97bedce682d7ba772f7
    resource: repo://libs/evidence-model-core/src/mutations/entityMutations.ts
  - id: openwiki-source-719c33f78b7e011a9ae31e2b
    resource: repo://libs/evidence-model-core/src/mutations/errors.ts
  - id: openwiki-source-018d7f07550f9f8d085a8f81
    resource: repo://libs/evidence-model-core/src/mutations/fulfillmentMutations.ts
  - id: openwiki-source-435cf97447e9a87f2921f3cd
    resource: repo://libs/evidence-model-core/src/mutations/guards.ts
  - id: openwiki-source-8e8fa89dba2bff1a19e45f56
    resource: repo://libs/evidence-model-core/src/mutations/operators.ts
  - id: openwiki-source-32b6905d2b3e0b5d4b3caa0f
    resource: repo://libs/evidence-model-core/src/mutations/relationshipMutations.ts
  - id: openwiki-source-ff9543d041ae3c5c225cf524
    resource: repo://libs/evidence-model-core/src/mutations/ruleMutations.ts
  - id: openwiki-source-36b616eafb8331e3eddb8d31
    resource: repo://libs/evidence-model-core/src/purity.spec.ts
  - id: openwiki-source-b4abb2821db0f045818014a1
    resource: repo://libs/evidence-model-core/src/session/createModelSession.ts
  - id: openwiki-source-5552b65f098f7942c5396da6
    resource: repo://libs/evidence-model-core/src/session/jsonPatches.ts
  - id: openwiki-source-a8da42e803f5d90fae267d40
    resource: repo://libs/evidence-model-core/src/session/types.ts
  - id: openwiki-source-307bb5e668d266a4bd7c1f2d
    resource: repo://libs/evidence-schema/src/ast/jsonPatch.ts
generated: { by: "pi", at: "2026-11-15T14:07:58.904Z" }
---

# 受控模型变更、会话与历史

旧ModelCommand/CommandSequence/dispatch/dispatchAll/17类typed patch已删除。`createModelSession` 现在以 **Immer draft recipe + forward/inverse patches** 管编辑；协议只传RFC6902和RFC6901字符串pointer，不泄漏Immer array paths。

## 会话所有权与提交

session持current document、惰性memo DomainGraph、selection、undo/redo、listener Set。公开读getDocument/getGraph/getSelection/validate/canUndo/canRedo；写mutate(recipe,label)、applyPatchBatch、replaceDocument；历史undo/redo；选择select/selectAttribute/clearSelection与subscribe。

mutate在produceWithPatches隔离draft运行，snapshotRecipeResult避免返回revoked draft/别名；无patch为no-op，不清redo、不发文档事件。异常中途抛出就不record。record先可选strict gate，再提取affectedIds、裁undo、清redo、换document/清graph、发document-changed后history-changed。affectedIds比较前后对象身份并包含关系端点，数组移位不把所有后移对象都误报改动。

historyLimit默认100，finite取floor并至少1，非finite回100。entry包含label/patches/inversePatches/affectedIds；undo/redo应用已存patch而非重跑recipe，空stack返回false，新编辑清redo。replaceDocument默认作为可撤销replacement并走record/guard；resetHistory=true清两stack直接替换，供reload，不受forward gate。undo/redo也不重做strict gate，恢复历史事实。

## 渐进建模不是绕过语法

validateOnDispatch默认false，开启时对next strictValidate，失败ModelSessionValidationError、文档与历史均不提交。desktop初建只传document，允许静态不完整的渐进模型；但领域mutator仍实施业务guard，RFC6902边界仍实施strict syntax。原子JSON Patch不是自动调用每个domain mutator，所以不能声称任意wire patch都等同经过所有领域guard。

## Guarded domain mutators

mutations/下的函数接受draft并原地更新draft，不能拿普通共享源直接当可变容器。guards核实ID grammar/跨集合唯一、实体/context/root合同、party roles已绑定、分类/责任边界。ModelMutationError有稳定code/details，供工具诊断而非解析中文。

entity identity的id/type/category不可随update改，rule的id/type/kind/context/target保持；派生目标存在时attribute rename拒绝，不能可靠重写expression。entity删除先枚举所有引用，不cascade则entity.referenced，cascade仅删可安全移除引用；derived attribute移除先处理rule，不能留悬空target。relationship拒绝self与错误plays_role方向。

复合mutators一次写成完整业务结构：createContract连接rootRefs、bindDerivedRule连接rule与attribute、createFulfillmentPair写请求/确认/引用/完成rule并要求mandatory business time。caller在单个session.mutate中组合多个mutator即一批，失败全不提交，不再手算inverse Command。

四领域算子introduceFulfillmentPair/addBreachCompensation/roleifyAndInvertDependency/isolateDomainCalculator也是guarded recipes，返回createdIds等OperatorResult；createModelPatch(document,recipe)在本地执行后只取标准patches与snapshot result。算子没有特权写通道，工具仍交给renderer事务。

## RFC6902边界与安全

JsonPatchItemSchema区分add/remove/replace/move/copy/test，strict keys，value须finite acyclic JSON。pointer允许空root或/开头，转义仅~0/~1；解码段拒绝__proto__/constructor/prototype，防原型穿透。ModelPatchRequestSchema还要求非空rationale和至少一op；内部JsonPatchSchema可空。

applyJsonPatchMutator先parse+structuredClone，避免freeze或alias调用者value；逐op验证路径只走own JSON members，array index须规范非负安全整数且不越界（不能4294967296被int32转成0、不能01/-1），'-'仅add位置。copy/move验证from，move拒绝移入自身子孙、同path no-op、先remove再按新数组长度解析destination，遵循RFC。用fast-json-patch验证执行，最后DomainModelDocumentSyntaxSchema验证结果。root替换即使先前已写draft，也reconcile回同draft，避免Immer“修改后又返回替代对象”冲突。

`test`适合先验证/ entities/N/id，拒绝过期位置快照。所有op在同produce recipe中，中间test/path/syntax失败全批不提交。合法但静态FM不完整的结果可被默认session接受，随后validate/sensors报告，不应伪称patch成功就是完整绿灯。applyModelPatches只读预览返回副本文档；toJsonPatches转义内部paths，不把Immer格式发到IPC。

## 选择、事件与异常

换document后若selected entity消失清全部selection，若仅selected attribute消失只清attributeName；这些selection-changed可早于document-changed，UI不会编辑不存在字段。graph memo只在文档变动后失效，selection不构造另一图。

三事件是document-changed（commands字段保留但现为label）、history-changed、selection-changed。文档/stack已提交后同步按Set顺序通知，doc event先history，undo/redo label为undo:/redo:。listener不是事务参与者：它抛错可能使调用方看到异常，但编辑已提交且后续listener未被通知，不得解释为回滚。

## 桌面、Agent与读取模型

Agent/MCP renderer边界再parse共享schema并一次applyPatchBatch(agent:/mcp:rationale)。MCP返回op/revision/undoable与post-hoc strict diagnostics，只有真变更增revision；Agent只在真变更record before/after。usePatchReview以当前===after才undo，后续编辑后只关闭，accept不写。

useLiveModelBridge mount和每document-changed发root/revision/document/base，undo/redo也发、selection不发；同步emit让发布先于patch ack。main只接受更高revision并保留first baseline、clone镜像、调度sensors。baseline不随save自动变；报告按revision判stale。

diffDomainModels是只读说明，分Context/业务实体/关系/规则及key-data drift，不是写入口，也不再给旧API自制breaking classifier供电。DomainGraph的indexed lookup/contextPath/rules/fulfillmentPairs是派生read model；pair由显式引用+完成/违约规则定义，canvas和Inspector共用，已无simulator消费者。

## 测试与纯度

session/createModelSession specs保护atomic/no-op/historyLimit/结果snapshot/affectedIds/selection清理、listener与事件顺序；jsonPatches specs覆盖root/move/copy/test、数组/own-path/prototype边界、clone隔离和失败不提交。mutations各family/operators specs保护红线与一次事务；purity.spec以浏览器bundle禁止Node builtins。core可以被renderer/Node工具共用，但文件读写只属于model-io/main。

相关：[renderer](../desktop/renderer-state.md) · [补丁审查](../desktop/ingestion-and-patch-review.md) · [语言](../language/fm-dsl.md) · [源格式](./source-formats.md)
