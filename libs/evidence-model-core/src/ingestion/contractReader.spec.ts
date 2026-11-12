import { describe, expect, it } from 'vitest';

import { strictValidateDomainModel } from '@evidence-poc/evidence-schema';

import { compileIngestionDraft } from './compileDraft.js';
import { draftFromContract } from './contractReader.js';

const AGREEMENT = `甲乙双方签订《企业级云服务采购协议》。
因本协议产生的争议，提交深圳仲裁委员会仲裁。
甲方应在合同签订后 5 个工作日内支付首期技术服务费，并上传银行转账凭证。
乙方应在收到款项后 2 个工作日内开通企业账号权限，并出具开通确认函。
若乙方未按期开通服务，甲方有权发起退款申请，乙方应在 3 个工作日内全额退还。
会员等级按累计成长值计算，成长值每满 1000 点晋升一级。
观影券有效期为 30 天，过期后自动失效。
分成金额按当月总销售额乘以分成比例计算。`;

const read = (text = AGREEMENT) => draftFromContract(text, { modelName: '云服务采购' });

describe('reading an agreement into a draft', () => {
  it('keeps the contract and the paired obligations', () => {
    const { draft } = read();
    const kinds = draft.evidences.map((evidence) => evidence.kind);

    expect(kinds).toContain('contract');
    expect(kinds).toContain('fulfillment_request');
    expect(kinds).toContain('fulfillment_confirmation');
  });

  it('pairs each obligation with the confirmation that answers it', () => {
    const { draft } = read();

    expect(draft.fulfillmentPairs.length).toBeGreaterThan(0);

    for (const pair of draft.fulfillmentPairs) {
      expect(draft.evidences.map((evidence) => evidence.id)).toContain(
        pair.requestRef,
      );
      expect(draft.evidences.map((evidence) => evidence.id)).toContain(
        pair.confirmationRef,
      );
    }
  });

  it('does not turn a jurisdiction clause into evidence', () => {
    const { draft } = read();

    expect(
      draft.evidences.some((evidence) => evidence.label.includes('仲裁')),
    ).toBe(false);
  });

  it('turns a computing clause into a domain component, not a contract term', () => {
    const { draft } = read();
    const calculators = draft.things.filter(
      (thing) => thing.domainRole !== undefined,
    );

    expect(calculators.map((thing) => thing.label)).toEqual(
      expect.arrayContaining(['会员等级计算器', '有效期计算器']),
    );
    expect(calculators.every((thing) => thing.contextRef === 'context.domain')).toBe(
      true,
    );
  });

  it('keeps one component per noun however many clauses mention it', () => {
    const { draft } = read(`甲乙双方签订《会员服务协议》。
会员等级按成长值计算。
会员等级每满 1000 点晋升一级。`);

    expect(
      draft.things.filter((thing) => thing.label === '会员等级计算器'),
    ).toHaveLength(1);
  });

  it('reports a formula it cannot name instead of inventing a calculator', () => {
    const { draft, issues } = read(`甲方签订《服务协议》。
分成金额按约定计算。`);

    expect(draft.things.filter((thing) => thing.domainRole !== undefined)).toEqual(
      [],
    );
    expect(issues.join(' ')).toContain('没能读出它算的是什么');
  });

  it('says how many legal clauses it filtered out', () => {
    const { issues } = read();

    expect(issues.join(' ')).toContain('已过滤');
    expect(issues.join(' ')).toContain('纯法务条款');
  });

  it('gives each domain component the clause it was read from', () => {
    const { draft } = read();
    const calculator = draft.things.find(
      (thing) => thing.label === '会员等级计算器',
    );

    expect(calculator?.provenance?.text).toContain('成长值');
    expect(calculator?.provenance?.source).toBe('contract');
  });

  it('refuses an agreement with no business clause at all', () => {
    const { draft, issues } = read('因不可抗力导致服务中断的，双方互不承担责任。');

    expect(draft.evidences).toEqual([]);
    expect(issues.join(' ')).toContain('整份合约没有读到业务条款');
  });

  it('compiles into a model the schema accepts', () => {
    const { draft } = read();
    const compiled = compileIngestionDraft(draft, { modelId: 'cloud-procurement' });
    const validation = strictValidateDomainModel(compiled.document);

    expect(validation.issues.map((issue) => issue.message)).toEqual([]);
    expect(
      compiled.document.entities.some(
        (entity) =>
          entity.category === 'participant' &&
          entity.kind === 'thing' &&
          entity.domainRole === 'calculator',
      ),
    ).toBe(true);
  });
});
