import { buildRepresentations, encodeQuery, expand, matchesUri, parameters, bindLink } from './contractLinks.js';
import { payloadSchema, validatePayload, payloadOf, schemaSupported } from './contractPayloads.js';
import type { ProjectedCapability } from '../projection/capabilities.js';
import { projectCapabilities } from '../projection/capabilities.js';
import { buildResources } from '../projection/resources.js';

import {
  fullLifecycleDesign,
  fullLifecycleIndex,
} from '../../tests/support/fixtures.js';

const project = async () => {
  const index = await fullLifecycleIndex();
  const design = structuredClone(fullLifecycleDesign()) as Record<string, unknown>;
  const resources = buildResources(design, index);
  const capabilities = projectCapabilities(design, index, resources.resources);

  return { index, design, resources, capabilities };
};

describe('uri helpers', () => {
  it('reads the parameters a template declares', () => {
    expect([...parameters('/a/{a}/b/{b}')].sort()).toEqual(['a', 'b']);
    expect([...parameters('/products')]).toEqual([]);
  });

  it('expands and matches with the same template', () => {
    expect(expand('/products/{productId}', { productId: 'p 1' })).toBe(
      '/products/p%201',
    );
    expect(matchesUri('/products/{productId}', '/products/p1')).toBe(true);
    expect(matchesUri('/products/{productId}', '/products/p1/x')).toBe(false);
  });

  it('encodes a query the way urlencode prints it', () => {
    expect(encodeQuery({ page: '2', q: 'a b' })).toBe('page=2&q=a+b');
  });

  it('closes a link only when every target parameter is supplied', () => {
    const capability = {
      uri: '/products/{productId}',
      actorRoleRef: 'role.buyer',
      method: 'GET',
      id: 'capability.read',
      roleLabel: '客户',
      resourceRef: 'resource.product',
      view: 'item',
    } as unknown as ProjectedCapability;
    const link = {
      rel: 'product',
      capabilityRef: 'capability.read',
      parameterBindings: {
        productId: { kind: 'field', name: 'productId' },
      },
    };

    expect(bindLink(link, capability, { productId: 'p1' }, {})).toEqual({
      productId: 'p1',
    });
    expect(bindLink(link, capability, {}, {})).toBeNull();
    expect(
      bindLink(
        { ...link, parameterBindings: { other: { kind: 'path', name: 'x' } } },
        capability,
        {},
        { x: 1 },
      ),
    ).toBeNull();
    expect(
      bindLink(
        { ...link, parameterBindings: { productId: { kind: 'field', name: 'flag' } } },
        capability,
        { flag: true },
        {},
      ),
    ).toBeNull();
  });
});

describe('buildRepresentations', () => {
  it('renders the fixture representations with self links and actions', async () => {
    const { index, design, resources, capabilities } = await project();
    const { representations, diagnostics } = buildRepresentations(
      design['http'] as Record<string, unknown>,
      { capabilities: capabilities.capabilities, resources: resources.resources },
      index,
    );

    expect(diagnostics).toEqual([]);
    expect(representations).toHaveLength(12);

    const product = representations.find(
      (item) => item['id'] === 'representation.product-http',
    );

    expect(product?.['uri']).toBe('/products/{productId}');
    expect(product?.['availability']).toBe('not_evaluated');
    expect((product?.['example'] as Record<string, unknown>)['_links']).toEqual({
      self: { href: '/products/product-1' },
    });
    expect(
      (product?.['example'] as Record<string, unknown>)['_links'],
    ).not.toHaveProperty('next');
  });

  it('refuses a representation whose example does not fit its schema', async () => {
    const { index, design, resources, capabilities } = await project();
    const http = structuredClone(design['http']) as {
      representations: Record<string, unknown>[];
    };
    const product = http.representations.find(
      (item) => item['id'] === 'representation.product-http',
    ) as Record<string, unknown>;
    (product['example'] as Record<string, unknown>)['price_minor_units'] = 'not a number';

    const { diagnostics } = buildRepresentations(
      http,
      { capabilities: capabilities.capabilities, resources: resources.resources },
      index,
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CONTRACT_EXAMPLE_INVALID',
          targetRef: 'representation.product-http',
        }),
      ]),
    );
  });

  it('refuses a link whose parameters are not closed by the representation', async () => {
    const { index, design, resources, capabilities } = await project();
    const http = structuredClone(design['http']) as {
      representations: Record<string, unknown>[];
    };
    const product = http.representations.find(
      (item) => item['id'] === 'representation.product-http',
    ) as Record<string, unknown>;
    product['links'] = [
      {
        rel: 'self-ish',
        kind: 'navigation',
        capabilityRef: 'capability.read-product-as-buyer',
        parameterBindings: { productId: { kind: 'field', name: 'missing' } },
      },
    ];

    const { diagnostics } = buildRepresentations(
      http,
      { capabilities: capabilities.capabilities, resources: resources.resources },
      index,
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONTRACT_LINK_PARAMETER' }),
      ]),
    );
  });

  it('refuses a reserved relation name', async () => {
    const { index, design, resources, capabilities } = await project();
    const http = structuredClone(design['http']) as {
      representations: Record<string, unknown>[];
    };
    const product = http.representations.find(
      (item) => item['id'] === 'representation.product-http',
    ) as Record<string, unknown>;
    product['links'] = [
      {
        rel: 'self',
        kind: 'navigation',
        capabilityRef: 'capability.read-product-as-buyer',
        parameterBindings: { productId: { kind: 'path', name: 'productId' } },
      },
    ];

    const { diagnostics } = buildRepresentations(
      http,
      { capabilities: capabilities.capabilities, resources: resources.resources },
      index,
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CONTRACT_DUPLICATE' })]),
    );
  });

  it('reports a view the resource does not address', async () => {
    const { index, design, resources, capabilities } = await project();
    const http = structuredClone(design['http']) as {
      representations: Record<string, unknown>[];
    };
    const product = http.representations.find(
      (item) => item['id'] === 'representation.product-http',
    ) as Record<string, unknown>;
    product['view'] = 'collection';

    const { diagnostics } = buildRepresentations(
      http,
      { capabilities: capabilities.capabilities, resources: resources.resources },
      index,
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONTRACT_RESOURCE_VIEW' }),
      ]),
    );
  });
});

