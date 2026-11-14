import { describe, expect, it } from 'vitest';

import { buildOpenApiLineIndex, componentKeyOf } from './openApiLineIndex';

const yamlText = [
  'openapi: 3.1.0',
  'info:',
  '  title: 采购',
  'paths:',
  '  /v1/procurement/orders:',
  '    post:',
  '      requestBody: {}',
  'components:',
  '  schemas:',
  '    contract_product-procurement:',
  '      type: object',
  '    evidence_purchase-order:',
  '      type: object',
].join('\n');

const bindings = [
  { entityRef: 'contract.product-procurement', path: '/v1/procurement/orders' },
  { entityRef: 'evidence.purchase-order', path: '/v1/procurement/orders' },
];

describe('OpenAPI line index', () => {
  it('points at the schema line when the contract declares one', () => {
    const index = buildOpenApiLineIndex(yamlText, bindings);

    expect(index.entityLine.get('contract.product-procurement')).toBe(10);
    expect(index.entityLine.get('evidence.purchase-order')).toBe(12);
    expect(index.lineEntity.get(10)).toBe('contract.product-procurement');
  });

  it('falls back to the route a schema-less entity is reachable through', () => {
    const index = buildOpenApiLineIndex(yamlText, [
      { entityRef: 'role.buyer', path: '/v1/procurement/orders' },
    ]);

    expect(index.entityLine.get('role.buyer')).toBe(5);
    expect(index.lineEntity.get(5)).toBe('role.buyer');
  });

  it('reads JSON keys as the same declarations', () => {
    const jsonText = JSON.stringify(
      {
        paths: { '/v1/orders': { post: {} } },
        components: { schemas: { contract_order: { type: 'object' } } },
      },
      null,
      2,
    );
    const index = buildOpenApiLineIndex(jsonText, [
      { entityRef: 'contract.order', path: '/v1/orders' },
    ]);

    // Line 2 declares `paths`; the schema key is the declaration that wins.
    expect(index.entityLine.get('contract.order')).toBe(9);
    expect(index.lineEntity.get(9)).toBe('contract.order');
  });

  it('names components the way the projector does', () => {
    expect(componentKeyOf('contract.product-procurement')).toBe(
      'contract_product-procurement',
    );
    expect(componentKeyOf('evidence.purchase/order')).toBe(
      'evidence_purchase_order',
    );
  });

  it('ignores an entity the contract does not mention', () => {
    const index = buildOpenApiLineIndex(yamlText, [
      { entityRef: 'participant.buyer', path: '/v1/nowhere' },
    ]);

    expect(index.entityLine.size).toBe(0);
    expect(index.lineEntity.size).toBe(0);
  });
});
