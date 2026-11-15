import type {
  DomainModelDocument,
  ExampleTestAST,
} from '@evidence-poc/evidence-schema';
import {
  addPaymentFulfillment,
  createProcurementBaseModel,
} from './procurement.js';

export const EXAMPLE_AS_OF = '2026-03-31T10:00:00Z';
/** Full model examples also remain valid OpenAPI request/response documentation. */
export const createAcceptanceModel = (): DomainModelDocument => {
  const model = addPaymentFulfillment(createProcurementBaseModel());
  // Several requests can belong to one agreement: the confirmation must capture requestId.
  model.relationships.find(
    (edge) =>
      edge.sourceRef === 'request.payment' &&
      edge.targetRef === 'contract.agreement',
  )!.sourceCardinality = { min: 0, max: 'many' };
  const attach = (
    id: string,
    label: string,
    value: Record<string, unknown>,
    test: Omit<ExampleTestAST, 'flow' | 'asOf'>,
  ): void => {
    model.entities.find((entity) => entity.id === id)!.examples = [
      { label, value, test: { flow: 'payment', asOf: EXAMPLE_AS_OF, ...test } },
    ];
  };
  attach(
    'contract.agreement',
    'signed',
    { id: 'agreement-001', signed_at: EXAMPLE_AS_OF },
    { actingRoleRef: 'role.buyer' },
  );
  attach(
    'request.payment',
    'requested',
    {
      id: 'request-001',
      quantity: 10,
      unit_price: 50,
      started_at: EXAMPLE_AS_OF,
      expired_at: '2026-04-01T10:00:00Z',
    },
    { actingRoleRef: 'role.seller', basedOn: ['contract.agreement#signed'] },
  );
  attach(
    'confirmation.payment',
    'confirmed',
    { id: 'confirmation-001', total_amount: 500, confirmed_at: EXAMPLE_AS_OF },
    { actingRoleRef: 'role.buyer', basedOn: ['request.payment#requested'] },
  );
  return model;
};
