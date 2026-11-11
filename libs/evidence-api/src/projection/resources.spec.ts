import { buildResources } from './resources.js';
import { validateCardinality } from './cardinality.js';
import type { FmIndex } from '../adapter/fmAdapter.js';
import type { DesignDocument } from '../loader/apiLoader.js';

import {
  fullLifecycleDesign,
  fullLifecycleIndex,
} from '../../tests/support/fixtures.js';

const addressOf = (
  resources: readonly { id: string; uris: Readonly<Record<string, string>> }[],
  id: string,
): Readonly<Record<string, string>> | undefined =>
  resources.find((resource) => resource.id === id)?.uris;

describe('buildResources', () => {
  it('gives every declared resource a borrowed or own identity', async () => {
    const index = await fullLifecycleIndex();
    const { resources, diagnostics } = buildResources(fullLifecycleDesign(), index);

    expect(diagnostics).toEqual([]);
    expect(resources).toHaveLength(12);
    expect(addressOf(resources, 'resource.product')).toEqual({
      collection: '/products',
      item: '/products/{productId}',
    });
    expect(addressOf(resources, 'resource.product-procurement')).toEqual({
      collection: '/product-procurements',
      item: '/product-procurements/{procurementId}',
    });
    // A nested resource is addressed from its parent, not from a prefix guess.
    expect(addressOf(resources, 'resource.payment')).toEqual({
      singleton: '/product-procurements/{procurementId}/payment',
    });
    expect(addressOf(resources, 'resource.payment-confirmation')).toEqual({
      singleton: '/product-procurements/{procurementId}/payment/confirmation',
    });
    expect(addressOf(resources, 'resource.product-quotation')).toEqual({
      singleton: '/product-inquiries/{inquiryId}/quotation',
    });
  });

  it('carries the parent parameters down to the child', async () => {
    const index = await fullLifecycleIndex();
    const { resources } = buildResources(fullLifecycleDesign(), index);
    const confirmation = resources.find(
      (resource) => resource.id === 'resource.payment-confirmation',
    );

    expect(confirmation?.parameters).toEqual(['procurementId']);
    expect(confirmation?.shape).toBe('singleton');
  });

  it('refuses a resource that names an entity the model does not contain', async () => {
    const index = await fullLifecycleIndex();
    const design = structuredClone(fullLifecycleDesign()) as {
      resources: Record<string, unknown>[];
    };
    const target = design.resources.find(
      (item) => item['id'] === 'resource.product',
    );
    target!['entityRef'] = 'thing.missing';

    expect(buildResources(design, index).diagnostics).toEqual([
      expect.objectContaining({
        code: 'FM_REF_NOT_FOUND',
        targetRef: 'resource.product',
      }),
    ]);
  });

  it('refuses a resource that is neither Evidence nor a sourced Participant', async () => {
    const index = await fullLifecycleIndex();
    const design = structuredClone(fullLifecycleDesign()) as {
      resources: Record<string, unknown>[];
    };
    const target = design.resources.find(
      (item) => item['id'] === 'resource.product',
    );
    target!['entityRef'] = 'context.product-catalog';

    expect(buildResources(design, index).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RESOURCE_ENTITY_INVALID' }),
      ]),
    );
  });

  it('refuses a collection that borrows its identity from a parent', async () => {
    const index = await fullLifecycleIndex();
    const design = structuredClone(fullLifecycleDesign()) as {
      resources: Record<string, unknown>[];
    };
    const target = design.resources.find(
      (item) => item['id'] === 'resource.product',
    );
    target!['shape'] = 'collection';
    target!['identity'] = { kind: 'parent_scoped' };

    expect(buildResources(design, index).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RESOURCE_IDENTITY_CONFLICT' }),
      ]),
    );
  });

  it('reports a cycle instead of recursing', async () => {
    const index = await fullLifecycleIndex();
    const design = structuredClone(fullLifecycleDesign()) as {
      resources: Record<string, unknown>[];
    };
    const payment = design.resources.find((item) => item['id'] === 'resource.payment');
    payment!['parentRef'] = 'resource.payment-confirmation';

    const { diagnostics } = buildResources(design, index);

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RESOURCE_CYCLE' }),
      ]),
    );
  });

  it('refuses a nested path across two Context roots', async () => {
    const index = await fullLifecycleIndex();
    const design = structuredClone(fullLifecycleDesign()) as {
      resources: Record<string, unknown>[];
      bindings: Record<string, unknown>[];
    };
    const quotation = design.resources.find(
      (item) => item['id'] === 'resource.product-quotation',
    );
    quotation!['parentRef'] = 'resource.product';
    design.bindings.push({
      id: 'binding.quotation-product',
      kind: 'parent_child',
      parentResourceRef: 'resource.product',
      childResourceRef: 'resource.product-quotation',
      constraintRef: 'rule.none',
    });

    expect(buildResources(design, index).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RESOURCE_CONTEXT_ROOT_MISMATCH' }),
      ]),
    );
  });
});

