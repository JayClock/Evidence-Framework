# FM 测试夹具

本目录保存 FM Skill 的合成测试数据，只服务 `tests/` 的结构、语言、模拟与可移植性回归；不进入提示词，不是业务默认值，也不是项目 `.evidence/fm/` 的事实来源。

## 可运行模型

| 夹具                                                              | 覆盖的表达                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| [valid-traceable-subscription](models/valid-traceable-subscription/README.md) | 双向主要履约切片、请求—确认、派生规则与正常／逾期场景 |
| [domain](models/domain/README.md)                                 | 无合同的领域身份、属性与行为条件                        |

`valid-subscription`、`valid-content-platform`、`valid-roleized-payment`、`valid-roleized-payment-core` 与 `invalid-missing-confirmation` 是针对具体规则、上下文和负例的小型回归模型。

## 表达说明

| 夹具                                                        | 覆盖的判断                                        |
| ----------------------------------------------------------- | ------------------------------------------------- |
| [领域语言](expressions/domain-language.md)                  | 别名输入、同名异义、只读与缺词边界                |
| [结构对照](expressions/structural-contrasts.md)             | 单端先存、配对包裹及 Context、Evidence、Role 归属 |
| [合同级建模](expressions/contract-batch.md)                 | Context Role 无玩家边界、必要证明与后续接入       |

## 维护

测试需要修改模型时，先复制到临时工作目录；不要直接修改本目录中的业务预期。完整 JSON 必须通过对应 Schema 校验，Rule 的 `description` 仍为必填；代码片段不能冒充完整源对象。表达方法与规则只在 `references/` 维护，夹具不承担日常表达引导。整体采购 API 链路夹具由 `evidence-api` 的 tests 维护。
