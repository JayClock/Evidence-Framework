import { describe, expect, it } from 'vitest';

import {
  CLAUSE_CATEGORIES,
  CLAUSE_CATEGORY_HINTS,
  CLAUSE_CATEGORY_LABELS,
  CLAUSE_DESTINATION_OF,
  countClausesByCategory,
  isClauseCategory,
  type ClauseAnnotation,
} from './clause.js';

const annotation = (
  index: number,
  category: ClauseAnnotation['category'],
): ClauseAnnotation => ({
  index,
  text: `第 ${index} 句`,
  category,
  reason: '测试',
});

describe('clause categories', () => {
  it('names the three buckets a contract is read into, and no fourth', () => {
    expect(CLAUSE_CATEGORIES).toEqual(['business', 'domain', 'boilerplate']);

    for (const category of CLAUSE_CATEGORIES) {
      expect(CLAUSE_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
      expect(CLAUSE_CATEGORY_HINTS[category].length).toBeGreaterThan(0);
    }
  });

  it('sends each bucket somewhere different, and boilerplate nowhere', () => {
    expect(CLAUSE_DESTINATION_OF.business).toBe('evidence');
    expect(CLAUSE_DESTINATION_OF.domain).toBe('domain-thing');
    expect(CLAUSE_DESTINATION_OF.boilerplate).toBe('none');
  });

  it('rejects a bucket the vocabulary does not know', () => {
    expect(isClauseCategory('business')).toBe(true);
    expect(isClauseCategory('legal')).toBe(false);
    expect(isClauseCategory(undefined)).toBe(false);
  });
});

describe('counting a reading', () => {
  it('counts each bucket and keeps empty buckets at zero', () => {
    expect(
      countClausesByCategory([
        annotation(1, 'business'),
        annotation(2, 'business'),
        annotation(3, 'boilerplate'),
      ]),
    ).toEqual({ business: 2, domain: 0, boilerplate: 1 });
  });

  it('counts an empty contract as three zeroes', () => {
    expect(countClausesByCategory([])).toEqual({
      business: 0,
      domain: 0,
      boilerplate: 0,
    });
  });
});
