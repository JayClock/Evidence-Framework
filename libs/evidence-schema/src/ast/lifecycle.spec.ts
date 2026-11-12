import { describe, expect, it } from 'vitest';

import type { ContextEntityAST, EntityAST } from './entity.js';
import {
  LIFECYCLE_STAGES,
  furthestLifecycleStage,
  isLifecycleStage,
  lifecycleStageOf,
  lifecycleStageOfContext,
  lifecycleStageRank,
} from './lifecycle.js';

const evidence = (
  kind: Extract<EntityAST, { category: 'evidence' }>['kind'],
): EntityAST => ({
  type: 'entity',
  id: `evidence.${kind}`,
  category: 'evidence',
  kind,
  label: kind,
  contextRef: 'context.any',
});

const context = (kind: ContextEntityAST['kind']): ContextEntityAST => ({
  type: 'entity',
  id: `context.${kind}`,
  category: 'context',
  kind,
  label: kind,
});

describe('lifecycle vocabulary', () => {
  it('orders the four stages from enquiry to delivery', () => {
    expect(LIFECYCLE_STAGES).toEqual([
      'rfp',
      'proposal',
      'contract',
      'fulfillment',
    ]);
    expect(lifecycleStageRank('rfp')).toBeLessThan(
      lifecycleStageRank('proposal'),
    );
    expect(lifecycleStageRank('proposal')).toBeLessThan(
      lifecycleStageRank('contract'),
    );
    expect(lifecycleStageRank('contract')).toBeLessThan(
      lifecycleStageRank('fulfillment'),
    );
  });

  it('rejects anything outside the four stages', () => {
    expect(isLifecycleStage('contract')).toBe(true);
    expect(isLifecycleStage('signed')).toBe(false);
    expect(isLifecycleStage(undefined)).toBe(false);
  });
});

describe('lifecycleStageOf', () => {
  it('maps each evidence kind onto its moment', () => {
    expect(lifecycleStageOf(evidence('rfp'))).toBe('rfp');
    expect(lifecycleStageOf(evidence('proposal'))).toBe('proposal');
    expect(lifecycleStageOf(evidence('contract'))).toBe('contract');
    expect(lifecycleStageOf(evidence('fulfillment_request'))).toBe(
      'fulfillment',
    );
    expect(lifecycleStageOf(evidence('fulfillment_confirmation'))).toBe(
      'fulfillment',
    );
    expect(lifecycleStageOf(evidence('other_evidence'))).toBeNull();
  });

  it('leaves supporting documents and anchored objects off the clock', () => {
    expect(
      lifecycleStageOf({
        type: 'entity',
        id: 'participant.buyer',
        category: 'participant',
        kind: 'party',
        label: '买方',
      }),
    ).toBeNull();
    expect(
      lifecycleStageOf({
        type: 'entity',
        id: 'role.buyer',
        category: 'role',
        kind: 'party',
        label: '买方角色',
        contextRef: 'context.purchase',
      }),
    ).toBeNull();
  });
});

describe('lifecycleStageOfContext', () => {
  it('keeps a contract Context on the hinge whatever it holds', () => {
    expect(
      lifecycleStageOfContext(context('contract'), [evidence('rfp')]),
    ).toBe('contract');
  });

  it('reads a domain Context as fulfillment work', () => {
    expect(lifecycleStageOfContext(context('domain'))).toBe('fulfillment');
  });

  it('takes the furthest stage among pre-contract members', () => {
    expect(lifecycleStageOfContext(context('pre_contract'))).toBe('rfp');
    expect(
      lifecycleStageOfContext(context('pre_contract'), [evidence('rfp')]),
    ).toBe('rfp');
    expect(
      lifecycleStageOfContext(context('pre_contract'), [
        evidence('rfp'),
        evidence('proposal'),
      ]),
    ).toBe('proposal');
  });
});

describe('furthestLifecycleStage', () => {
  it('keeps the later stage and treats null as unset', () => {
    expect(furthestLifecycleStage(null, 'proposal')).toBe('proposal');
    expect(furthestLifecycleStage('fulfillment', null)).toBe('fulfillment');
    expect(furthestLifecycleStage('proposal', 'rfp')).toBe('proposal');
    expect(furthestLifecycleStage('contract', 'fulfillment')).toBe(
      'fulfillment',
    );
  });
});
