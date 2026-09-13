# 故事与验收入口

## 业务故事

[软件范围](scope.md)中的 SCOPE-MVP 尚未确定；本页不为未确认范围生成已批准 US/AC。已有 [FM 场景](../../.evidence/fm/00-overview.md)是业务来源，不能直接冒充软件验收通过。

获授权收敛故事时使用 [requirements Skill](../../.agents/skills/evidence-requirements/SKILL.md)，每项明确：

- 稳定故事与验收 ID；修改不重编号、不复用已废弃 ID。
- 参与者、目标、价值，以及软件执行/判断/接收结果/辅助人工的责任。
- Given / When / Then、具体输入和可观察结果，覆盖适用边界与失败不变性。
- 业务源 ID、规则/场景、API 能力、质量要求及必要外部责任。
- 确认状态与未决项；不能从代码输出反推业务预期。

## 本地切片的实现核对入口

以下是源码/现有切片说明可核对的工程行为，不是新授予的产品范围或业务批准：

| 行为                              | 核对位置                                                                                                              | 验证边界                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 用户资料创建、读取、修改、删除    | [切片契约](../../apps/backend/README.md)                                                                              | local/test profile，不含认证或合同权限 |
| 显示名称合法性、身份不变          | [领域测试](../../libs/backend/domain/src/test/java/com/evidencepoc/backend/domain/UserTests.java)                     | 纯领域规则，不证明 SQL/HTTP            |
| HTTP 输入、导航、错误及失败不写入 | [API 测试目录](../../libs/backend/api/src/test/java/com/evidencepoc/backend/api/)                                     | 真实 HTTP + mock 领域，不证明真实事务  |
| 持久化、分页、行数及回滚          | [MyBatis 测试](../../libs/backend/persistent/src/test/java/com/evidencepoc/backend/persistent/MyBatisUsersTests.java) | H2，不证明生产方言                     |
| 真实装配与 HTTP + SQL             | [应用测试目录](../../apps/backend/src/test/java/com/evidencepoc/backend/)                                             | 当前测试配置，不证明生产授权           |

复用前执行 [测试指南](../engineering/testing.md)中的相关命令。测试文件存在不表示本次已经通过；实际结果由任务证据或获授权检查记录保存。
