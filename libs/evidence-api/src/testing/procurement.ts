import {
  createEmptyDomainModel,
  type AttributeAST,
  type DomainModelDocument,
  type EntityAST,
  type RelationshipAST,
} from '@evidence-poc/evidence-schema';

const attribute = (
  name: string,
  valueType: AttributeAST['valueType'] = 'string',
  required = true,
): AttributeAST => ({ name, label: name, meaning: name, valueType, required });
const time = (name: string): AttributeAST => ({
  ...attribute(name, 'timestamp'),
  keyData: true,
});

const reference = (
  sourceRef: string,
  targetRef: string,
  kind: RelationshipAST['kind'] = 'references',
): RelationshipAST => ({
  type: 'relationship',
  id: `relation.${sourceRef}-${targetRef}`,
  kind,
  sourceRef,
  targetRef,
  label: kind,
  sourceCardinality: { min: 1, max: 1 },
  targetCardinality: { min: 1, max: 1 },
});

/** Synthetic, in-memory model inputs; no parallel API contract is maintained. */
export const createProcurementBaseModel = (): DomainModelDocument => {
  const document = createEmptyDomainModel({
    id: 'procurement-evolution',
    name: 'Procurement evolution',
    version: '1.0.0',
    entryContextRefs: ['context.sourcing', 'context.procurement'],
  });
  document.entities = [
    {
      type: 'entity',
      id: 'context.procurement',
      category: 'context',
      kind: 'contract',
      label: 'Procurement',
      rootRefs: ['contract.agreement'],
    },
    {
      type: 'entity',
      id: 'context.sourcing',
      category: 'context',
      kind: 'pre_contract',
      label: 'Sourcing',
      parentContextRef: 'context.procurement',
    },
    ...['buyer', 'seller'].flatMap<EntityAST>((role) => [
      {
        type: 'entity',
        id: `role.${role}`,
        category: 'role',
        kind: 'party',
        label: role,
        contextRef: 'context.procurement',
      },
      {
        type: 'entity',
        id: `party.${role}`,
        category: 'participant',
        kind: 'party',
        label: role,
      },
    ]),
    {
      type: 'entity',
      id: 'contract.agreement',
      category: 'evidence',
      kind: 'contract',
      contextRef: 'context.procurement',
      label: 'Agreement',
      roleRefs: ['role.buyer', 'role.seller'],
      attributes: [attribute('id', 'id'), time('signed_at')],
    },
    {
      type: 'entity',
      id: 'rfp.inquiry',
      category: 'evidence',
      kind: 'rfp',
      contextRef: 'context.sourcing',
      label: 'Inquiry',
      responsibleRoleRef: 'role.buyer',
      attributes: [
        attribute('id', 'id'),
        time('started_at'),
        time('expired_at'),
      ],
    },
    {
      type: 'entity',
      id: 'proposal.quotation',
      category: 'evidence',
      kind: 'proposal',
      contextRef: 'context.sourcing',
      label: 'Quotation',
      responsibleRoleRef: 'role.seller',
      attributes: [
        attribute('id', 'id'),
        time('started_at'),
        time('expired_at'),
      ],
    },
  ];
  document.relationships = [
    reference('party.buyer', 'role.buyer', 'plays_role'),
    reference('party.seller', 'role.seller', 'plays_role'),
    reference('proposal.quotation', 'rfp.inquiry'),
    reference('contract.agreement', 'proposal.quotation'),
  ];
  return document;
};

const appendPair = (
  document: DomainModelDocument,
  name: string,
  contextRef = 'context.procurement',
  contractRef = 'contract.agreement',
  requester = 'role.buyer',
  confirmer = 'role.seller',
): void => {
  document.entities.push(
    {
      type: 'entity',
      id: `request.${name}`,
      category: 'evidence',
      kind: 'fulfillment_request',
      contextRef,
      label: `${name} request`,
      responsibleRoleRef: requester,
      attributes: [
        attribute('id', 'id'),
        time('started_at'),
        time('expired_at'),
      ],
    },
    {
      type: 'entity',
      id: `confirmation.${name}`,
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      contextRef,
      label: `${name} confirmation`,
      responsibleRoleRef: confirmer,
      attributes: [attribute('id', 'id'), time('confirmed_at')],
    },
  );
  document.relationships.push(
    reference(`request.${name}`, contractRef),
    reference(`confirmation.${name}`, `request.${name}`),
  );
};

