# API 测试夹具

本目录保存 API 回归与可移植性测试使用的合成输入，只由 `tests/` 消费，不进入提示词，也不是项目事实、业务默认值或编辑授权。

| 夹具                                     | 用途                                             |
| ---------------------------------------- | ------------------------------------------------ |
| [full-lifecycle/](full-lifecycle/README.md) | 商品采购完整链路：FM 模型源、`api.json` 设计源与 OpenAPI 快照 |
| [subscription-api.json](subscription-api.json) | 订阅付款的最小 API 设计样例                      |
| [source.md](source.md)                   | 合成业务来源说明                                 |

夹具中的金额、身份、角色、协议与路由选择只属于该夹具。反例只在临时副本制造，不覆盖来源预期；整体链路描述与维护要求见 `full-lifecycle/README.md`。