describe('payloads', () => {
  const field = (overrides: Record<string, unknown>): Record<string, unknown> => ({
    name: 'price_minor_units',
    required: true,
    origin: 'client',
    schema: { type: 'integer' },
    ...overrides,
  });

  const payload = (fields: Record<string, unknown>[], example: unknown) =>
    payloadOf({ mediaType: 'application/json', fields, example });

  it('builds the object schema a payload implies', () => {
    expect(payloadSchema(payload([field({})], {}))).toEqual({
      type: 'object',
      properties: { price_minor_units: { type: 'integer' } },
      required: ['price_minor_units'],
      additionalProperties: false,
    });
  });

  it('refuses a schema that resolves a reference', () => {
    expect(schemaSupported({ $ref: '#/x' })).toBe(false);
    expect(schemaSupported({ items: { type: 'string' } })).toBe(true);
  });

  it('checks a field against the FM attribute it names', async () => {
    const index = await fullLifecycleIndex();
    const diagnostics = validatePayload(
      payload(
        [
          field({
            name: 'total_minor_units',
            fmAttributeRef: 'contract.product-procurement#total_minor_units',
          }),
        ],
        { total_minor_units: 1 },
      ),
      index,
      'representation.test',
      true,
    );

    expect(diagnostics).toEqual([]);
  });

  it('refuses declaring a derived value the model does not derive', async () => {
    const index = await fullLifecycleIndex();
    const diagnostics = validatePayload(
      payload(
        [
          field({
            name: 'total_minor_units',
            origin: 'derived',
            fmAttributeRef: 'contract.product-procurement#total_minor_units',
          }),
        ],
        { total_minor_units: 1 },
      ),
      index,
      'representation.test',
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CONTRACT_FIELD_ORIGIN',
          message: '派生口径与 FM 不一致: contract.product-procurement#total_minor_units',
        }),
      ]),
    );
  });

  it('refuses a request that sends a server-side value', async () => {
    const index = await fullLifecycleIndex();
    const diagnostics = validatePayload(
      payload(
        [
          field({
            name: 'total_minor_units',
            origin: 'server',
            fmAttributeRef: 'contract.product-procurement#total_minor_units',
          }),
        ],
        { total_minor_units: 1 },
      ),
      index,
      'representation.test',
      true,
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CONTRACT_FIELD_ORIGIN',
          message: '请求不能将服务端记录或派生值当作客户端输入',
        }),
      ]),
    );
  });

  it('refuses a type or a format the model contradicts', async () => {
    const index = await fullLifecycleIndex();
    const diagnostics = validatePayload(
      payload(
        [
          field({
            name: 'signed_at',
            origin: 'derived',
            schema: { type: 'integer' },
            fmAttributeRef: 'contract.product-procurement#signed_at',
          }),
        ],
        { signed_at: 1 },
      ),
      index,
      'representation.test',
      false,
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONTRACT_FIELD_TYPE' }),
      ]),
    );
  });

  it('refuses a duplicate field name', async () => {
    const index = await fullLifecycleIndex();
    const diagnostics = validatePayload(
      payload([field({}), field({})], { price_minor_units: 1 }),
      index,
      'representation.test',
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CONTRACT_DUPLICATE' })]),
    );
  });
});
