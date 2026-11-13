import { describe, expect, it } from 'vitest';

import type { EntityAST } from '@evidence-poc/evidence-schema';

import { classifyCrossContextEdge } from './edgeClassification.js';

const evidence = (
  id: string,
  kind: 'contract' | 'fulfillment_request' | 'fulfillment_confirmation',
): EntityAST => ({
  type: 'entity',
  id,
  category: 'evidence',
  kind,
  label: id,
  contextRef: 'context.core',
});

const role = (id: string, kind: 'evidence' | 'party'): EntityAST => ({
  type: 'entity',
  id,
  category: 'role',
  kind,
  label: id,
  contextRef: 'context.core',
});

const thing = (id: string): EntityAST => ({
  type: 'entity',
  id,
  category: 'participant',
  kind: 'thing',
  label: id,
  contextRef: 'context.domain',
});

const party = (id: string): EntityAST => ({
  type: 'entity',
  id,
  category: 'participant',
  kind: 'party',
  label: id,
});

describe('classifyCrossContextEdge', () => {
  it('names nothing for an edge inside one Context', () => {
    expect(
      classifyCrossContextEdge({
        source: evidence('confirmation.payment', 'fulfillment_confirmation'),
        target: evidence('request.payment', 'fulfillment_request'),
        kind: 'references',
        crossContext: false,
      }),
    ).toBeNull();
  });

  it('reads a settled moment cited across boundaries as a fact trace', () => {
    expect(
      classifyCrossContextEdge({
        source: evidence('contract.framework', 'contract'),
        target: evidence('confirmation.payment', 'fulfillment_confirmation'),
        kind: 'references',
        crossContext: true,
      }),
    ).toBe('moment_trace');
  });

  it('reads a foreign player filling a role as dependency inversion', () => {
    expect(
      classifyCrossContextEdge({
        source: evidence('confirmation.wallet-charge', 'fulfillment_confirmation'),
        target: role('role.payment-capability', 'evidence'),
        kind: 'plays_role',
        crossContext: true,
      }),
    ).toBe('role_inversion');
  });

  it('reads two Contexts meeting through an object as a shared thing', () => {
    expect(
      classifyCrossContextEdge({
        source: evidence('request.payment', 'fulfillment_request'),
        target: thing('thing.product'),
        kind: 'references',
        crossContext: true,
      }),
    ).toBe('shared_thing');
  });

  it('falls back to a plain boundary crossing', () => {
    expect(
      classifyCrossContextEdge({
        source: party('party.buyer'),
        target: role('role.buyer', 'party'),
        kind: 'references',
        crossContext: true,
      }),
    ).toBe('standard_cross');
  });
});
