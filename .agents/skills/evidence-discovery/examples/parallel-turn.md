# 多来源一轮：共同依据先问，独立分支并行

以下是连续三轮的合成样例。业务名称、责任角色和依赖关系均为样例给定，不是当前项目事实。每轮仍只聚焦一项凭证，不把来源查清写成履约完成。

## 1. 共同版本影响两项数据，另一条来源独立

### 输入与判断

采购合同（Purchase Contract）的付款（Payment）义务已明确。当前凭证为付款请求（Payment Request），责任角色是买方（Buyer），实际主体未知。应付金额（Payable Amount）及付款期限（Payment Deadline）都由已接受报价（Accepted Quote）的同一适用版本决定，该版本尚未定位；在版本明确前不能问具体计算口径。收款账户（Payee Account）依据另一项独立的收款约定（Payee Terms），不会随报价版本改变，其约定未知。用户授权只聊并继续。

### 期望展示

```text
当前位置：采购合同（Purchase Contract）→ 付款（Payment）→ 付款请求（Payment Request）〔履约请求〕
责任人：买方（Buyer）；实际主体待明确。

业务目标：作为买方（Buyer），我希望按适用约定履行付款（Payment）义务，以取得约定商品。

应付金额（Payable Amount）与付款期限（Payment Deadline）都追到了已接受报价（Accepted Quote），但还未定位本次适用版本；同一个版本依据会决定两条来源链如何继续。收款账户（Payee Account）来自独立的收款约定（Payee Terms），可以另行追溯。

Q1：本次适用哪个已接受报价（Accepted Quote）版本？
Q2：收款账户（Payee Account）依据哪项收款约定（Payee Terms）确定？
```

### 检查

共同前提只问一次，不拆成金额版本与期限版本两题；两项具体规则留到共同版本明确后重算。Q2 与共同版本无依赖，故可同轮提出。不询问谁填写数据，不把收款方或报价提供方改成当前凭证责任人。

## 2. 只回答共同前提，立即推进两条来源链

### 输入与判断

用户说：“Q1 用双方接受的第二版，文件已给你，金额条款和期限条款独立。Q2 不知道，请继续。”读取该版本后发现两项条款各指向一个尚未明确的补充约定，彼此独立。版本不重问，Q2 保留原问题与未决依据；本轮只选择已经暴露的两个必要缺口，不要求补齐整组答案。

### 期望展示

```text
当前位置：采购合同（Purchase Contract）→ 付款（Payment）→ 付款请求（Payment Request）〔履约请求〕
责任人：买方（Buyer）；实际主体待明确。

已接受报价（Accepted Quote）的适用版本已定位。应付金额（Payable Amount）和付款期限（Payment Deadline）现在分别追到该版本引用的两个独立补充约定；共同版本不再是缺口。收款账户（Payee Account）的原问题 Q2 仍未解决，本轮不重问。

Q3：应付金额（Payable Amount）适用哪个补充约定？
Q4：付款期限（Payment Deadline）适用哪个补充约定？
```

### 检查

不等待整组答完，不重问 Q1，也不把 Q2 的不知道视为同意。目标未变化，不重复用户故事。新题使用新标识，不改写原 Q2 来绕过未决状态；已提供可查材料先读，不反问材料已有答案。

## 3. 单项暂缓不封锁其他分支

### 输入与判断

用户明确暂缓 Q2 和 Q4，只允许继续 Q3。已给金额约定明确应付金额（Payable Amount）按交付数量（Delivered Quantity）确定，但没有明确哪项凭证证明该数量。先读取可查材料，确有此缺口才提出必要前提。

### 期望展示

```text
当前位置：采购合同（Purchase Contract）→ 付款（Payment）→ 付款请求（Payment Request）〔履约请求〕
责任人：买方（Buyer）；实际主体待明确。

应付金额（Payable Amount）的来源已追到以交付数量（Delivered Quantity）为依据的补充约定，下一步是找到数量的完成证明。收款账户（Payee Account）的 Q2 和付款期限（Payment Deadline）的 Q4 继续暂缓，不影响获准继续的金额分支；这些依据尚不表示付款（Payment）已经完成。

Q5：哪项凭证证明本次交付数量（Delivered Quantity）？
```

### 检查

Q2 与 Q4 的标识和依赖保留，不用新编号恢复暂缓题。整轮停止或术语写入失败仍立即停止；这里只聊，不创建词汇或访谈状态文件，不生成 FM/API。
