import { describe, expect, it } from 'vitest';

import {
  isVocabularyId,
  vocabularyField,
  vocabularyIds,
  vocabularyLabels,
} from './vocabulary.js';

const SAMPLE = {
  first: { label: '第一个', hint: '先', weight: 1 },
  second: { label: '第二个', hint: '后', weight: 2 },
} as const;

describe('vocabulary declaration', () => {
  it('keeps the declared order when listing ids', () => {
    expect(vocabularyIds(SAMPLE)).toEqual(['first', 'second']);
  });

  it('derives labels and single fields from the same declaration', () => {
    expect(vocabularyLabels(SAMPLE)).toEqual({
      first: '第一个',
      second: '第二个',
    });
    expect(vocabularyField(SAMPLE, 'hint')).toEqual({
      first: '先',
      second: '后',
    });
    expect(vocabularyField(SAMPLE, 'weight')).toEqual({ first: 1, second: 2 });
  });

  it('guards the declared ids and nothing else', () => {
    expect(isVocabularyId(SAMPLE, 'first')).toBe(true);
    expect(isVocabularyId(SAMPLE, 'third')).toBe(false);
    expect(isVocabularyId(SAMPLE, 1)).toBe(false);
    expect(isVocabularyId(SAMPLE, undefined)).toBe(false);
  });
});
