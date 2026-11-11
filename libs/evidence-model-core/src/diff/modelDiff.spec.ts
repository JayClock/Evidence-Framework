import type { DomainModelDocument, EntityAST } from '@evidence-poc/evidence-schema';

import { createProcurementModel } from '../../tests/support/modelFixture.js';
import { diffDomainModels } from './modelDiff.js';

const clone = (): DomainModelDocument =>
  structuredClone(createProcurementModel());

const entity = (
  document: DomainModelDocument,
  id: string,
): EntityAST => {
  const found = document.entities.find((candidate) => candidate.id === id);

  if (found === undefined) {
    throw new Error(`fixture is missing ${id}`);
  }

  return found;
};

describe('diffDomainModels', () => {
  it('reports no change for two copies of the same model', () => {
    const diff = diffDomainModels(clone(), clone());

    expect(diff.summary).toEqual({
      addedCount: 0,
      removedCount: 0,
      modifiedCount: 0,
      keyDataChangedCount: 0,
      hasKeyDataDrift: false,
      decisionOwedBase: 2,
      decisionOwedTarget: 2,
    });
    expect(diff.entities.every((item) => item.changeType === 'unchanged')).toBe(
      true,
    );
    expect(diff.contexts).toHaveLength(2);
    expect(diff.relationships.every((item) => item.changeType === 'unchanged')).toBe(
      true,
    );
  });

  it('separates Context containers from business objects', () => {
    const base = clone();
    const target = clone();

    target.entities.push({
      type: 'entity',
      id: 'context.settlement',
      category: 'context',
      kind: 'domain',
      label: '结算上下文',
      rootRefs: [],
    });

    const diff = diffDomainModels(base, target);

    expect(diff.entities.some((item) => item.id === 'context.settlement')).toBe(
      false,
    );
    expect(diff.contexts).toHaveLength(3);
    expect(
      diff.contexts.find((item) => item.id === 'context.settlement')
        ?.changeType,
    ).toBe('added');
    expect(diff.summary.addedCount).toBe(1);
  });

  it('marks a removed entity and keeps the base payload for the panel', () => {
    const base = clone();
    const target = clone();

    target.entities = target.entities.filter(
      (item) => item.id !== 'evidence.bank-slip',
    );
    target.relationships = target.relationships.filter(
      (item) => item.sourceRef !== 'evidence.bank-slip',
    );

    const diff = diffDomainModels(base, target);
    const removed = diff.entities.find(
      (item) => item.id === 'evidence.bank-slip',
    );

    expect(removed?.changeType).toBe('removed');
    expect(removed?.base?.label).toBe('银行回单');
    expect(removed?.target).toBeUndefined();
    expect(
      diff.relationships.find(
        (item) => item.id === 'relation.slip-references-request',
      )?.changeType,
    ).toBe('removed');
  });

  it('lists the attribute rows that changed', () => {
    const base = clone();
    const target = clone();
    const request = entity(target, 'request.payment');

    request.attributes = (request.attributes ?? []).map((attribute) =>
      attribute.name === 'requested_minor_units'
        ? { ...attribute, meaning: '由合同总金额按批次拆分得到' }
        : attribute,
    );

    const diff = diffDomainModels(base, target);
    const entityDiff = diff.entities.find(
      (item) => item.id === 'request.payment',
    );

    expect(entityDiff?.changeType).toBe('modified');
    expect(entityDiff?.fields).toEqual(['attributes']);
    expect(
      entityDiff?.attributeDiffs?.find(
        (item) => item.name === 'requested_minor_units',
      ),
    ).toEqual(
      expect.objectContaining({
        changeType: 'modified',
        fields: ['meaning'],
      }),
    );
  });

  it('reports a new attribute as an added row', () => {
    const base = clone();
    const target = clone();

    entity(target, 'contract.procurement').attributes?.push({
      name: 'settlement_days',
      label: '账期天数',
      meaning: '合同约定的付款账期天数',
      valueType: 'int',
      required: false,
    });

    const diff = diffDomainModels(base, target);
    const rows = diff.entities.find(
      (item) => item.id === 'contract.procurement',
    )?.attributeDiffs;

    expect(rows?.find((item) => item.name === 'settlement_days')).toEqual(
      expect.objectContaining({ changeType: 'added' }),
    );
  });

  it('flags a CEL rule whose expression moved to another provider', () => {
    const base = clone();
    const target = clone();

    target.rules = target.rules.map((rule) =>
      rule.id === 'rule.contract-total'
        ? { ...rule, expression: 'contract.quantity * 120' }
        : rule,
    );

    const diff = diffDomainModels(base, target);
    const ruleDiff = diff.rules.find(
      (item) => item.id === 'rule.contract-total',
    );

    expect(ruleDiff).toEqual(
      expect.objectContaining({
        changeType: 'modified',
        fields: ['expression'],
        baseExpression: 'contract.quantity * 100',
        targetExpression: 'contract.quantity * 120',
      }),
    );
    expect(diff.summary.modifiedCount).toBeGreaterThanOrEqual(1);
  });

  it('shows a decision that a branch resolved with a derivation rule', () => {
    const base = clone();
    const target = clone();
    const request = entity(target, 'request.payment');

    request.attributes = (request.attributes ?? []).map((attribute) =>
      attribute.name === 'requested_minor_units'
        ? { ...attribute, derivedByRuleRef: 'rule.contract-total' }
        : attribute,
    );

    const diff = diffDomainModels(base, target);
    const requested = diff.keyData.find(
      (item) =>
        item.entityRef === 'request.payment' &&
        item.attribute === 'requested_minor_units',
    );

    expect(requested).toEqual(
      expect.objectContaining({
        changeType: 'modified',
        baseSource: 'needs-decision',
        targetSource: 'derived',
        baseDecisionOwed: true,
        targetDecisionOwed: false,
      }),
    );
    expect(diff.summary).toEqual(
      expect.objectContaining({
        hasKeyDataDrift: true,
        decisionOwedBase: 2,
        decisionOwedTarget: 1,
      }),
    );
  });

  it('counts a key data item that only one branch models', () => {
    const base = clone();
    const target = clone();

    entity(target, 'request.payment').attributes?.push({
      name: 'late_fee_minor_units',
      label: '逾期违约金',
      meaning: '逾期未付款时请求方另行主张的违约金',
      valueType: 'int',
      required: false,
      keyData: true,
    });

    const diff = diffDomainModels(base, target);
    const added = diff.keyData.find(
      (item) => item.attribute === 'late_fee_minor_units',
    );

    expect(added).toEqual(
      expect.objectContaining({
        changeType: 'added',
        targetDecisionOwed: true,
      }),
    );
    expect(diff.summary).toEqual(
      expect.objectContaining({
        hasKeyDataDrift: true,
        decisionOwedBase: 2,
        decisionOwedTarget: 3,
      }),
    );
  });
});
