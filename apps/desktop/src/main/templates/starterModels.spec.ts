import { describe, expect, it } from 'vitest';

import { strictValidateDomainModel } from '@evidence-poc/evidence-schema';

import {
  createStarterDocument,
  deriveModelId,
  listProjectTemplates,
} from './starterModels';

const starterContext = { name: '采购履约模型', modelId: 'procurement-demo' };

const VALID_TEMPLATES = [
  'procurement',
  'subscription',
  'service_blueprint',
] as const;

describe('starter models', () => {
  it.each(VALID_TEMPLATES)(
    'ships a statically valid %s model',
    (templateId) => {
      const document = createStarterDocument(templateId, starterContext);
      const result = strictValidateDomainModel(document);

      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
    },
  );

  it.each(VALID_TEMPLATES)('uses the caller name and id in %s', (templateId) => {
    const document = createStarterDocument(templateId, starterContext);

    expect(document.manifest.id).toBe('procurement-demo');
    expect(document.manifest.name).toBe('采购履约模型');
    expect(document.manifest.entryContextRefs.length).toBeGreaterThan(0);
  });

  it('keeps the blank template empty on purpose', () => {
    const document = createStarterDocument('blank', starterContext);

    expect(document.entities).toEqual([]);
    expect(document.relationships).toEqual([]);
    expect(document.rules).toEqual([]);
    expect(document.manifest.id).toBe('procurement-demo');
  });

  it('replays the lecture cases with pre-contract and contract contexts', () => {
    const procurement = createStarterDocument('procurement', starterContext);
    const kinds = procurement.entities.map((entity) => entity.kind);

    expect(kinds).toContain('rfp');
    expect(kinds).toContain('proposal');
    expect(kinds).toContain('contract');

    const subscription = createStarterDocument('subscription', starterContext);

    expect(
      subscription.entities.some(
        (entity) => entity.id === 'request.discontinue-refund',
      ),
    ).toBe(true);
    expect(
      subscription.entities.some(
        (entity) => entity.id === 'context.payment-support',
      ),
    ).toBe(true);
  });

  it('describes every template card with its real counts', () => {
    const templates = listProjectTemplates();
    const procurement = createStarterDocument('procurement', starterContext);

    expect(templates.map((template) => template.id)).toEqual([
      'blank',
      'procurement',
      'subscription',
      'service_blueprint',
    ]);

    const card = templates.find((template) => template.id === 'procurement');

    expect(card?.entityCount).toBe(procurement.entities.length);
    expect(card?.relationshipCount).toBe(procurement.relationships.length);
    expect(card?.ruleCount).toBe(procurement.rules.length);
    expect(templates[0]?.entityCount).toBe(0);
  });

  it('derives an id the manifest grammar accepts', () => {
    expect(deriveModelId('Product Procurement')).toBe('product-procurement');
    expect(deriveModelId('   ')).toMatch(/^model-[a-z0-9]+$/);
    expect(deriveModelId('采购模型', 1_700_000_000_000)).toMatch(
      /^model-[a-z0-9]+$/,
    );
  });
});
