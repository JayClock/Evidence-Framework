import type {
  AttributeAST,
  DomainModelDocument,
  EvidenceEntityAST,
  RoleEntityAST,
} from '@evidence-poc/evidence-schema';

import type { CreateFulfillmentPairInput } from './fulfillmentCommands.js';
import type { ModelPatchCommand } from './patches.js';

/**
 * What one operator produced.
 *
 * The commands are the same descriptions an agent sends through
 * `apply_model_patch`, so an operator is nothing more than a named, reusable
 * assembly of them: the model session validates and records it like any other
 * edit.
 */
export interface OperatorPatch {
  commands: readonly ModelPatchCommand[];
  /** Objects the operator creates, in the order the commands create them. */
  createdIds: readonly string[];
}

const timestamp = (
  name: string,
  label: string,
  meaning: string,
): AttributeAST => ({
  name,
  label,
  meaning,
  valueType: 'timestamp',
  required: true,
  keyData: true,
});

/**
 * Business time an operator always models explicitly.
 *
 * The command guards reject a moment without these, so an operator fills them
 * instead of leaving the agent to rediscover the requirement on every call.
 */
const startedAt = (window: string | undefined): AttributeAST =>
  timestamp(
    'started_at',
    '发起时间',
    window === undefined
      ? '权利方发起履约请求的业务时间。'
      : `权利方发起履约请求的业务时间；约定窗口为${window}。`,
  );

const expiredAt = (window: string | undefined): AttributeAST =>
  timestamp(
    'expired_at',
    '履约截止时间',
    window === undefined
      ? '权利方要求的履约时限终点，由合同条款确定。'
      : `权利方要求的履约时限终点，取发起时间加${window}。`,
  );

const confirmedAt = (label: string): AttributeAST =>
  timestamp('confirmed_at', '确认时间', `${label}形成时的业务时间。`);

const createdAt = (label: string): AttributeAST =>
  timestamp('created_at', '形成时间', `${label}形成时的业务时间。`);

const signedAt = (meaning: string | undefined): AttributeAST =>
  timestamp(
    'signed_at',
    '签署时间',
    meaning ?? '当事双方签订该协议的业务时间。',
  );

const pairInput = ({
  contextRef,
  request,
  confirmation,
  contractRef,
}: {
  contextRef: string;
  request: {
    id: string;
    label: string;
    responsibleRoleRef: string;
    window?: string;
  };
  confirmation: {
    id: string;
    label: string;
    responsibleRoleRef: string;
  };
  contractRef: string | undefined;
}): CreateFulfillmentPairInput => ({
  contextRef,
  request: {
    id: request.id,
    label: request.label,
    responsibleRoleRef: request.responsibleRoleRef,
    attributes: [
      startedAt(request.window),
      expiredAt(request.window),
    ],
  },
  confirmation: {
    id: confirmation.id,
    label: confirmation.label,
    responsibleRoleRef: confirmation.responsibleRoleRef,
    attributes: [confirmedAt(confirmation.label)],
  },
  ...(contractRef === undefined
    ? {}
    : { contractReferenceId: `relation.${request.id}-references-contract` }),
});

/** Root Contract of a Contract Context, read without asserting uniqueness. */
const rootContractOf = (
  document: DomainModelDocument,
  contextRef: string,
): EvidenceEntityAST | undefined => {
  const context = document.entities.find((entity) => entity.id === contextRef);

  if (context === undefined || context.category !== 'context') {
    throw new Error(`未知的上下文 '${contextRef}'，无法确定履约归属。`);
  }

  const roots = (context.rootRefs ?? []).flatMap((ref) =>
    document.entities.filter(
      (entity): entity is EvidenceEntityAST =>
        entity.id === ref &&
        entity.category === 'evidence' &&
        entity.kind === 'contract',
    ),
  );

  return roots.length === 1 ? roots[0] : undefined;
};

export interface FulfillmentPairIntent {
  /** Contract Context that owns both moments. */
  contextRef: string;
  request: {
    id: string;
    label: string;
    /** Party Role demanding the performance; must be bound by the root Contract. */
    responsibleRoleRef: string;
    /** Business window, e.g. `7 个工作日`. */
    window?: string;
  };
  confirmation: {
    id: string;
    label: string;
    responsibleRoleRef: string;
  };
  /** Supporting proof the model keeps next to the confirmation. */
  proof?: {
    id: string;
    label: string;
    responsibleRoleRef?: string;
  };
}

