# 前端工程指南

## 当前边界

[App](../../apps/frontend/src/app/app.tsx)是用户 API 导航页，采用 React、TypeScript、React Router 和 CSS Modules。它不是订阅流程或用户管理表单已完成的证据。具体依赖以 [package.json](../../package.json)为准，不替换现有框架。

## 实现约束

- 以当前故事和 API 消费者流程确定页面行为；没有业务需求不自动增加表单、状态库、路由体系或国际化框架。
- 组件负责呈现与交互，复杂逻辑按实际责任拆分。避免把业务授权仅写成按钮可见性。
- 导航与写操作消费已有 API 契约和超媒体关系；不把本地 `/api/users` 套用到正式订阅接口，也不把生成 OpenAPI 当已上线服务。
- 表单保留语义标签与可访问名称，显式呈现 loading、empty、error 和提交状态；避免重复提交，幂等仍由服务契约保证。
- 用户输入作为文本渲染，不注入不可信 HTML；不将 token、私人数据或服务凭据写入 URL、日志和前端构建产物。
- 中英文术语是命名约束，不意味着已经确定多语言产品需求。金额、日期、时区展示须有约定，不自行转换业务时间。

## 验证

使用现有 Vitest、jsdom、Testing Library，围绕可观察行为断言：用户能看到/操作什么、请求失败如何呈现、导航指向哪里。只 mock 外部依赖边界，不 mock 被测组件以取得通过。

当前 [App 测试](../../apps/frontend/src/app/app.spec.tsx)只能证明导航页；真实浏览器、网络代理与后端联调需按 [浏览器 howto](../howtos/browser-debugging.md)检查。前端测试不能证明后端授权、业务规则或数据库。

```bash
# 仓库根
npx nx test @evidence-poc/frontend
npm run lint
```

涉及消费者行为时增加相应正常、空、异常与资格变化后的场景，再执行 [项目质量检查](testing.md)。
