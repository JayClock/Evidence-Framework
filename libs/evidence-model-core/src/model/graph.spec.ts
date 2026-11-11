import { describe, expect, it } from 'vitest';

import { strictValidateDomainModel } from '@evidence-poc/evidence-schema';

import { createDomainGraph } from '../index.js';
import { createProcurementModel } from '../../tests/support/modelFixture.js';

const graph = () => createDomainGraph(createProcurementModel());

describe('graph fixture', () => {
  it('is a valid FM document', () => {
    expect(strictValidateDomainModel(createProcurementModel()).issues).toEqual(
      [],
    );
  });
});

describe('lookups', () => {
  it('resolves entities, rules and relationships', () => {
    const subject = graph();

    expect(subject.getEntity('request.payment')?.label).toBe('付款请求');
    expect(subject.getRule('rule.payment-completed')?.kind).toBe('completion');
    expect(
      subject.getRelationship('relation.confirmation-references-request')
        ?.sourceRef,
    ).toBe('confirmation.payment');
    expect(subject.getEntity('request.ghost')).toBeUndefined();
    expect(subject.getRule('rule.ghost')).toBeUndefined();
    expect(subject.getRelationship('relation.ghost')).toBeUndefined();
  });

  it('returns attributes by name', () => {
    const subject = graph();

    expect(subject.attributesOf('request.payment')).toHaveLength(3);
    expect(
      subject.attribute('request.payment', 'requested_minor_units')?.valueType,
    ).toBe('int');
    expect(subject.attribute('request.payment', 'Requested')).toBeUndefined();
    expect(subject.attributesOf('entity.ghost')).toEqual([]);
  });

  it('exposes raw collections', () => {
    const subject = graph();

    expect(subject.entities()).toHaveLength(12);
    expect(subject.relationships()).toHaveLength(6);
    expect(subject.rules()).toHaveLength(2);
  });
});

describe('relationship index', () => {
  it('indexes outgoing and incoming edges', () => {
    const subject = graph();

    expect(
      subject.outgoing('confirmation.payment').map((item) => item.id),
    ).toEqual(['relation.confirmation-references-request']);
    expect(subject.incoming('request.payment').map((item) => item.id)).toEqual([
      'relation.confirmation-references-request',
      'relation.slip-references-request',
    ]);
    expect(subject.outgoing('entity.ghost')).toEqual([]);
    expect(subject.incoming('entity.ghost')).toEqual([]);
  });

  it('computes one-hop neighbours without duplicates', () => {
    const subject = graph();

    expect([...subject.relatedIds('request.payment')].sort()).toEqual([
      'confirmation.payment',
      'contract.procurement',
      'evidence.bank-slip',
    ]);
    expect(subject.relatedIds('role.seller')).toEqual([]);
  });
});

describe('context structure', () => {
  it('groups owned objects by context', () => {
    const subject = graph();

    expect(
      subject
        .entitiesInContext('context.procurement')
        .map((entity) => entity.id),
    ).toEqual([
      'contract.procurement',
      'role.buyer',
      'role.seller',
      'request.payment',
      'confirmation.payment',
      'evidence.bank-slip',
    ]);
    expect(subject.entitiesInContext('context.unknown')).toEqual([]);
  });

  it('keeps child contexts separate', () => {
    const subject = graph();

    expect(subject.childContexts('context.procurement')).toEqual([]);
    expect(subject.childContexts('context.catalogue')).toEqual([]);
  });

  it('builds a cycle-safe context path', () => {
    const model = createProcurementModel();

    (model.entities.find((entity) => entity.id === 'context.catalogue') as
      | { parentContextRef?: string }
      | undefined)!.parentContextRef = 'context.procurement';

    const subject = createDomainGraph(model);

    expect(
      subject.contextPath('context.catalogue').map((item) => item.id),
    ).toEqual(['context.procurement', 'context.catalogue']);
    expect(
      subject.childContexts('context.procurement').map((item) => item.id),
    ).toEqual(['context.catalogue']);
  });

  it('breaks parent cycles', () => {
    const model = createProcurementModel();
    const procurement = model.entities.find(
      (entity) => entity.id === 'context.procurement',
    ) as { parentContextRef?: string };
    const catalogue = model.entities.find(
      (entity) => entity.id === 'context.catalogue',
    ) as { parentContextRef?: string };

    procurement.parentContextRef = 'context.catalogue';
    catalogue.parentContextRef = 'context.procurement';

    expect(
      createDomainGraph(model).contextPath('context.procurement').length,
    ).toBeLessThanOrEqual(2);
  });

  it('resolves the root contract of a context', () => {
    const subject = graph();

    expect(subject.rootContractOf('context.procurement')?.id).toBe(
      'contract.procurement',
    );
    expect(subject.rootContractOf('context.catalogue')).toBeUndefined();
    expect(subject.rootContractOf('context.ghost')).toBeUndefined();
  });
});

describe('rules', () => {
  it('lists rules per context', () => {
    const subject = graph();

    expect(
      subject.rulesInContext('context.procurement').map((rule) => rule.id),
    ).toEqual(['rule.payment-completed', 'rule.contract-total']);
    expect(subject.rulesInContext('context.catalogue')).toEqual([]);
  });

  it('finds rules that bind an object', () => {
    const subject = graph();

    expect(
      subject.rulesReferencing('request.payment').map((rule) => rule.id),
    ).toEqual(['rule.payment-completed']);
    expect(subject.rulesReferencing('party.seller-sales')).toEqual([]);
  });

  it('resolves the derivation rule of an attribute', () => {
    const subject = graph();

    expect(
      subject.derivationRule('contract.procurement', 'total_minor_units')?.id,
    ).toBe('rule.contract-total');
    expect(
      subject.derivationRule('contract.procurement', 'quantity'),
    ).toBeUndefined();
    expect(
      subject.derivationRule('contract.procurement', 'missing'),
    ).toBeUndefined();
  });
});

describe('fulfillment pairs', () => {
  it('derives request, confirmation, proof and rules', () => {
    const subject = graph();
    const pair = subject.fulfillmentPair('request.payment');

    expect(pair?.request.id).toBe('request.payment');
    expect(pair?.contract?.id).toBe('contract.procurement');
    expect(pair?.confirmations.map((item) => item.id)).toEqual([
      'confirmation.payment',
    ]);
    expect(pair?.proofs.map((item) => item.id)).toEqual(['evidence.bank-slip']);
    expect(pair?.completionRules.map((rule) => rule.id)).toEqual([
      'rule.payment-completed',
    ]);
    expect(pair?.breachRules).toEqual([]);
  });

  it('degrades to empty results for a request without results', () => {
    const model = createProcurementModel();

    model.relationships = model.relationships.filter(
      (relationship) => relationship.targetRef !== 'request.payment',
    );
    model.rules = model.rules.filter((rule) => rule.kind !== 'completion');

    const pair = createDomainGraph(model).fulfillmentPair('request.payment');

    expect(pair?.confirmations).toEqual([]);
    expect(pair?.proofs).toEqual([]);
    expect(pair?.completionRules).toEqual([]);
    expect(pair?.contract?.id).toBe('contract.procurement');
  });

  it('only models requests as pairs', () => {
    const subject = graph();

    expect(subject.fulfillmentPair('confirmation.payment')).toBeUndefined();
    expect(subject.fulfillmentPairs().map((pair) => pair.request.id)).toEqual([
      'request.payment',
    ]);
  });

  it('returns the same memoized list', () => {
    const subject = graph();

    expect(subject.fulfillmentPairs()).toBe(subject.fulfillmentPairs());
  });
});
