import { compactCanonicalJson } from '@evidence-poc/evidence-schema';
import { describe, expect, it } from 'vitest';
import { digestOf } from '../validation/modelDigest.js';
import { computeStepHash } from './flowAggregator.js';
import type { StepFingerprintInput } from './types.js';

const fingerprint = (): StepFingerprintInput => ({
  entityId: 'request.payment',
  entityKind: 'fulfillment_request',
  actingRoleRef: 'role.buyer',
  asOf: '2026-03-31T10:00:00Z',
  basedOn: ['agreement-001'],
  values: { id: 'request-001', amount: 500, details: { currency: 'CNY' } },
  derivedAssertions: { '$.amount': 500 },
});

describe('computeStepHash', () => {
  it('uses the canonical fingerprint wire representation and SHA-256 format', () => {
    const input = fingerprint();
    expect(computeStepHash(input)).toBe(digestOf(compactCanonicalJson(input)));
    expect(computeStepHash(input)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('is independent of object key order, including nested values', () => {
    const input = fingerprint();
    expect(
      computeStepHash({
        derivedAssertions: input.derivedAssertions,
        values: {
          details: { currency: 'CNY' },
          amount: 500,
          id: 'request-001',
        },
        basedOn: input.basedOn,
        asOf: input.asOf,
        actingRoleRef: input.actingRoleRef,
        entityKind: input.entityKind,
        entityId: input.entityId,
      }),
    ).toBe(computeStepHash(input));
  });

  it.each<[keyof StepFingerprintInput, unknown]>([
    ['entityId', 'request.deposit'],
    ['entityKind', 'contract'],
    ['actingRoleRef', 'role.seller'],
    ['asOf', '2026-04-01T10:00:00Z'],
    ['basedOn', ['agreement-002']],
    ['values', { id: 'request-001', amount: 501 }],
    ['derivedAssertions', { '$.amount': 501 }],
  ])('changes when the local %s changes', (key, value) => {
    const input = fingerprint();
    expect(computeStepHash({ ...input, [key]: value })).not.toBe(
      computeStepHash(input),
    );
  });

  it('ignores sequence, labels, gaps and other presentation metadata', () => {
    const input = fingerprint();
    const step = {
      ...input,
      sequence: 7,
      stepHash: 'previous',
      entityLabel: '付款申请',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.seller',
      exampleLabel: 'requested',
      gaps: ['request.payment: missing confirmation'],
    };
    expect(computeStepHash(step)).toBe(computeStepHash(input));
  });

  it('treats omitted optional fields as undefined and never mutates inputs', () => {
    const input = Object.freeze({
      ...fingerprint(),
      basedOn: Object.freeze(['agreement-001']),
      values: Object.freeze({ id: 'request-001' }),
    });
    const {
      actingRoleRef: _role,
      derivedAssertions: _assertions,
      ...minimal
    } = input;
    const before = structuredClone(input);
    expect(computeStepHash(minimal)).toBe(
      computeStepHash({ ...minimal, actingRoleRef: undefined }),
    );
    computeStepHash(input);
    expect(input).toEqual(before);
  });
});