/**
 * Assembles one main fulfillment pair, plus its proof when the caller names one.
 *
 * Encoding the two moments as a single operator is the point: an agent that has
 * to remember "a request without a confirmation is not evidence" will sooner or
 * later write half a pair, and the model then carries a request nothing closes.
 */
export const introduceFulfillmentPair = (
  document: DomainModelDocument,
  intent: FulfillmentPairIntent,
): OperatorPatch => {
  const rootContract = rootContractOf(document, intent.contextRef);
  const commands: ModelPatchCommand[] = [];

  if (intent.proof !== undefined) {
    const proof: EvidenceEntityAST = {
      type: 'entity',
      category: 'evidence',
      kind: 'other_evidence',
      id: intent.proof.id,
      label: intent.proof.label,
      contextRef: intent.contextRef,
      responsibleRoleRef:
        intent.proof.responsibleRoleRef ?? intent.confirmation.responsibleRoleRef,
      attributes: [createdAt(intent.proof.label)],
    };

    commands.push({ type: 'create-entity', entity: proof });
  }

  commands.push({
    type: 'create-fulfillment-pair',
    input: pairInput({
      contextRef: intent.contextRef,
      request: intent.request,
      confirmation: intent.confirmation,
      contractRef: rootContract?.id,
    }),
  });

  if (intent.proof !== undefined) {
    commands.push({
      type: 'create-relationship',
      relationship: {
        type: 'relationship',
        id: `relation.${intent.confirmation.id}-uses-${intent.proof.id}`,
        kind: 'references',
        sourceRef: intent.confirmation.id,
        targetRef: intent.proof.id,
        label: '确认引用履约证明',
        sourceCardinality: { min: 1, max: 1 },
        targetCardinality: { min: 1, max: 1 },
      },
    });
  }

  return {
    commands,
    createdIds: [
      ...(intent.proof === undefined ? [] : [intent.proof.id]),
      intent.request.id,
      intent.confirmation.id,
    ],
  };
};

export interface BreachCompensationIntent {
  /** Request whose missed deadline is the breach. */
  requestRef: string;
  /** Confirmation that would have closed that request. */
  confirmationRef: string;
  /** The breach in business language, e.g. `超过约定窗口仍未到账`. */
  condition: string;
  /** Compensation pair the breach triggers. */
  request: {
    id: string;
    label: string;
    responsibleRoleRef: string;
    window?: string;
  };
  confirmation: {
    id: string;
    label: string;
    responsibleRoleRef: string;
  };
  proof?: {
    id: string;
    label: string;
    responsibleRoleRef?: string;
  };
}

/**
 * Assembles the breach condition plus the fulfillment pair it triggers.
 *
 * The model never rolls a failure back: a missed deadline is a business event
 * that starts a new request in the same Contract Context, so the compensation
 * has its own request, confirmation and proof.
 */
export const addBreachCompensation = (
  document: DomainModelDocument,
  intent: BreachCompensationIntent,
): OperatorPatch => {
  const breaching = document.entities.find(
    (entity) => entity.id === intent.requestRef,
  );

  if (
    breaching === undefined ||
    breaching.category !== 'evidence' ||
    breaching.kind !== 'fulfillment_request'
  ) {
    throw new Error(`'${intent.requestRef}' 不是履约请求，无法声明违约补偿。`);
  }

  const contextRef = breaching.contextRef;
  const compensation = introduceFulfillmentPair(document, {
    contextRef,
    request: intent.request,
    confirmation: intent.confirmation,
    ...(intent.proof === undefined ? {} : { proof: intent.proof }),
  });

  return {
    commands: [
      {
        type: 'bind-breach-rule',
        input: {
          requestRef: intent.requestRef,
          rule: {
            id: `rule.${intent.requestRef}-breached`,
            label: '未按期履约判断',
            description: intent.condition,
            bindings: {
              request: { ref: intent.requestRef },
              confirmations: {
                ref: intent.confirmationRef,
                cardinality: 'many',
              },
              now: { type: 'timestamp' },
            },
            // A window that closed with no confirmation inside it: the request
            // is breached, and the compensation below is what the model offers
            // instead of an implicit retry.
            expression: `now > request.expired_at && !confirmations.exists(c, c.confirmed_at <= request.expired_at)`,
            resultType: 'bool',
          },
        },
      },
      ...compensation.commands,
    ],
    createdIds: [
      `rule.${intent.requestRef}-breached`,
      ...compensation.createdIds,
    ],
  };
};

