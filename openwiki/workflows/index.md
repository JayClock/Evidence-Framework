# 文件

- [统一 CLI 与治理门禁](cli-governance.md) - evidence 单一入口如何注册并路由 check/story/test/export/diff 与模型、旧 api 子命令，如何严格校验参数与退出码并保持 JSON stdout 干净，以及只读 verify、oasdiff 契约 gate 与 regression/DoD 验收各自把关的边界。
- [验收套件生成、HTTP 执行与漂移检查](http-acceptance.md) - evidence-acceptance 如何把内联 examples[].test 编译成逐字节稳定的 Step CI/Hurl 套件、用官方 Step CI runner 在进程内执行并归一化断言与漂移，以及 regression/DoD gate 如何按可执行语义选流。
- [七步共创工作坊](modeling-workshop.md) - 业务提问驱动的建模序列：共享词表 WORKSHOP_STEPS 与无合同逆推模式如何被 schema、提示词、桌面 pills 与 Agent 同读，inspectWorkshop 如何从结构事实推导 ready/missing/review，以及 anchorWorkshopContract 与 addWorkshopFulfillment 如何在一次 session.mutate 里原子建出上下文、双方角色、合约与履约对。
