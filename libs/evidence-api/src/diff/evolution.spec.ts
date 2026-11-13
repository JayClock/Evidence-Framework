import {
  diffDomainModels,
  readModelRoot,
} from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { API_FIXTURES } from '../../tests/support/fixtures.js';
import { buildDeliveryRoutes } from '../delivery/routes.js';
import { patchDeliveryRoutes } from './patchDeliveryRoutes.js';
import { buildDeliveryContract } from '../delivery/modelDelivery.js';

const mutations: Record<string, (model: DomainModelDocument) => void> = {
  'remove a confirmation': (model) => {
    model.entities = model.entities.filter(
      (entity) => entity.id !== 'confirmation.delivery',
    );
    model.relationships = model.relationships.filter(
      (edge) =>
        edge.sourceRef !== 'confirmation.delivery' &&
        edge.targetRef !== 'confirmation.delivery',
    );
  },
  'change role players': (model) => {
    model.relationships = model.relationships.filter(
      (edge) => edge.kind !== 'plays_role',
    );
  },
  'change parent context': (model) => {
    for (const entity of model.entities)
      if (
        entity.category === 'context' &&
        entity.id === 'context.product-sourcing'
      )
        delete entity.parentContextRef;
  },
  'move a request between contexts': (model) => {
    for (const entity of model.entities)
      if (entity.category === 'evidence' && entity.id === 'request.delivery')
        entity.contextRef = 'context.wechat-payment';
  },
  'change dependency and cardinality': (model) => {
    for (const edge of model.relationships)
      if (edge.id === 'relation.contract-precedes-payment-request') {
        edge.targetRef = 'confirmation.delivery';
        edge.sourceCardinality = { min: 0, max: 'many' };
      }
  },
};

it.each(Object.keys(mutations))(
  'matches a full rebuild when patching: %s',
  async (name) => {
    const { bundle: before } = await readModelRoot(
      `${API_FIXTURES}full-lifecycle/fm`,
    );
    const after = structuredClone(before);
    mutations[name]?.(after);
    const routes = buildDeliveryRoutes(before);
    const original = JSON.stringify(routes);
    const result = patchDeliveryRoutes(
      routes,
      diffDomainModels(before, after),
      after,
    );
    expect(result).toEqual(buildDeliveryRoutes(after));
    expect(JSON.stringify(routes)).toBe(original);
    const reverse = patchDeliveryRoutes(
      result,
      diffDomainModels(after, before),
      before,
    );
    expect(reverse).toEqual(buildDeliveryRoutes(before));
  },
);

it('emits resolvable schema references, matched path parameters and HAL responses', async () => {
  const { bundle } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);
  const contract = buildDeliveryContract(bundle);
  const visit = (value: unknown) => {
    if (typeof value !== 'object' || value === null) return;
    if ('$ref' in value) {
      expect(typeof value.$ref).toBe('string');
      const key = String(value.$ref).replace('#/components/schemas/', '');
      expect(contract.components.schemas[key]).toBeDefined();
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(contract);
  for (const [path, methods] of Object.entries(contract.paths)) {
    const parameters = [...path.matchAll(/\{([^{}]+)\}/g)]
      .map((match) => match[1])
      .sort();
    for (const operation of Object.values(methods)) {
      const typed = operation as {
        parameters: { name: string; required: boolean }[];
      };
      expect(
        typed.parameters.map((parameter) => parameter.name).sort(),
      ).toEqual(parameters);
      expect(typed.parameters.every((parameter) => parameter.required)).toBe(
        true,
      );
    }
  }
  for (const schema of Object.values(contract.components.schemas))
    expect(schema).toMatchObject({
      required: expect.arrayContaining(['_links']),
    });
});
