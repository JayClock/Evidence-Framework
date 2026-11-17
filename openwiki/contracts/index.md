# 文件

- [API 契约投影与 OpenAPI](api-projection.md) - FM 模型加可选 overlay 如何投影为 routes、hypermedia、services、OpenAPI 3.1 与部署草图，诊断和 digest 如何组成可追溯证据链，以及本库为何不执行验收、只发布确定性契约产物。
- [交付拓扑、字段契约与契约演进比较](delivery-routes-and-diff.md) - 交付预览由服务与跨边界链接、路由、字段来源、限制和摘要组成；桌面 live 与 saved 路径各自绑定自己的投影摘要，契约演进则由 evidence-acceptance 的原生 oasdiff 比较最终 OpenAPI，并以退出码区分兼容、破坏与输入或工具失败。