export interface RoleInversionIntent {
  /** Confirmation the core contract currently treats as its own result. */
  targetConfirmationRef: string;
  /** The capability the core contract depends on, as a role it can name. */
  socket: { id: string; label: string };
  /** The contract the capability actually comes from. */
  supporting: {
    context: { id: string; label: string };
    contract: { id: string; label: string; signedAtMeaning?: string };
    /** Party that performs the capability. */
    provider: { id: string; label: string };
    /** Party that asks for it. */
    consumer: { id: string; label: string };
    request: { id: string; label: string; window?: string };
    confirmation: { id: string; label: string };
  };
}

/**
 * Reverses a dependency: the capability becomes a role the core contract owns,
 * and a separate Contract Context supplies a confirmation that plays it.
 *
 * Without this operator the core contract would have to name every provider
 * that can ever settle it, which is how a subscription model ends up depending
 * on one payment vendor.
 */
export const roleifyAndInvertDependency = (
  document: DomainModelDocument,
  intent: RoleInversionIntent,
): OperatorPatch => {
  const target = document.entities.find(
    (entity) => entity.id === intent.targetConfirmationRef,
  );

  if (
    target === undefined ||
    target.category !== 'evidence' ||
    target.kind !== 'fulfillment_confirmation'
  ) {
    throw new Error(
      `'${intent.targetConfirmationRef}' 不是履约确认，无法抽象为能力角色。`,
    );
  }

  const { supporting } = intent;
  const socketRole: RoleEntityAST = {
    type: 'entity',
    category: 'role',
    kind: 'evidence',
    id: intent.socket.id,
    label: intent.socket.label,
    contextRef: target.contextRef,
    notes:
      '核心合同依赖的履约能力插槽：由其他合同上下文中的真实凭证扮演，角色本身没有责任人与实例。',
  };

  const supportingContext = {
    type: 'entity' as const,
    category: 'context' as const,
    kind: 'contract' as const,
    id: supporting.context.id,
    label: supporting.context.label,
    notes: '独立于核心合同的支撑合同边界，用于隔离履约能力的变化点。',
  };

  const provider: RoleEntityAST = {
    type: 'entity',
    category: 'role',
    kind: 'party',
    id: supporting.provider.id,
    label: supporting.provider.label,
    contextRef: supporting.context.id,
  };
  const consumer: RoleEntityAST = {
    type: 'entity',
    category: 'role',
    kind: 'party',
    id: supporting.consumer.id,
    label: supporting.consumer.label,
    contextRef: supporting.context.id,
  };
  const supportingContract: EvidenceEntityAST = {
    type: 'entity',
    category: 'evidence',
    kind: 'contract',
    id: supporting.contract.id,
    label: supporting.contract.label,
    contextRef: supporting.context.id,
    roleRefs: [supporting.provider.id, supporting.consumer.id],
    attributes: [signedAt(supporting.contract.signedAtMeaning)],
  };

  // The supporting contract owns the pair the capability really comes from:
  // the consumer asks, the provider confirms.
  const pair = pairInput({
    contextRef: supporting.context.id,
    request: {
      id: supporting.request.id,
      label: supporting.request.label,
      responsibleRoleRef: supporting.consumer.id,
      ...(supporting.request.window === undefined
        ? {}
        : { window: supporting.request.window }),
    },
    confirmation: {
      id: supporting.confirmation.id,
      label: supporting.confirmation.label,
      responsibleRoleRef: supporting.provider.id,
    },
    contractRef: supporting.contract.id,
  });

  return {
    commands: [
      { type: 'create-entity', entity: socketRole },
      { type: 'create-entity', entity: supportingContext },
      { type: 'create-entity', entity: provider },
      { type: 'create-entity', entity: consumer },
      { type: 'create-contract', entity: supportingContract },
      { type: 'create-fulfillment-pair', input: pair },
      {
        type: 'create-relationship',
        relationship: {
          type: 'relationship',
          id: `relation.${target.id}-uses-${intent.socket.id}`,
          kind: 'references',
          sourceRef: target.id,
          targetRef: intent.socket.id,
          label: '确认引用履约能力角色',
          sourceCardinality: { min: 1, max: 1 },
          targetCardinality: { min: 1, max: 1 },
        },
      },
      {
        type: 'create-relationship',
        relationship: {
          type: 'relationship',
          id: `relation.${supporting.confirmation.id}-plays-${intent.socket.id}`,
          kind: 'plays_role',
          sourceRef: supporting.confirmation.id,
          targetRef: intent.socket.id,
          label: '外部履约确认扮演能力角色',
        },
      },
    ],
    createdIds: [
      intent.socket.id,
      supporting.context.id,
      supporting.provider.id,
      supporting.consumer.id,
      supporting.contract.id,
      supporting.request.id,
      supporting.confirmation.id,
    ],
  };
};
