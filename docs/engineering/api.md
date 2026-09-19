# API 实现指南

## 契约来源

- 正式业务能力、角色变体、请求/响应、幂等与消费流程来自 [api.json](../../.evidence/api/api.json)。生成 OpenAPI 是投影，不手改为另一份接口事实。
- 本地用户基础接口来自 [切片契约](../../apps/backend/README.md)，与正式业务 API 的来源及范围分开；不得据此添加生产注册、登录或任意主体 CRUD。
- 契约与框架实际行为不一致时记录具体差异并返回 API/设计拥有者，不在实现中静默改路由、错误码、字段或分页语义。

## 导航与表示

采用 Root API → 根集合 API → 绑定实体的子资源。手工构造子资源使用 ResourceContext 完成上下文注入；子资源持有已定位实体及必要契约，不编排多个 Mapper。

Resource 解析输入、调用领域、映射错误；表示层维护链接和操作，URI 通过 ApiTemplates 按资源类/方法生成，不散落字符串拼接。身份验证与权限必须在实际操作点成立，隐藏 HAL 链接不是授权。

复用 smart-domain `Pagination`，默认直接返回结果，不另造分页算法、Page DTO、独立集合包装或只有链接辅助方法的表示基类。当前 0.3.0 的绝对 URI 回调、零基页号、整页末尾、空集合和 HAL-FORMS 默认模板约束见 [框架规范](../../.agents/skills/evidence-task-planning/references/backend-layout.md)。接口层校验页大小与整数溢出，不能只依赖组件。

HTTP 请求可使用独立可写 Bean 支持 HAL-FORMS 元数据，领域 Description 保持不可变。严格校验类型、未知字段、非法 JSON；结果存在、HTTP 成功、业务按时完成和当前访问资格分别判断。

## 测试边界

| 层         | 必须真实执行                                         | 可替代边界                                    |
| ---------- | ---------------------------------------------------- | --------------------------------------------- |
| api        | 随机端口 HTTP、Jersey、序列化、分页、链接、HAL-FORMS | mock 领域根集合；不依赖 app/persistent/数据库 |
| domain     | 规则、角色/实例匹配、业务时间与失败不变性            | 合理的领域 Fake，说明限制                     |
| persistent | SQL/XML、迁移、写后重读、回滚与适用并发              | 本地 H2 不冒充生产方言                        |
| app        | 真实 HTTP + SQL、严格配置、资源隔离和装配            | 不用 API mock 测试代替                        |

覆盖正常/拒绝调用、缺失成员、非法输入、空集合、可跟随链接、Location/self 一致、媒体类型和可编辑操作。客户端端口按请求配置，避免全局静态状态干扰并行测试。

```bash
# 仓库根；API 模块不需要数据库
./gradlew :backend-api:test
```

此命令不证明生产授权或持久化成功。真实范例及完整质量检查见 [范例](examples.md)、[测试](testing.md)。
