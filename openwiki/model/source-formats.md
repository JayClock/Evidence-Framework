---
type: storage
title: 源模型、Bundle 与持久化
description: .evidence/fm树与单文件Bundle的纯格式/Node I/O分界、非抛出解析、旧validation拒绝、幂等写出、摘要和外部编辑冲突语义。
tags: [adapters, files, bundle, serialization, digest, churn, model-io, cli]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-17T06:43:02.055Z
sources:
  - id: openwiki-source-934367cee5dc2ef07c9fb835
    resource: repo://apps/desktop/src/main/modelWatcher.ts
  - id: openwiki-source-5b34bee2ec1dee5c3ad249ac
    resource: repo://apps/desktop/src/main/projectStore.spec.ts
  - id: openwiki-source-7d6301f8bedb09df7ce20329
    resource: repo://apps/desktop/src/main/projectStore.ts
  - id: openwiki-source-eb29c98cfa71901c2675a7e4
    resource: repo://libs/evidence-agent/src/sensors/native/modelSources.ts
  - id: openwiki-source-83f9ee9177192af59a8fc434
    resource: repo://libs/evidence-model-core/src/adapters/modelBundle.ts
  - id: openwiki-source-38e18c58a2be3089edddbc1a
    resource: repo://libs/evidence-model-core/src/adapters/modelSourceFiles.ts
  - id: openwiki-source-36b616eafb8331e3eddb8d31
    resource: repo://libs/evidence-model-core/src/purity.spec.ts
  - id: openwiki-source-9008514a60858ff717f539ab
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.ts
  - id: openwiki-source-54f28741c6e97dfb9adcc096
    resource: repo://libs/evidence-model-core/tests/support/modelRoot.ts
  - id: openwiki-source-bcadd1e63a7d140ce717e9ea
    resource: repo://libs/evidence-model-io/package.json
  - id: openwiki-source-2c4cbeffd18cdc1b75d15ef4
    resource: repo://libs/evidence-model-io/src/adapters/diskAdapter.ts
  - id: openwiki-source-0b71e61f611dfb29028134aa
    resource: repo://libs/evidence-model-io/src/adapters/modelFileAdapter.ts
  - id: openwiki-source-4fa503355d9f3a8084bea718
    resource: repo://libs/evidence-model-io/src/adapters/modelRoot.ts
  - id: openwiki-source-88a3cc6d22f70a1b93ada22f
    resource: repo://libs/evidence-model-io/src/commands.ts
  - id: openwiki-source-5827654ee488871fab61b1a1
    resource: repo://libs/evidence-model-io/src/legacyRemoval.spec.ts
  - id: openwiki-source-7e8a4154b74359d73d641f4c
    resource: repo://libs/evidence-model-io/src/modelCli.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
generated: { by: "codex", at: "2026-11-17T06:43:02.055Z" }
---

# 源模型、Bundle 与持久化

一份DomainModelDocument有两种载体：Git友好的`.evidence/fm/`（model.json + entities/relationships/rules），便携`*.evidence.json`（fm_bundle envelope+manifest+三数组+可选readme）。内联 examples、实体 sourceSnippet 与 manifest.sourceDocument 随树/Bundle 往返；旧validation/scenarios/instances**拒绝而非兼容读取**。

## 格式代码不碰磁盘

model-core/adapters的modelSourceFiles/modelBundle负责命名、parse/stringify、pack/unpack投影，browser-safe；model-io/adapters的diskAdapter/modelRoot/modelFileAdapter负责node:fs。main/sensors/API/acceptance/cli可引用io，renderer只引用core。purity.spec通过浏览器bundle禁止core解析Node builtins；测试reader不成为production runtime。

## 树与Bundle契约

实体文件category-kind--slug，关系relation--slug、规则rule--slug，slug来自ID尾段，碰撞稳定加-2/-3；manifest先、其余按路径排序。stringifyModelJson两空格+末尾newline，可选deep sortKeys；Bundle默认三集合按ID排序，可关闭sortItems。source tree writer仅拥有model.json与三source trees，README/generated/dot不重写。

parseModelSourceFiles对畸形JSON、非对象、unsupported type、重复ID、缺manifest给path issue而非throw；无实体model.empty区别可接受blank start。validate:true追加strict findings。现在遇validation路径明确legacy issue，不能当无关文件悄悄丢弃。