export const addPaymentFulfillment = (
  base: DomainModelDocument,
): DomainModelDocument => {
  const document = structuredClone(base);
  appendPair(
    document,
    'payment',
    undefined,
    undefined,
    'role.seller',
    'role.buyer',
  );
  document.entities
    .find((entity) => entity.id === 'request.payment')!
    .attributes!.push(
      attribute('quantity', 'int'),
      attribute('unit_price', 'decimal'),
    );
  document.entities
    .find((entity) => entity.id === 'confirmation.payment')!
    .attributes!.push(
      {
        ...attribute('total_amount', 'decimal'),
        derivedByRuleRef: 'rule.total-amount',
      },
      attribute('note', 'string', false),
    );
  document.rules.push({
    type: 'rule',
    id: 'rule.total-amount',
    kind: 'derivation',
    label: 'Total amount',
    description: 'Calculate the confirmed amount',
    contextRef: 'context.procurement',
    bindings: { request: { ref: 'request.payment' } },
    expression: 'double(request.quantity) * request.unit_price',
    resultType: 'decimal',
    target: { entityRef: 'confirmation.payment', attribute: 'total_amount' },
  });
  return document;
};

export const addExternalPayment = (
  base: DomainModelDocument,
): DomainModelDocument => {
  const document = structuredClone(base);
  document.entities.push(
    {
      type: 'entity',
      id: 'context.gateway',
      category: 'context',
      kind: 'contract',
      label: 'Payment gateway',
      rootRefs: ['contract.processing'],
    },
    ...['payer', 'provider'].map<EntityAST>((role) => ({
      type: 'entity',
      id: `role.${role}`,
      category: 'role',
      kind: 'party',
      label: role,
      contextRef: 'context.gateway',
    })),
    {
      type: 'entity',
      id: 'contract.processing',
      category: 'evidence',
      kind: 'contract',
      contextRef: 'context.gateway',
      label: 'Processing agreement',
      roleRefs: ['role.payer', 'role.provider'],
      attributes: [attribute('id', 'id'), time('signed_at')],
    },
    {
      type: 'entity',
      id: 'role.payment-proof',
      category: 'role',
      kind: 'evidence',
      contextRef: 'context.procurement',
      label: 'Payment proof',
      attributes: [attribute('proof_id', 'id')],
    },
  );
  appendPair(
    document,
    'processing',
    'context.gateway',
    'contract.processing',
    'role.payer',
    'role.provider',
  );
  document.entities
    .find((entity) => entity.id === 'confirmation.processing')!
    .attributes!.push(attribute('proof_id', 'id'));
  document.entities
    .find((entity) => entity.id === 'confirmation.payment')!
    .attributes!.push(attribute('proof_id', 'id'));
  document.relationships.push(
    reference('confirmation.processing', 'role.payment-proof', 'plays_role'),
    reference('confirmation.payment', 'role.payment-proof'),
  );
  return document;
};

export const addFulfillmentBranches = (
  base: DomainModelDocument,
): DomainModelDocument => {
  const document = structuredClone(base);
  for (const name of ['invoicing', 'delivery']) {
    appendPair(document, name);
    document.relationships.push(
      reference(`request.${name}`, 'confirmation.payment'),
    );
  }
  return document;
};

export const introduceContractDrift = (
  base: DomainModelDocument,
): DomainModelDocument => {
  const document = structuredClone(base);
  document.rules = document.rules.filter(
    (rule) => rule.id !== 'rule.total-amount',
  );
  const confirmation = document.entities.find(
    (entity) => entity.id === 'confirmation.payment',
  )!;
  delete confirmation.attributes!.find(
    (field) => field.name === 'total_amount',
  )!.derivedByRuleRef;
  confirmation.attributes!.find((field) => field.name === 'note')!.required =
    true;
  document.entities = document.entities.filter(
    (entity) => entity.id !== 'confirmation.delivery',
  );
  document.relationships = document.relationships.filter(
    (edge) =>
      edge.sourceRef !== 'confirmation.delivery' &&
      edge.targetRef !== 'confirmation.delivery',
  );
  return document;
};

export const procurementEvolution = (): DomainModelDocument[] => {
  const base = createProcurementBaseModel();
  const payment = addPaymentFulfillment(base);
  const external = addExternalPayment(payment);
  const branches = addFulfillmentBranches(external);
  return [base, payment, external, branches, introduceContractDrift(branches)];
};
