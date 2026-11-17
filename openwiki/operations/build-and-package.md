---
type: operations
title: 构建、打包与维护
description: Node/pnpm/Nx工具链、显式oasdiff准备、source条件与层边界、Electron资源打包，以及CI与OpenWiki可恢复更新的操作合同。
tags: [build, packaging, nx, pnpm, eslint, boundaries, electron-forge, ci, openwiki]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-17T06:43:02.055Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-6d4b4e707b8d60b6ccfa3425
    resource: repo://.github/workflows/openwiki-update.yml
  - id: openwiki-source-afe88c3d8e9b032e5cd298f0
    resource: repo://.github/workflows/release-desktop.yml
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-5466111549d3bdae4dce66a7
    resource: repo://apps/cli/package.json
  - id: openwiki-source-b9c537cd7841c97272e0ebfa
    resource: repo://apps/desktop/forge.config.mjs
  - id: openwiki-source-de5c5760d707be19e09eb7e3
    resource: repo://apps/desktop/project.json
  - id: openwiki-source-b5ea8c8713a5b04ee1c21d2d
    resource: repo://apps/desktop/vite.main.config.mjs
  - id: openwiki-source-5b2f4571b417c1f942c2db50
    resource: repo://apps/desktop/vite.preload.config.mjs
  - id: openwiki-source-15aba07b973e26bd886a7db3
    resource: repo://apps/desktop/vitest.config.mts
  - id: openwiki-source-18fab4844d8695b257bd644b
    resource: repo://docs/workspace-layout.md
  - id: openwiki-source-0c1cc5dc86ad401eb9678504
    resource: repo://ENVIRONMENT.md
  - id: openwiki-source-2fda883e9b76745f69f487f7
    resource: repo://eslint.config.mjs
  - id: openwiki-source-089e2bd2aace21171ae406bc
    resource: repo://libs/desktop/feature-canvas/eslint.config.mjs
  - id: openwiki-source-100de7a731086244071952a9
    resource: repo://libs/evidence-agent/package.json
  - id: openwiki-source-6c0fdf3558dd7a2667c2fc40
    resource: repo://libs/evidence-api/eslint.config.mjs
  - id: openwiki-source-7c4f607b2d42287b8ffedc0c
    resource: repo://libs/evidence-model-core/package.json
  - id: openwiki-source-36b616eafb8331e3eddb8d31
    resource: repo://libs/evidence-model-core/src/purity.spec.ts
  - id: openwiki-source-446d2e0ab37269b2e7ef6f6d
    resource: repo://libs/evidence-model-core/vitest.config.mts
  - id: openwiki-source-bcadd1e63a7d140ce717e9ea
    resource: repo://libs/evidence-model-io/package.json
  - id: openwiki-source-e1cbaa8386bdd9839330928e
    resource: repo://libs/evidence-model-io/src/cli.ts
  - id: openwiki-source-7e8a4154b74359d73d641f4c
    resource: repo://libs/evidence-model-io/src/modelCli.ts
  - id: openwiki-source-6ba748254f38112b13d529da
    resource: repo://nx.json
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-04d439a4726a77f120e211e4
    resource: repo://tools/eslint/browser-platform.mjs
  - id: openwiki-source-ad6afd03545cc41ebdb6326a
    resource: repo://tools/oasdiff/setup.mjs
  - id: openwiki-source-d8dbf281c85f8a886745ac24
    resource: repo://tools/workspace-rules/boundary-drill.mjs
  - id: openwiki-source-df1e4d0dc0a35c64fd0e652b
    resource: repo://tsconfig.base.json
generated: { by: "codex", at: "2026-11-17T06:43:02.055Z" }
---

# 构建、打包与维护

开发工具链为Node.js22、pnpm12.16.1，一份 workspace lockfile、一个 Nx 图，无Go/Python解释器要求。但**pnpm install不是全部setup**：API compatibility/tests之前另跑pnpm api:setup安装固定原生oasdiff。多语言backend示例只是接入参考。

## Workspace与解析边界