parseModelBundleText要求对象、正确type；schemaVersion若出现必须5.0，缺失仍可读。错误item type/重复ID/非string readme/未知字段给issue，可读部分保留。validation是明确legacy source issue；serialize/投影旧validation文档直接拒绝，防pack后丢测试。Bundle serialize始终发type=fm_bundle/schemaVersion5.0，保留readme与实体内examples，不再带validation数组。

## 保存、打包、解包

writeModelDirectory逐文件比**字节**，相同记unchanged，不同temp+rename；最后删三source trees内document不再命名的JSON，返回written/unchanged/removed，外部README/generated不删。writeModelBundle也按序列化文本比，变化时原子替换并报告bytes；保留原语义不保证保留任意手工格式。

packModelDirectory走传入模型目录（不是自动再拼.evidence/fm），收JSON和root README，忽略generated/dot/cache；retired validation扫描用于拒绝，不打进新Bundle。packModelSourceFiles复用树parser并把README放readme。

unpackModelBundle按modelBundleSourceFiles输出：JSON比canonical对象、其他比bytes，所以等义手工格式不重写。未命名文件留在原地，不像save清stale；它是迁移不是破坏性reset。旧validation filename重建算法已删除，无所谓继续保证其roundtrip。

## Reader范围与摘要

readModelDirectory读manifest+三模型树。readModelRootFiles为checks读同源，并扫描validation树（包括非JSON）以拒绝遗留资料；缺root返回空集供parser解释。readModelRootBytes走整个root的常规文件，排generated、__pycache__、dot path，README/stray file也算输入。

modelDigestOf为排序path→sha256(bytes) map再sha256并加sha256:前缀，位置无关、路径/字节敏感。不能声称Bundle字节摘要一定等于解包源树摘要：载体/路径/format不同就不同。pack若默认把Bundle放模型目录内，新文件加入bytes摘要但不成为三树模型，建议显式-o放源树外。

FM check currentDigest与sensor rereadDigest能在检查期间识别源变化，报告inputChanged/error/consistent=false。API loadFm前后比源snapshot；旧 review generator 已删除。

ProjectStore fingerprint是另一个sha1（树仅模型源paths/content或Bundle字节），不是artifact digest，空/缺失null；renderer不轮询它，外部变化依Chokidar通知。

## 外部编辑不自动合并

create拒绝已有Bundle/manifest；**save无baseline compare/lock/merge**，renderer document最后写入获胜，外部新加三树JSON可能被stale scan删除。幂等少churn不是冲突保护；watcher banner只是提示，用户必须reload或自行解决。

Chokidar从存在祖先监目标，初始静默、150ms稳定后200ms合批，树支持nested JSON与根重建，Bundle只关注目标文件且支持atomic rename；无关/validation/generated不触发，close取消pending。显式 reload 重新 open 并 resetHistory；story 来源 invalidation 仅在读前后均 clean 时自动刷新，相等内容保留历史，不能丢未保存编辑。

## 推荐命令与兼容入口

先build cli，使用`evidence pack/unpack/inspect/check/compile/lineage`；model:pack/unpack/inspect根脚本已转apps/cli。旧evidence-model bin为stderr弃用shim，调用共享modelCli/commands而不import app。保留六模型verbs，timeline/simulate/role-play明确removed，不能空成功。

pack默认模型目录内manifest ID命名Bundle，unpack默认./.evidence/fm；compile/lineage需out并先checkable；inspect可JSON，pack/unpack会报告issues而非悄修。共享legacy workflow约定0成功、1findings/拒绝、2usage，统一check/tree或Bundle参数行为由app router适配；静态check不再打印执行scenario数。

## 验证入口

modelSourceFiles/modelBundle specs保护命名/碰撞、非throw issues、empty code、readme/examples、legacy拒绝与稳定序列化。diskAdapter/modelFileAdapter specs保护idempotent、canonical解包、不删非owned、temp清理；legacyRemoval保护旧格式/命令不复活。projectStore/modelWatcher tests保护两源、覆盖拒绝、摘要/通知与reload契约。

相关：[语言](../language/fm-dsl.md) · [桌面存储](../desktop/app-shell.md) · [会话](./commands-and-session.md) · [CLI工作流](../workflows/cli-governance.md)