describe('validateCardinality', () => {
  const design = (): DesignDocument =>
    structuredClone(fullLifecycleDesign()) as DesignDocument;

  const indexWith = async (): Promise<FmIndex> => fullLifecycleIndex();

  const resource = (): Record<string, unknown> => ({
    id: 'resource.child',
    entityRef: 'request.payment',
    shape: 'singleton',
  });

  const parent = (): Record<string, unknown> => ({
    id: 'resource.parent',
    entityRef: 'contract.product-procurement',
  });

  it('reports an unresolved number instead of inferring one', async () => {
    expect(
      validateCardinality(resource(), parent(), design(), await indexWith()),
    ).toEqual([
      expect.objectContaining({
        code: 'RESOURCE_CARDINALITY_UNRESOLVED',
        severity: 'gap',
        gapKey: 'resource.child.cardinality',
      }),
    ]);
  });

  it('refuses a scope for a root resource', async () => {
    expect(
      validateCardinality(
        { ...resource(), shape: 'collection' },
        null,
        design(),
        await indexWith(),
      ),
    ).toEqual([]);

    expect(
      validateCardinality(
        { ...resource(), shape: 'singleton' },
        null,
        design(),
        await indexWith(),
      ),
    ).toEqual([
      expect.objectContaining({ code: 'CARDINALITY_SCOPE_INVALID' }),
    ]);
  });

  it('refuses a number the modelled relationship contradicts', async () => {
    const index = await indexWith();
    const withSource = structuredClone(design()) as {
      sources: Record<string, unknown>[];
    };
    withSource.sources.push({
      id: 'source.contract',
      path: 'api.json',
      locator: 'x',
      quote: 'y',
      reasoning: 'z',
    });

    expect(
      validateCardinality(
        {
          ...resource(),
          cardinality: {
            max: 'many',
            sourceRefs: ['source.contract'],
            reasoning: 'assumed',
          },
        },
        parent(),
        withSource,
        index,
      ),
    ).toEqual([
      expect.objectContaining({ code: 'RESOURCE_CARDINALITY_CONFLICT' }),
    ]);
  });

  it('refuses a shape the proven number contradicts', async () => {
    const index = await indexWith();

    // The relationship says one child, so a collection is wrong.
    expect(
      validateCardinality(
        {
          ...resource(),
          shape: 'collection',
          cardinality: { relationshipRef: 'relation.contract-precedes-payment-request' },
        },
        parent(),
        design(),
        index,
      ),
    ).toEqual([
      expect.objectContaining({ code: 'RESOURCE_CARDINALITY_CONFLICT' }),
    ]);
    expect(
      validateCardinality(
        {
          ...resource(),
          shape: 'singleton',
          cardinality: { relationshipRef: 'relation.contract-precedes-payment-request' },
        },
        parent(),
        design(),
        index,
      ),
    ).toEqual([]);
  });

  it('refuses a relationship whose endpoints are not this pair', async () => {
    expect(
      validateCardinality(
        {
          ...resource(),
          cardinality: { relationshipRef: 'relation.buyer-agent-plays-buyer' },
        },
        parent(),
        design(),
        await indexWith(),
      ),
    ).toEqual([
      expect.objectContaining({ code: 'CARDINALITY_SCOPE_INVALID' }),
    ]);
  });

  it('refuses a proof that cites a source the design does not declare', async () => {
    expect(
      validateCardinality(
        {
          ...resource(),
          cardinality: { max: 1, sourceRefs: ['source.missing'], reasoning: 'x' },
        },
        parent(),
        design(),
        await indexWith(),
      ),
    ).toEqual([
      expect.objectContaining({ code: 'SOURCE_REF_NOT_FOUND' }),
    ]);
  });
});
