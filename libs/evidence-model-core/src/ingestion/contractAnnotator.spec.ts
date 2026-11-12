import { describe, expect, it } from 'vitest';

import {
  annotateContractClauses,
  domainNounOf,
  splitContractClauses,
} from './contractAnnotator.js';

const AGREEMENT = [
  '本协议自双方签署之日起生效，一式两份，双方各执一份。',
  '任何一方违反本协议约定，应就其行为承担违约责任。',
  '因不可抗力导致服务中断的，双方互不承担责任。',
  '因本协议产生的争议，双方应友好协商解决；协商不成的，提交深圳仲裁委员会仲裁。',
  '乙方应在收到首期服务费后 2 个工作日内开通企业账号权限。',
  '甲方应在合同签订后 5 个工作日内支付首期技术服务费。',
  '若乙方未按期开通服务，甲方有权发起退款申请，乙方应在 3 个工作日内全额退还。',
  '会员等级按累计成长值计算，成长值每满 1000 点晋升一级，等级折扣按 9 折计算。',
  '观影券有效期为 30 天，过期后自动失效，不予补发。',
  '分成金额按当月总销售额乘以分成比例计算。',
  '双方应按约定履行各自义务。',
].join('\n');

const categoryOf = (text: string, needle: string): string | undefined =>
  annotateContractClauses(text).clauses.find((clause) =>
    clause.text.includes(needle),
  )?.category;

describe('splitting an agreement', () => {
  it('keeps one clause per sentence and drops the separators', () => {
    const clauses = splitContractClauses('第一句。第二句；\n第三句？');

    expect(clauses).toEqual(['第一句', '第二句', '第三句']);
  });

  it('returns nothing for whitespace', () => {
    expect(splitContractClauses('   \n  ')).toEqual([]);
  });
});

describe('reading an agreement into buckets', () => {
  it('files the risk-allocation clauses as boilerplate', () => {
    expect(categoryOf(AGREEMENT, '不可抗力')).toBe('boilerplate');
    expect(categoryOf(AGREEMENT, '深圳仲裁委员会')).toBe('boilerplate');
    expect(categoryOf(AGREEMENT, '一式两份')).toBe('boilerplate');
  });

  it('files the clauses that oblige someone as business', () => {
    expect(categoryOf(AGREEMENT, '开通企业账号权限')).toBe('business');
    expect(categoryOf(AGREEMENT, '支付首期技术服务费')).toBe('business');
    expect(categoryOf(AGREEMENT, '全额退还')).toBe('business');
  });

  it('files a pure computation as domain', () => {
    expect(categoryOf(AGREEMENT, '乘以分成比例')).toBe('domain');
  });

  it('keeps an obligation that also contains a formula in business', () => {
    const clause = annotateContractClauses(AGREEMENT).clauses.find((candidate) =>
      candidate.text.includes('晋升一级'),
    );

    // The clause is about membership tiers, but it also obliges nobody: what it
    // states is how a value is derived, so it is domain.
    expect(clause?.category).toBe('domain');
    expect(clause?.computesValue).toBe(true);
  });

  it('marks a formula that rides along with an obligation', () => {
    const clause = annotateContractClauses(
      '甲方应在次月 5 日前按销售额的 30% 支付分成。',
    ).clauses[0];

    expect(clause?.category).toBe('business');
    expect(clause?.computesValue).toBe(true);
  });

  it('numbers the clauses so the review panel can point at them', () => {
    const { clauses } = annotateContractClauses('第一句。第二句。');

    expect(clauses.map((clause) => clause.index)).toEqual([1, 2]);
  });

  it('says why each clause landed where it did', () => {
    for (const clause of annotateContractClauses(AGREEMENT).clauses) {
      expect(clause.reason.length).toBeGreaterThan(0);
    }
  });

  it('reports a clause it could not place instead of inventing a duty', () => {
    const { clauses, issues } = annotateContractClauses('双方应本着诚信原则行事。');

    expect(clauses[0]?.category).toBe('boilerplate');
    expect(issues.join(' ')).toContain('第 1 句未能归入业务或领域');
  });

  it('does not let an action verb inside a procedure clause make it business', () => {
    // 「提交仲裁委员会」 is an action, but nothing about the business changes when
    // it happens; the clause allocates risk, so it stays out of the model.
    const clause = annotateContractClauses(
      '争议发生后，乙方应在 3 个工作日内提交书面说明。',
    ).clauses[0];

    expect(clause?.category).toBe('boilerplate');
    expect(clause?.reason).toContain('争议解决');
  });

  it('reports a procedure clause that also names a duty, instead of hiding it', () => {
    const { issues } = annotateContractClauses(
      '因不可抗力导致服务中断的，乙方应在 3 个工作日内退款。',
    );

    expect(issues.join(' ')).toContain('既含程序性内容');
  });
});

describe('naming a domain component', () => {
  it('reads the noun a computing clause is about', () => {
    expect(domainNounOf('会员等级按累计成长值计算')).toEqual({
      label: '会员等级',
      role: 'calculator',
    });
    expect(domainNounOf('退订需校验是否存在未完结订单')).toEqual({
      label: '资格',
      role: 'checker',
    });
  });

  it('refuses to name a component the clause did not describe', () => {
    expect(domainNounOf('按约定计算')).toBeUndefined();
  });
});
