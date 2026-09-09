# Context 增量评估与发布协议

本协议只用于人工选择 `update-model` 后的发现评估，不是另一份 FM、业务来源或批准记录。问答期间仍只追加发现。发布后停回发现，人工另选 `converge` 才进入需求收敛。

## 评估的单位

Context 组织业务知识，但不是不可拆分的完整包。声明**本批次职责**，评估职责所需的具体事实；其余知识保留在 `remainingScope` 和未知事实中。不能为了产出缩掉本职责真正需要的输入，也不能要求相关 Context 的全部生命周期或责任链先完成。

| Context     | 本批次最低评估维度                                                                   | 回放重点                                                           |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Domain      | identity、structure；涉及的资格、约束、计算等 rule 加入必需事实                      | 身份与相关规则的正常、边界、反例；不冒充单据模拟                   |
| Channel     | identity、parties、evidence、validity；当前职责实际涉及的 response/rule 加入必需事实 | 已发生的邀请、报价、回应及版本/有效性；没有 RFP 或合同不补造       |
| Contract    | identity、parties、agreement                                                         | 已存在的协议、双方及相关约定；签约渠道和其他义务可未展开           |
| Fulfillment | identity、parties、request、deadline、confirmation、rule                             | 请求要求、期限依据、确认凭证、结果判断；后续赔偿不自动成为前置条件 |

最低维度是 Agent 的分析责任，不是逐字段问卷；未知维度仍应声明为 unknown。关键事实的 sourceRefs 须指向 INPUT、有效 SRC-_ 或最新 answered A-_，不能以 D-ID、自评或模型文件自证。

## `assessment` v1

每次 `evidence_finalize_discovery` 必须提交当前 `expectedRevision` 和完整 `assessment`：

- `version: 1`。
- `applicability: { applicable, rationale, sourceRefs }`。只有无独立候选的简单胶水可以 false，并且不能有未解决阻塞题；空 Context 不能规避真实业务。
- `contexts` 覆盖全部有效历史候选；每个候选只归属一个 Context。合同与履约 Context 分别使用已保存的合同／履约 C-ID，角色归所属合同。
- 每个 Context：`contextRef`、`kind`、`responsibility`、`sourceRefs`、`candidateRefs`、`remainingScope`、`facts`、`requiredFactRefs`、`dependencies`、`caseRefs`。
- 每个事实：`key`（稳定小写 snake_case）、`candidateRef`（该事实所属候选）、`dimension`、`statement`、`status: known | unknown`、`sourceRefs`。引用格式为 **`C-context.key`**，如 `C-001.order_amount`；候选整体为 unknown 不否定其中有依据的已知事实。
- `requiredFactRefs` 只列本 Context 本批次职责不可缺少的本地事实。每个最低维度至少评估一个必需事实；业务上涉及的其他事实也必须列入，不因程序无法读懂业务就省略。
- 每条依赖：`consumerFactRef`、`providerFactRef`、`kind: structure | provenance | decision`、`purpose`、`sourceRefs`。consumer 属于当前 Context，provider 可以跨 Context；必须指向具体事实，说明依赖用途，不写整个 C-ID。
  - structure：表达该事实必须存在的身份／归属结构，不等于关联 Context 的全部知识。
  - provenance：真实业务来源及适用版本；例如订单金额是否确实取自某报价版本。
  - decision：当前业务判断实际消费的值或规则。
- **每个履约 request 显式依赖父合同的相关 agreement 事实与 parties 事实**，不能把同属 agreement 维度的全部条款自动作为依赖。程序校验真实父子关系、双方身份以及发现中仍未明确的请求、期限、确认缺口；不自动依赖签约渠道、兄弟义务或完整前序履约。
- 每个可独立纳入 Context 的 `caseRefs` 覆盖正常、边界、异常；来源明确，不适用须有业务理由，未知不是不适用。支撑投影不冒充完整职责或独立回放通过。
- `questions` 精确覆盖全部未解决阻塞题：`questionId`、`affectedFactRefs`（具体事实数组，真正全局阻塞才为 null）、`reasoning`、`sourceRefs`。评估不关闭 Q-ID、不写 A-ID、不替代已有人工决定。

程序输出：

- `ready`：本批次职责的必需事实及其依赖齐备；不是“整个 Context 已完成”。
- `support`：只纳入被 ready Context 消费的已知事实及必要身份；其自身职责未完成。
- `pending`：本批次不纳入，保留事实和缺口；不是已排除范围。
- `includedFactRefs`、每个 Context 的纳入／缺失事实，以及事实级阻塞理由和依赖路径。候选级纳入列表仅作导航，不是候选整体完整声明。

仅事实依赖闭包纳入正式模型，不能把 support Context 的其他未知事实带入。无可纳入职责时保存评估并报告阻塞，保留上一版 FM。

### 判别示例（不提供当前业务事实）

- 已确定的订单金额可直接被付款规则引用，无须先发现全部报价渠道。
- 若该金额实际上依赖尚未确定的适用报价版本，则沿具体事实路径阻塞付款；不能用一个已知报价名称替代版本依据。
- Domain 的身份和金额结构已经明确，而无关的归档规则未知，可先表达相关结构；规则职责暂留待完善。
- Channel 已有真实 Proposal，可表达其双方、凭证与有效性；后续回应未知，不应制造 RFP 或假定合同一定成立。
- 合同内阅读权益尚未展开，不自动阻塞已知付款请求。超时处理仍按已有人工条件；部分收款后续处理未知时保留原题，不能借课程示例改为“自动取消且无额外责任”。

## FM 发布覆盖 v1

适用 FM 的每批次必须提交 `discovery/formalization.md`，包含**唯一** `discovery-coverage` JSON 块。下例仅说明结构，全部 ID、事实键、状态及剩余职责须使用本批次实际评估结果：

```json
{
  "version": 1,
  "kind": "discovery-coverage",
  "revision": 5,
  "contexts": [
    {
      "contextRef": "C-001",
      "status": "ready",
      "modelRefs": ["context.example"],
      "retainedFactRefs": ["C-001.archiving"],
      "remainingScope": "归档规则尚未明确。"
    }
  ],
  "facts": [
    { "factRef": "C-001.identity", "modelRefs": ["context.example"] },
    { "factRef": "C-001.structure", "modelRefs": ["thing.example"] }
  ]
}
```

`contexts` 包含全部评估 Context（包括 pending），status 与评估一致；pending 的 modelRefs 必须为空，其他 Context 至少映射一个同 kind 的实际 FM Context。`retainedFactRefs` 精确列出该 Context 本批次未纳入的全部事实，`remainingScope` 与评估原文一致。`facts` 精确覆盖全部 includedFactRefs，不得把待完善事实映射为正式事实。

发布前核对暂存编译结果中的 ID、Context 类型和纳入／保留覆盖。Markdown 同时说明本批次相对上一版的新增、修订、撤回及保留依据。模型仍须通过 FM Schema／lineage／适用模拟，不为纳入一部分而伪造必填业务属性。

程序不能证明 statement 被 sourceRefs 蕴含、业务必需项没有漏评、映射语义正确或场景预期完备。**发现充分、模型可发布、机器验证通过、人工批准是四个独立结论。** 审核者仍须核对真实业务来源及模型语义。

## 无兼容路径

发现日志仅支持 v5，评估和发布覆盖仅支持上述 v1 协议。拒绝旧日志、缺 assessment、候选 complete/dependencyRefs 协议、候选级 coverage 以及旧 finalizing 自动进入需求的路径；不迁移、不自动转换、不重置现有数据。旧运行由人工决定归档或重新初始化，不能手改版本号。