pnpm globs为apps/*、libs/*、libs/desktop/*（嵌套UI库需要第三glob），当前两app=desktop/cli、十八库。workspace-layout 已记录 contracts/features/shared tools/acceptance 提取边界，agent 已合并，cli 是 type:app/scope:cli。

settings在pnpm-workspace.yaml：hoisted linker服务Forge flora-colossus，blockExoticSubdeps=false允许installer的git依赖；allowBuilds白名单允许Electron/Nx/SWC等生命周期，Pi1.5.2 quarantine豁免按精确版本。hoisting会掩盖未声明依赖，必须importer manifest runtime依赖+workspace:*，root仅dev tooling，dependency-checks双向检查。

exports先列@evidence-poc/source，tsconfig customConditions与bundler/Vitest resolve一致；遗漏退dist。desktop main/preload为Node，renderer/browser与SSR条件分开，main rolldownOptions.platform=node保import.meta.url/createRequire，preload固定preload.js防入口index.js错名。model-core Vitest现在显式source/node/import/default，schema/agent/mcp配置仍可能依赖^build，不可笼统声称全体相同。

## Nx与三重架构守卫

Nx plugins从tsconfig/eslint/Vite/Vitest推build/typecheck/lint/test及per-file test-ci；test默认^build，sharedGlobals纳入tools/eslint防缓存漏失效，production排tests/config。desktop手写Forge targets，cli手写tsc build依^build且test依build；不要覆盖inferred target丢per-file能力。

1. source condition保证读取当前src而非旧dist。
2. enforce-module-boundaries以type/layer/platform/surface/scope约束：lib不import app，universal只universal，browser只browser/universal/browser-safe；api 不可反依 acceptance，shared tools 不依 SDK adapter，agent 不依 mcp，evidence不依desktop/testing。
3. browser-platform ESLint额外拒node:* /fs/path等和Node包root，只允许api/delivery、acceptance/projection、agent/browser 纯表面；新browser项目须导入规则，只有tag不够。core purity bundle也防Node泄漏。

boundaries:drill临时植入domain→projection、browser→Node projection、browser→builtin、agent→mcp，加上 API→acceptance、browser→acceptance runtime、tools→SDK adapter，共七种禁止 import，uncached lint必须以期望消息失败，finally清probe；它证明约束存在，而非只证明合法代码过lint。生成wiki期间不运行会临时改源码的drill。

## 固定oasdiff的安装/运行

api:setup由tools/oasdiff/setup.mjs下载1.38.0的已知平台tar.gz，校验固定sha256，解压binary+LICENSE、设执行权限并核对--version，临时目录原子rename；匹配缓存直接复用，finally清临时。cache在node_modules/.cache/evidence/oasdiff/版本/平台，删除node_modules需重装与setup，无postinstall隐式下载。

runner优先显式binary/EVIDENCE_OASDIFF_BIN，再以**已安装包位置**上溯cache，再PATH，不依caller model cwd。compare不下载，失败闭合，保留stdout/stderr；固定--version、空隔离config、禁external refs、execFile无shell、超时与buffer上限。setup网络失败不能改成自制比较器掩盖。

## Desktop 与 Forge

旧 evidence-visualization/workbench 资源及 prepare-resources 已删除；桌面使用原生 canvas、story、diagnostics 与 delivery features。

build 直接 electron-forge package，输出.vite/out，不等全部lib build因Vite读src；package是依build的noop alias；make依build运行Forge make写out/make；start=Forge start，typecheck先^build再app/spec两tsc。

Forge asar=true，不再带 workbench extraResource；Vite分别main/preload/main_window。APPLE_ID存在才sign/notarize，无凭据可本地打包；makers为Windows Squirrel、mac ZIP、LinuxRPM/DEB。无skill tree/virtualenv，项目不会覆盖随包指令。

## 根命令与CI

pnpm build/test/lint为nx run-many；graph、boundaries:drill、desktop/package/make/test:desktop是薄wrapper。pnpm evidence、model:pack/unpack/inspect、api:export/diff均走apps/cli/dist/cli.js，先nx build cli。旧 model/api bin只是stderr弃用shim，共享库commands，不反向import app。没有根typecheck script，直接nx run-many -t typecheck。

CI(main push/PR、Node22、frozen lock)：install → api:setup → example:setup → example:test → drill → PR affected lint或push全量 → 全typecheck/tests → build cli并help/version → build desktop smoke。桌面release tag v*.*.* /manual，mac arm64/x64、win x64、linux x64矩阵，Linux装rpm/fakeroot/dpkg，Forge make后收zip/exe/nupkg/RELEASES/deb/rpm，Apple secrets可选。

## OpenWiki维护是可恢复流程

.github/workflows/openwiki-update.yml 当前仅手动 workflow_dispatch，定时更新已暂停，全历史checkout供base diff；独立npm安装OpenWiki0.9.0（可选mermaid/jsdom），DeepSeek的OpenAI-compatible endpoint/flash模型，运行openwiki code --update --print。不是pnpm依赖，也不是源修改后本地自动hook。

workflow对生成步骤continue-on-error，非取消时清transient .run.json并以openwiki、AGENTS、workflow及存在的CLAUDE建PR；即使失败也保存已完成页面，再最后传播失败，让下一次按页面baseline继续。上次.last-update的interrupted说明尚有未复核债务，不是完整更新证明。不要手改claims/index/log/provenance；host lifecycle顺序begin→plan→逐页read/research/write/submit→next complete→finish，以finish complete为完成依据。

## 常见排错

missing module先查source条件/是否build；CLI dist不存在先build cli；native diff缺失先api:setup或匹配EVIDENCE_OASDIFF_BIN；main import.meta.url错误查Node平台；hoisted下漏依赖靠lint非installer；OpenWiki只更新一部分查看interrupted和队列，不直接重置账本。

相关：[架构](../architecture/overview.md) · [桌面](../desktop/app-shell.md) · [测试](../testing/verification-strategy.md)
