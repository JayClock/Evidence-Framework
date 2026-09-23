# 领域语言的单一拥有者

领域语言在访谈中持续沉淀，不等待所有问题解决。同一概念只维护一份名称与含义：已建模概念归 FM 对象，未建模概念和无独立模型对象的术语归 Glossary。此方法由 FM 维护；提问与控制状态由访谈任务维护。

## 存储与权威

`.evidence/glossary.json` 是统一术语入口，位于 FM 类型根之外，使用 [glossary.schema.json](../schemas/glossary.schema.json) 定义的严格 JSON。用户指定其他 JSON 路径时沿用该位置；不创建 Markdown 词典、CONTEXT.md 或双格式副本。

两种条目互斥：

- `kind: standalone`：尚无对应 FM 对象的明确概念，或通用术语。必填 `id/name/definition/sourceRefs`，可选 `context/aliases/distinctions`。未决解释仍留在发现记录，不把 Agent 建议当定论。
- `kind: model`：已建模概念。必填 `id/target`，可选别名 `aliases` 和映射依据 `sourceRefs`；不得保存 `name/definition/context/distinctions`，也不以任意附加字段补写独立含义。名称、含义与上下文从当前 FM 目标解析。

`target.objectRef` 使用 Entity、Relationship 或 Rule 的稳定 ID；Entity 属性再以 `target.attribute` 指定属性名，不使用文件路径或数组下标。对象搬家不改变引用；属性改名需按授权修复引用。规范名称取 `label`，Entity／Relationship 的业务含义取 `notes`，Rule 取 `description`，属性取 `meaning`。目标缺少业务说明时报告缺口，不用名称充当定义，也不在 Glossary 中补一份。

`term.*` 是词汇入口的稳定身份，不是 Entity ID。一个目标只有一个词汇条目，多个叫法放入 `aliases`；不为术语编造 Entity ID、角色、期限或权限。相同名字在不同业务上下文可以有不同含义，不能按名称自动合并业务身份。

## 每轮访谈

1. 读取本轮来源、词汇表及其引用的当前 FM 对象，先核对含义由谁维护。用户明确表达的事实直接复用，用户沉默不等于同意提议。
2. 澄清模糊词、同名异义及概念边界。可以用标明为假设的具体案例检验理解，不把合成案例当成事实。
3. 来源记录先保存原话和更正依据，再当轮维护词汇入口：未建模概念写 standalone，已建模概念写 model 引用，后续对话通过引用读取当前定义。
4. 已建模概念的更正属于 FM 修改。仅有访谈授权时，只保存更正原话、目标定位及待改影响，不改 FM，不建立同义 standalone 或在引用条目里覆盖定义。获模型编辑授权后才更新目标，保留来源与未受影响事实。
5. 已有来源冲突先指出具体差异，未澄清不任选其一覆盖；当前代码只证明实现行为，不能裁决业务含义。保存本轮结果后再继续访谈，一次只问一个必要问题。

“访谈并沉淀领域语言”只授权发现记录、standalone 条目和已有 FM 的引用索引，不授权修改模型 JSON、关系、规则、场景、API 或实现。只聊不落盘、仅保存资料、只记录冲突和只读校验等更窄要求优先。文本沉淀不要求安装 Python，也不能声称整个 FM 已通过校验。

## 从术语落实为模型

明确的模型生成／修改请求可包含相应词汇条目的归位：

1. 核对 standalone 的来源、上下文和已有 FM，判断是新概念还是已有对象；不是每个词都要创建 Entity。
2. 在获授权 FM 目标中完整落实名称与业务含义，保留源依据、已有补充说明及稳定对象 ID；关系或规则仍须有独立业务依据。
3. 保留原 `term.*`，将条目替换为 model 引用并移除其名称、定义、上下文与区别正文；必要的原叫法保留为别名。名称、含义归 FM 唯一维护。
4. 检查新引用并执行适用 FM 校验。FM 目标变化后，重新解析自动得到当前名称与含义，不反向回写 Glossary。目标删除或属性改名导致悬空时明确失败，不从历史定义兜底。

多文件更新不宣称原子事务。任一保存失败就停止，分别交接发现记录、词汇表及获授权 FM 文件的实际保存结果；恢复先核对内容，再补齐缺失写入，不能把部分归位当完成或继续追问。

## JSON 契约与读取

根对象为 `schemaVersion: "2.0"` 和 `terms` 数组。UTF-8、两空格缩进、末尾单个换行；拒绝注释、尾随逗号、重复键、非对象根、多文档及 NaN／Infinity。来源定位可以指向文件、回答或完整提交标识下的历史材料，引用原文不表示又维护一份现行定义。

以下为合成格式示例，引用目标须在实际项目存在：

```json
{
  "schemaVersion": "2.0",
  "terms": [
    {
      "id": "term.receipt",
      "kind": "model",
      "target": { "objectRef": "confirmation.receipt" }
    },
    {
      "id": "term.business-day",
      "kind": "standalone",
      "name": "业务日",
      "definition": "双方约定的业务统计日，不等同于自然日。",
      "sourceRefs": ["材料路径#回答定位"]
    }
  ]
}
```

通过只读检查器解析当前词汇入口：

```bash
"$PYTHON" "$FM_SKILL_DIR/scripts/check_glossary.py" "$PROJECT_ROOT/.evidence/glossary.json" --fm "$PROJECT_ROOT/.evidence/fm"
```

默认探测词汇表同级 `fm/`；纯 standalone 且尚无 FM 时可独立校验，存在 model 引用则必须提供有效 FM。检查器需要 Python 3.10+ 和本包 jsonschema 依赖，检查严格 JSON、互斥结构、重复 ID／目标、悬空对象／属性及目标说明。它还拒绝与同上下文 FM 规范名称重复的 standalone，但名称匹配不能证明全部概念已经去重，别名和跨上下文身份仍须按来源判断。

`resolvedTerms` 是本次只读解析结果，不是第二份可编辑词典；失败不返回可用结果。`glossaryDigest` 和 `fmSourceDigest` 分别绑定输入，输入改变使结果失效。`referenceValidated` 表示对所读 FM 类型源的结构与引用检查，未读取 FM 时为 null；不等于整套 FM 的规则／场景通过，也不证明来源充分或业务批准。

## 交接

只列增改的 `term.*`、定义拥有者、来源、更正影响及各文件保存结果。standalone 的定义正文在词汇表，model 的定义正文在 FM；发现记录和审核页只引用或投影，不另存可编辑副本。停止不扩大权限，历史来源与未决更正不删除。
