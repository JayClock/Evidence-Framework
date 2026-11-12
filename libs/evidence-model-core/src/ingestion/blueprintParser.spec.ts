import { parseBlueprint, inferEvidenceKind } from './blueprintParser.js';

const BLUEPRINT = `| 阶段 | 客户旅程 / 前台活动 | 业务凭证 | 凭证类型 | 当事人 | 标的物 | 支撑系统 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 合约前阶段 | 提交采购意向 | 商品询价单 | rfp | 甲方采购员 | 采购物资 | 采购门户 |
| 合约前阶段 | 提供商品报价 | 商品报价单 | proposal | 乙方销售 | 采购物资 | CRM系统 |
| 合约确立 | 签署采购协议 | 采购框架合同 | contract | 甲方代表, 乙方代表 | 采购物资 | 电子签章系统 |
| 履约交付 | 提交付款申请 | 支付申请单 | request | 甲方财务 | 采购货款 | 资金管理系统 |
| 履约交付 | 确认款项到账 | 支付确认单 | confirmation | 乙方财务 | 采购货款 | 网银互联 |
| 履约交付 | 提供转账凭据 | 银行回单 | evidence | 甲方财务 | 采购货款 | 银行接口 |`;

describe('reading the service-blueprint variant', () => {
  it('splits the pre-contract context from the contract context at the contract row', () => {
    const result = parseBlueprint(BLUEPRINT, { modelName: '采购蓝图' });

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    const contract = result.draft.evidences.find(
      (evidence) => evidence.kind === 'contract',
    );
    const rfp = result.draft.evidences.find(
      (evidence) => evidence.kind === 'rfp',
    );
    const request = result.draft.evidences.find(
      (evidence) => evidence.kind === 'fulfillment_request',
    );

    expect(contract?.contextRef).not.toBe(rfp?.contextRef);
    expect(request?.contextRef).toBe(contract?.contextRef);

    const preContract = result.draft.contexts.find(
      (context) => context.kind === 'pre_contract',
    );

    // The sourcing context has to name the contract it sourced, otherwise the
    // two contexts cannot be told apart later.
    expect(preContract?.parentContextRef).toBe(contract?.contextRef);
  });

  it('pairs a confirmation with the request it answers', () => {
    const result = parseBlueprint(BLUEPRINT);

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.draft.fulfillmentPairs).toHaveLength(1);

    const [pair] = result.draft.fulfillmentPairs;

    expect(pair?.requestRef).toContain('request.');
    expect(pair?.confirmationRef).toContain('confirmation.');
  });

  it('attaches a proving document to the confirmation it proves', () => {
    const result = parseBlueprint(BLUEPRINT);

    if (!result.success) {
      throw new Error(result.error);
    }

    const [pair] = result.draft.fulfillmentPairs;

    expect(pair?.proofRef).toContain('evidence.');
  });

  it('gives a contract exactly two roles and roots it', () => {
    const result = parseBlueprint(BLUEPRINT);

    if (!result.success) {
      throw new Error(result.error);
    }

    const contract = result.draft.evidences.find(
      (evidence) => evidence.kind === 'contract',
    );

    expect(contract?.roleRefs).toHaveLength(2);

    const context = result.draft.contexts.find(
      (candidate) => candidate.id === contract?.contextRef,
    );

    expect(context?.rootRefs).toEqual([contract?.id]);
  });

  it('carries the row it read every evidence from', () => {
    const result = parseBlueprint(BLUEPRINT);

    if (!result.success) {
      throw new Error(result.error);
    }

    const rfp = result.draft.evidences.find(
      (evidence) => evidence.kind === 'rfp',
    );

    expect(rfp?.provenance?.locator).toBe('第 3 行');
    expect(rfp?.provenance?.text).toContain('商品询价单');
    expect(rfp?.provenance?.source).toBe('blueprint');
  });

  it('does not invent a partner when a confirmation has no request', () => {
    const orphan = `| 阶段 | 业务凭证 | 凭证类型 |
| :--- | :--- | :--- |
| 履约 | 支付确认 | confirmation |`;

    const result = parseBlueprint(orphan);

    if (!result.success) {
      throw new Error(result.error);
    }

    expect(result.draft.fulfillmentPairs).toEqual([]);
    expect(result.issues.map((issue) => issue.message).join(' ')).toContain(
      '没有对应的履约请求',
    );
  });

  it('reports a request that never got confirmed instead of closing it', () => {
    const unpaired = `| 阶段 | 业务凭证 | 凭证类型 |
| :--- | :--- | :--- |
| 履约 | 发货申请 | request |`;

    const result = parseBlueprint(unpaired);

    if (!result.success) {
      throw new Error(result.error);
    }

    expect(result.issues.map((issue) => issue.message).join(' ')).toContain(
      '缺少履约确认',
    );
  });

  it('marks a breach repair as a compensation of the pair before it', () => {
    const breach = `| 阶段 | 业务凭证 | 凭证类型 |
| :--- | :--- | :--- |
| 签约 | 服务合同 | contract |
| 交付 | 交付申请 | request |
| 交付 | 交付确认 | confirmation |
| 违约 | 退款申请 | request |
| 违约 | 退款确认 | confirmation |`;

    const result = parseBlueprint(breach);

    if (!result.success) {
      throw new Error(result.error);
    }

    expect(result.draft.fulfillmentPairs).toHaveLength(2);
    expect(result.draft.breachCompensations).toHaveLength(1);
    expect(result.draft.breachCompensations[0]?.triggeredByPairRef).toBe(
      result.draft.fulfillmentPairs[0]?.id,
    );
  });

  it('reads a CSV table with the same columns', () => {
    const csv = [
      '阶段,业务凭证,凭证类型,当事人',
      '履约,支付申请,request,甲方财务',
      '履约,支付确认,confirmation,乙方财务',
    ].join('\n');

    const result = parseBlueprint(csv, { format: 'csv' });

    if (!result.success) {
      throw new Error(result.error);
    }

    expect(result.draft.fulfillmentPairs).toHaveLength(1);
    expect(result.draft.evidences[0]?.provenance?.source).toBe('blueprint');
  });

  it('keeps a duplicate document name as a second evidence', () => {
    const duplicate = `| 业务凭证 | 凭证类型 |
| :--- | :--- |
| 支付确认 | confirmation |
| 支付确认 | confirmation |`;

    const result = parseBlueprint(duplicate);

    if (!result.success) {
      throw new Error(result.error);
    }

    expect(result.draft.evidences).toHaveLength(2);
    expect(result.draft.evidences[0]?.id).not.toBe(result.draft.evidences[1]?.id);
  });

  it('fails loudly when the header names no column it knows', () => {
    const result = parseBlueprint('| foo | bar |\n| --- | --- |\n| a | b |');

    expect(result.success).toBe(false);
  });
});

describe('inferring a kind from the document name', () => {
  it('reads the lecture vocabulary', () => {
    expect(inferEvidenceKind('商品询价单')).toBe('rfp');
    expect(inferEvidenceKind('商品报价单')).toBe('proposal');
    expect(inferEvidenceKind('采购框架合同')).toBe('contract');
    expect(inferEvidenceKind('支付申请单')).toBe('fulfillment_request');
    expect(inferEvidenceKind('支付确认单')).toBe('fulfillment_confirmation');
    expect(inferEvidenceKind('银行回单')).toBe('other_evidence');
  });
});
