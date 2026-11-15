import { applyPatches, enablePatches, produceWithPatches } from 'immer';
import { describe, expect, it } from 'vitest';
import { createProcurementModel } from '../testing/modelFixture.js';
import {
  addAttributeMutator,
  deleteEntityMutator,
  removeAttributeMutator,
  updateEntityMutator,
} from './index.js';
import {
  introduceFulfillmentPairMutator,
  isolateDomainCalculatorMutator,
} from './operators.js';

enablePatches();

describe('draft mutations', () => {
  it('restores cascaded relationships, rules, derivation owners and array order with generated inverse patches', () => {
    const document = createProcurementModel();
    const snapshot = structuredClone(document);
    const [next, patches, inverse] = produceWithPatches(document, (draft) => {
      deleteEntityMutator(draft, 'request.payment', { cascade: true });
    });
    expect(patches.length).toBeGreaterThan(0);
    expect(
      next.entities.some((entity) => entity.id === 'request.payment'),
    ).toBe(false);
    expect(applyPatches(next, inverse)).toStrictEqual(snapshot);
    expect(document).toStrictEqual(snapshot);
  });

  it('preserves responsibility and immutable identity guards', () => {
    const document = createProcurementModel();
    expect(() =>
      produceWithPatches(document, (draft) => {
        deleteEntityMutator(draft, 'role.seller', { cascade: true });
      }),
    ).toThrow(/referenced/);
    expect(() =>
      produceWithPatches(document, (draft) => {
        updateEntityMutator(draft, 'request.payment', { id: 'request.other' });
      }),
    ).toThrow(/immutable/);
  });

  it('removes optional keys and round-trips an attribute added to an absent list', () => {
    const document = createProcurementModel();
    const [next, , inverse] = produceWithPatches(document, (draft) => {
      updateEntityMutator(draft, 'request.payment', { notes: undefined });
      addAttributeMutator(draft, 'thing.product', {
        name: 'memo',
        label: '备注',
        meaning: '供应方填写',
        valueType: 'string',
      });
    });
    expect(
      next.entities.find((entity) => entity.id === 'request.payment'),
    ).not.toHaveProperty('notes');
    expect(applyPatches(next, inverse)).toStrictEqual(document);
  });

  it('refuses a derived attribute removal unless its owning rule cascades', () => {
    const document = createProcurementModel();
    expect(() =>
      produceWithPatches(document, (draft) => {
        removeAttributeMutator(
          draft,
          'contract.procurement',
          'total_minor_units',
        );
      }),
    ).toThrow(/written by rule/);
    const [next, , inverse] = produceWithPatches(document, (draft) => {
      removeAttributeMutator(
        draft,
        'contract.procurement',
        'total_minor_units',
        { cascade: true },
      );
    });
    expect(next.rules.some((rule) => rule.id === 'rule.contract-total')).toBe(
      false,
    );
    expect(applyPatches(next, inverse)).toStrictEqual(document);
  });

  it('composes a fulfillment operator directly on the draft in one transaction', () => {
    const document = createProcurementModel();
    const [next, , inverse] = produceWithPatches(document, (draft) => {
      const result = introduceFulfillmentPairMutator(draft, {
        contextRef: 'context.procurement',
        request: {
          id: 'request.refund',
          label: '退款请求',
          responsibleRoleRef: 'role.buyer',
        },
        confirmation: {
          id: 'confirmation.refund',
          label: '退款确认',
          responsibleRoleRef: 'role.seller',
        },
      });
      expect(result.createdIds).toEqual([
        'request.refund',
        'confirmation.refund',
      ]);
    });
    expect(
      next.rules.some((rule) => rule.id === 'rule.request.refund-completed'),
    ).toBe(true);
    expect(applyPatches(next, inverse)).toStrictEqual(document);
  });

  it('rolls back all operator writes when a later guard fails', () => {
    const document = createProcurementModel();
    const snapshot = structuredClone(document);
    expect(() =>
      produceWithPatches(document, (draft) => {
        isolateDomainCalculatorMutator(draft, {
          context: { id: 'context.calculation', label: '计算' },
          calculator: { id: 'thing.calculator', label: '计算器' },
          host: {
            ref: 'contract.procurement',
            attribute: {
              name: 'new_total',
              label: '新总额',
              meaning: '计算器计算',
              valueType: 'decimal',
            },
          },
          rule: {
            id: 'rule.contract-total',
            label: '重复规则',
            description: '重复',
            expression: '1',
            resultType: 'decimal',
          },
        });
      }),
    ).toThrow(/already used/);
    expect(document).toStrictEqual(snapshot);
  });
});
