# 通用命名与工程词汇

## 命名

- 业务含义与稳定源 ID 引用 [正式术语](../../.evidence/fm/01-glossary.md)；实体/属性的代码、API 和 SQL 映射见 [领域映射](../architecture/domain-mapping.md)。不另造同义业务词典。
- Java 类型使用 PascalCase，方法/字段 camelCase，包名小写；沿用 `com.evidencepoc.backend`。SQL 表/列沿用 snake_case，迁移沿用 Flyway `V<版本>__<描述>.sql`。
- React 组件、类型使用 PascalCase；函数、变量、Hooks 使用 camelCase，Hooks 以 use 开头。文件组织沿用现有组件及 `.module.css` 约定，不批量更名无关文件。
- API 路由、关系名、参数和字段以已有契约为准，不为统一代码风格擅自更名。
- 用业务行为命名实体方法和任务文件；不以 Manager、Processor、common 等宽泛名称掩盖责任。
- taskKey、源 ID、CHECK ID、用户故事 ID 各有自己的身份规则。文件名不决定执行顺序；改显示名称不制造新任务。

## 通用中英文

| 中文       | 英文                | 工程用法                                           |
| ---------- | ------------------- | -------------------------------------------------- |
| 前馈指南   | Guides              | 行动前的来源、边界、做法与验收，不是执行证据       |
| 反馈检查   | Sensors             | 编译、测试、静态分析、真实 HTTP/SQL 和必要人工观察 |
| 纠偏       | Steer               | 将问题送到代码、任务、计划或业务来源层             |
| 组合根     | Composition Root    | 装配运行依赖，不拥有业务编排                       |
| 业务模块   | Business Module     | 行为、数据和公开契约的边界                         |
| 技术库     | Technical Library   | domain/api/persistent 等构建职责                   |
| 部署单元   | Deployment Unit     | 统一发布的后端应用，不等于每个库                   |
| 描述值     | Description         | 无独立身份的不可变属性集合                         |
| 根集合     | Root Collection     | 有业务依据的定位及生命周期入口                     |
| 公开契约   | Public Contract     | 允许其他模块消费的窄能力                           |
| 失败不变性 | Failure Invariance  | 拒绝/失败后不应变化的数据与事实仍不变              |
| 完成条件   | Completion Criteria | 预期要求；不能替代 observedEvidence                |

业务英文翻译需要与源语义核对；同一个 User 在不同上下文扮演角色不代表多个主体。技术词不能代替业务拥有者。

## 变更约束

只修改获授权范围；保留无关工作树改动。新规范应连接实际检查：Java 格式由 Spotless，前端由 ESLint，文档由 Prettier 与 Guides 检查，语义边界由相应测试和审查。不得以格式化为由批量覆盖未授权文件。
