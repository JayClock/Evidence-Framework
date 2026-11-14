import {
  diffDomainModels,
  readModelRoot,
} from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { API_FIXTURES } from '../../tests/support/fixtures.js';
import {
  addExternalPayment,
  addFulfillmentBranches,
  addPaymentFulfillment,
  createProcurementBaseModel,
  introduceContractDrift,
  procurementEvolution,
} from '../../tests/support/procurement.js';
import { operationFor, resolveSchema } from '../../tests/support/contract.js';
import { buildDelivery } from '../projector.js';
import { diffModelToApi } from './apiDiff.js';
import { buildDeliveryRoutes } from '../delivery/routes.js';
import { patchDeliveryRoutes } from './patchDeliveryRoutes.js';
import { buildDeliveryContract } from '../delivery/modelDelivery.js';

describe('five-stage procurement evolution', () => {
  it('starts with separate sourcing and contract roots and modeled caller roles', () => {
    const snapshot = buildDelivery(createProcurementBaseModel());
    expect(snapshot.diagnostics).toEqual([]);
    expect(snapshot.routes.map((route) => route.id).sort()).toEqual([
      'route.open.rfp.inquiry',
      'route.propose.proposal.quotation',
      'route.read.contract.agreement',
      'route.read.rfp.inquiry',
      'route.sign.contract.agreement',
    ]);
    expect(
      snapshot.routes.find((route) => route.purpose === 'sign'),
    ).toMatchObject({
      path: '/procurement/agreement',
      allowedPartyRoleRefs: ['role.buyer', 'role.seller'],
    });
    expect(
      snapshot.routes.find((route) => route.purpose === 'propose'),
    ).toMatchObject({
      path: '/sourcing/inquiry/{rfpId}/quotation',
      allowedPartyRoleRefs: ['role.seller'],
    });
    expect(
      snapshot.routes
        .filter((route) => route.contextRef === 'context.procurement')
        .every((route) => route.path.startsWith('/procurement/')),
    ).toBe(true);
    expect(snapshot.hypermedia).toContainEqual(
      expect.objectContaining({
        sourceRouteId: 'route.propose.proposal.quotation',
        targetRouteId: 'route.sign.contract.agreement',
        href: '/procurement/agreement',
      }),
    );
  });

  it('adds a payment pair and read ledger without changing existing routes', () => {
    const before = createProcurementBaseModel();
    const after = addPaymentFulfillment(before);
    const diff = diffModelToApi(before, after);
    expect(diff.summary).toMatchObject({
      routesAdded: 3,
      routesRemoved: 0,
      routesModified: 2,
      hasBreakingChanges: false,
    });
    expect(
      diff.routes
        .filter((route) => route.changeType === 'added')
        .map((route) => route.id)
        .sort(),
    ).toEqual([
      'route.confirm.confirmation.payment',
      'route.ledger.request.payment',
      'route.request.request.payment',
    ]);
    for (const route of diff.routes.filter(
      (route) => route.changeType === 'modified',
    )) {
      expect(route.after).toEqual(route.before);
      expect(route.fieldDiffs).toEqual([]);
    }
    const snapshot = buildDelivery(after);
    expect(snapshot.diagnostics).toEqual([]);
    expect(
      snapshot.routes.find(
        (route) => route.id === 'route.request.request.payment',
      ),
    ).toMatchObject({
      path: '/procurement/agreement/{contractId}/payment/request',
      shape: 'singleton',
      allowedPartyRoleRefs: ['role.seller'],
    });
    const confirmId = 'route.confirm.confirmation.payment';
    const confirm = snapshot.routes.find((route) => route.id === confirmId)!;
    expect(confirm).toMatchObject({
      path: '/procurement/agreement/{contractId}/payment/request/confirmation',
      allowedPartyRoleRefs: ['role.buyer'],
    });
    const operation = operationFor(snapshot, confirmId);
    const input = operation.requestBody!.content['application/json']!.schema;
    const response = operation.responses['201']!;
    const output = resolveSchema(
      snapshot.openapi,
      response.content!['application/hal+json']!.schema,
    );
    expect(input.additionalProperties).toBe(false);
    for (const name of ['total_amount', 'confirmed_at'])
      expect(input.properties).not.toHaveProperty(name);
    expect(output.properties!['total_amount']).toMatchObject({
      readOnly: true,
      'x-evidence-origin': 'derived',
      'x-evidence-rule': 'rule.total-amount',
    });
    expect(output.properties!['confirmed_at']).toMatchObject({
      readOnly: true,
      'x-evidence-origin': 'service-time',
    });
    expect(response.headers!['Location']).toMatchObject({
      'x-evidence-uri-template': confirm.itemPath,
    });
  });

  it('keeps external payment evidence behind its own boundary without inventing callbacks', () => {
    const before = addPaymentFulfillment(createProcurementBaseModel());
    const after = addExternalPayment(before);
    const snapshot = buildDelivery(after);
    expect(snapshot.diagnostics).toEqual([]);
    const diff = diffModelToApi(before, after);
    expect(
      diff.routes
        .filter((route) => route.changeType === 'added')
        .every((route) => route.serviceId === 'service.gateway'),
    ).toBe(true);
    const gateway = snapshot.routes.filter(
      (route) => route.contextRef === 'context.gateway',
    );
    expect(gateway).toHaveLength(5);
    expect(
      gateway.every(
        (route) =>
          route.exposure === 'internal' &&
          route.allowedPartyRoleRefs.length === 0,
      ),
    ).toBe(true);
    expect(
      snapshot.routes.some((route) => route.entityRef === 'role.payment-proof'),
    ).toBe(false);
    expect(
      snapshot.journeys.every((step) => !step.routeId.includes('processing')),
    ).toBe(true);
    expect(
      snapshot.routes.find(
        (route) => route.id === 'route.confirm.confirmation.payment',
      )!.fields,
    ).toContainEqual(
      expect.objectContaining({ name: 'proof_id', reason: 'caller' }),
    );
    expect(
      snapshot.routes.some((route) => /callback|webhook/.test(route.path)),
    ).toBe(false);
  });

  it('adds two independent singleton branches and only modeled navigation', () => {
    const before = addExternalPayment(
      addPaymentFulfillment(createProcurementBaseModel()),
    );
    const after = addFulfillmentBranches(before);
    const diff = diffModelToApi(before, after);
    expect(diff.summary).toMatchObject({
      routesAdded: 6,
      routesRemoved: 0,
      routesModified: 3,
      hasBreakingChanges: false,
    });
    const snapshot = buildDelivery(after);
    expect(snapshot.diagnostics).toEqual([]);
    const payment = snapshot.journeys.find(
      (step) => step.routeId === 'route.confirm.confirmation.payment',
    )!;
    const branches = snapshot.journeys.filter((step) =>
      [
        'route.request.request.invoicing',
        'route.request.request.delivery',
      ].includes(step.routeId),
    );
    expect(branches).toHaveLength(2);
    expect(payment.nextPossibleSteps).toEqual(
      branches.map((step) => step.id).sort(),
    );
    for (const step of branches) {
      const route = snapshot.routes.find((route) => route.id === step.routeId)!;
      expect(route.shape).toBe('singleton');
      expect(route.itemPath).toBe(route.path);
      expect(route.path).not.toContain('{requestId}');
    }
    const delivery = snapshot.journeys.find(
      (step) => step.routeId === 'route.request.request.delivery',
    )!;
    expect(
      delivery.nextPossibleSteps.some((id) => id.includes('invoicing')),
    ).toBe(false);
  });

  it('reports a removed endpoint, a new required input and derived-to-caller drift', () => {
    const before = procurementEvolution()[3]!;
    const after = introduceContractDrift(before);
    const diff = diffModelToApi(before, after);
    expect(diff.summary).toMatchObject({
      routesAdded: 0,
      routesRemoved: 1,
      hasBreakingChanges: true,
    });
    expect(
      diff.routes.find(
        (route) => route.id === 'route.confirm.confirmation.delivery',
      ),
    ).toMatchObject({ changeType: 'removed', breaking: true });
    const confirm = diff.routes.find(
      (route) => route.id === 'route.confirm.confirmation.payment',
    )!;
    expect(confirm.fieldDiffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'total_amount', shifted: 'to_caller' }),
        expect.objectContaining({ name: 'note', requiredChanged: true }),
      ]),
    );
    expect(confirm.breakingChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'REQUIRED_FIELD_ADDED',
          description: expect.stringContaining('total_amount'),
        }),
        expect.objectContaining({
          kind: 'REQUIRED_FIELD_ADDED',
          description: expect.stringContaining('note'),
        }),
        expect.objectContaining({ kind: 'RULE_CHANGED' }),
      ]),
    );
    const snapshot = buildDelivery(after);
    expect(snapshot.diagnostics).toEqual([]);
    const input = operationFor(snapshot, confirm.id).requestBody!.content[
      'application/json'
    ]!.schema;
    expect(input.required).toEqual(
      expect.arrayContaining(['total_amount', 'note']),
    );
  });

  it('keeps every stage immutable and patched routes equivalent to full rebuilds in both directions', () => {
    const stages = procurementEvolution();
    const originals = stages.map((stage) => JSON.stringify(stage));
    for (const [index, before] of stages.entries()) {
      expect(buildDelivery(before).diagnostics).toEqual([]);
      expect(diffModelToApi(before, before).routes).toEqual([]);
      const after = stages[index + 1];
      if (after === undefined) continue;
      for (const [base, target] of [
        [before, after],
        [after, before],
      ] as const) {
        expect(
          patchDeliveryRoutes(
            buildDeliveryRoutes(base),
            diffDomainModels(base, target),
            target,
          ),
        ).toEqual(buildDeliveryRoutes(target));
      }
    }
    expect(stages.map((stage) => JSON.stringify(stage))).toEqual(originals);
  });
});

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
