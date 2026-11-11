import { describe, expect, it } from 'vitest';

import {
  KEY_DATA_SOURCE_KINDS,
  classifyKeyDataSource,
  isKeyDataDecisionOwed,
  isKeyDataResolved,
} from './keyData.js';

describe('classifyKeyDataSource', () => {
  it('classifies a derived attribute before its owning object kind', () => {
    expect(
      classifyKeyDataSource(
        { category: 'evidence', kind: 'fulfillment_request' },
        { name: 'amount', derivedByRuleRef: 'rule.amount' },
      ),
    ).toBe('derived');
  });

  it('classifies contract terms as the contract parameter provider', () => {
    expect(
      classifyKeyDataSource(
        { category: 'evidence', kind: 'contract' },
        { name: 'total_amount' },
      ),
    ).toBe('contract-term');
  });

  it('classifies domain objects and negotiation evidence', () => {
    expect(
      classifyKeyDataSource(
        { category: 'participant', kind: 'thing' },
        { name: 'unit_price' },
      ),
    ).toBe('domain-source');
    expect(
      classifyKeyDataSource(
        { category: 'evidence', kind: 'proposal' },
        { name: 'quoted_price' },
      ),
    ).toBe('negotiation-source');
  });

  it('classifies confirmations as result facts', () => {
    expect(
      classifyKeyDataSource(
        { category: 'evidence', kind: 'fulfillment_confirmation' },
        { name: 'accepted_quantity' },
      ),
    ).toBe('result-fact');
  });

  it('separates request formation inputs from decisions still owed', () => {
    expect(
      classifyKeyDataSource(
        { category: 'evidence', kind: 'fulfillment_request' },
        { name: 'delivery_address' },
      ),
    ).toBe('request-input');
    expect(
      classifyKeyDataSource(
        { category: 'evidence', kind: 'fulfillment_request' },
        { name: 'penalty_amount' },
      ),
    ).toBe('needs-decision');
  });

  it('keeps unclassified carriers out of the resolved set', () => {
    expect(
      classifyKeyDataSource(
        { category: 'role', kind: 'party' },
        { name: 'credit_limit' },
      ),
    ).toBe('other');
  });
});

describe('key data source helpers', () => {
  it('flags only the decision-owed bucket as unresolved', () => {
    expect(isKeyDataDecisionOwed('needs-decision')).toBe(true);
    expect(isKeyDataDecisionOwed('other')).toBe(false);
    expect(isKeyDataResolved('other')).toBe(false);
    expect(isKeyDataResolved('derived')).toBe(true);
    expect(KEY_DATA_SOURCE_KINDS).toContain('request-input');
  });
});
