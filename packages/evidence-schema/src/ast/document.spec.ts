import { describe, expect, it } from 'vitest';

import {
  FM_SCHEMA_VERSION,
  createEmptyDomainModel,
  isDomainModelDocumentShape,
  isDomainModelManifest,
} from '../index.js';
import { loadFixtureModel } from '../../tests/support/fixtures.js';

describe('manifest guard', () => {
  const valid = {
    type: 'fm_model',
    schemaVersion: FM_SCHEMA_VERSION,
    id: 'product-procurement',
    name: '商品采购协议完整履约模型',
    version: '1.1.0',
    ruleLanguage: 'CEL',
    entryContextRefs: ['context.product-procurement'],
  };

  it('accepts a fixture manifest', () => {
    expect(isDomainModelManifest(loadFixtureModel().manifest)).toBe(true);
  });

  it('accepts the canonical shape', () => {
    expect(isDomainModelManifest(valid)).toBe(true);
  });

  it('rejects a wrong schema version', () => {
    expect(isDomainModelManifest({ ...valid, schemaVersion: '4.0' })).toBe(false);
  });

  it('rejects a malformed id', () => {
    expect(isDomainModelManifest({ ...valid, id: 'Product Procurement' })).toBe(
      false,
    );
  });

  it('rejects a non-array entryContextRefs', () => {
    expect(
      isDomainModelManifest({ ...valid, entryContextRefs: 'context.x' }),
    ).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isDomainModelManifest(null)).toBe(false);
    expect(isDomainModelManifest('fm_model')).toBe(false);
  });
});

describe('document shape guard', () => {
  it('accepts an empty document', () => {
    expect(isDomainModelDocumentShape(createEmptyDomainModel())).toBe(true);
  });

  it('accepts a fixture document', () => {
    expect(isDomainModelDocumentShape(loadFixtureModel())).toBe(true);
  });

  it('rejects missing collections', () => {
    const document = createEmptyDomainModel() as unknown as Record<
      string,
      unknown
    >;

    delete document['rules'];

    expect(isDomainModelDocumentShape(document)).toBe(false);
  });

  it('rejects a missing manifest', () => {
    expect(isDomainModelDocumentShape({ entities: [], relationships: [], rules: [] })).toBe(
      false,
    );
  });
});
