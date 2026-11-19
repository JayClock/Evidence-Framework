import type {
  AttributeAST,
  DomainModelDocument,
  EvidenceEntityAST,
  RoleEntityAST,
  FulfillmentPairIntent,
  BreachCompensationIntent,
  RoleInversionIntent,
  DomainCalculatorIntent,
} from '@evidence-poc/evidence-schema';

export type {
  FulfillmentPairIntent,
  BreachCompensationIntent,
  RoleInversionIntent,
  DomainCalculatorIntent,
} from '@evidence-poc/evidence-schema';

import { createDomainGraph } from '../model/graph.js';
import { timeoutExpressionFor } from '../model/fulfillmentTime.js';
import type { CreateFulfillmentPairInput } from './fulfillmentMutations.js';
import { createFulfillmentPairMutator } from './fulfillmentMutations.js';
import {
  createEntityMutator,
  createContractMutator,
} from './entityMutations.js';
import { createRelationshipMutator } from './relationshipMutations.js';
import { bindBreachRuleMutator } from './fulfillmentPairMutations.js';
import { addAttributeMutator } from './attributeMutations.js';
import { bindDerivedRuleMutator } from './derivationMutations.js';

export interface OperatorResult {
  createdIds: readonly string[];
}

const timestamp = (
  role: import('@evidence-poc/evidence-schema').TimeRole,
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
  timeRole: role,
});

const startedAt = (window: string | undefined): AttributeAST =>
  timestamp(
    'start',
    'started_at',
    '发起时间',
    window === undefined
      ? '权利方发起履约请求的业务时间。'
      : `权利方发起履约请求的业务时间；约定窗口为${window}。`,
  );

const expiredAt = (window: string | undefined): AttributeAST =>
  timestamp(
    'deadline',
    'expired_at',
    '履约截止时间',
    window === undefined
      ? '权利方要求的履约时限终点，由合同条款确定。'
      : `权利方要求的履约时限终点，取发起时间加${window}。`,
  );

const confirmedAt = (label: string): AttributeAST =>
  timestamp(
    'occurrence',
    'confirmed_at',
    '确认时间',
    `${label}形成时的业务时间。`,
  );

const createdAt = (label: string): AttributeAST =>
  timestamp(
    'occurrence',
    'created_at',
    '形成时间',
    `${label}形成时的业务时间。`,
  );

const signedAt = (meaning: string | undefined): AttributeAST =>
  timestamp(
    'occurrence',
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
    attributes: [startedAt(request.window), expiredAt(request.window)],
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

export const introduceFulfillmentPairMutator = (
  document: DomainModelDocument,
  intent: FulfillmentPairIntent,
): OperatorResult => {
  const rootContract = rootContractOf(document, intent.contextRef);

  if (intent.proof !== undefined) {
    const proof: EvidenceEntityAST = {
      type: 'entity',
      category: 'evidence',
      kind: 'other_evidence',
      id: intent.proof.id,
      label: intent.proof.label,
      contextRef: intent.contextRef,
      responsibleRoleRef:
        intent.proof.responsibleRoleRef ??
        intent.confirmation.responsibleRoleRef,
      attributes: [createdAt(intent.proof.label)],
    };

    createEntityMutator(document, proof);
  }

  createFulfillmentPairMutator(
    document,
    pairInput({
      contextRef: intent.contextRef,
      request: intent.request,
      confirmation: intent.confirmation,
      contractRef: rootContract?.id,
    }),
  );

  if (intent.proof !== undefined) {
    createRelationshipMutator(document, {
      type: 'relationship',
      id: `relation.${intent.confirmation.id}-uses-${intent.proof.id}`,
      kind: 'references',
      sourceRef: intent.confirmation.id,
      targetRef: intent.proof.id,
      label: '确认引用履约证明',
      sourceCardinality: { min: 1, max: 1 },
      targetCardinality: { min: 1, max: 1 },
    });
  }

  return {
    createdIds: [
      ...(intent.proof === undefined ? [] : [intent.proof.id]),
      intent.request.id,
      intent.confirmation.id,
    ],
  };
};

export const addBreachCompensationMutator = (
  document: DomainModelDocument,
  intent: BreachCompensationIntent,
): OperatorResult => {
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

  if (breaching.contextRef === undefined) {
    throw new Error('请先确定原履约请求所属的合同上下文。');
  }
  const pair = createDomainGraph(document).fulfillmentPair(breaching.id);
  const confirmation = pair?.confirmations.find(
    ({ id }) => id === intent.confirmationRef,
  );
  if (confirmation === undefined)
    throw new Error('所选凭证尚未关联到被违反的履约请求。');
  const expression =
    confirmation?.category === 'evidence' &&
    confirmation.kind === 'fulfillment_confirmation'
      ? timeoutExpressionFor(breaching, confirmation)
      : undefined;
  if (expression === undefined)
    throw new Error('请先确定原履约截止时间和确认时刻。');
  bindBreachRuleMutator(document, {
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
      expression,
      resultType: 'bool',
    },
  });
  const compensation = introduceFulfillmentPairMutator(document, {
    contextRef: breaching.contextRef,
    request: intent.request,
    confirmation: intent.confirmation,
    ...(intent.proof === undefined ? {} : { proof: intent.proof }),
  });
  const edge = createRelationshipMutator(document, {
    type: 'relationship',
    id: `relation.${intent.request.id}-compensates-${breaching.id}`,
    kind: 'references',
    flowKind: 'breach_compensation',
    sourceRef: intent.request.id,
    targetRef: breaching.id,
    label: '补偿原履约请求',
    notes: intent.condition,
  });
  return {
    createdIds: [
      `rule.${intent.requestRef}-breached`,
      ...compensation.createdIds,
      edge.id,
    ],
  };
};

export const roleifyAndInvertDependencyMutator = (
  document: DomainModelDocument,
  intent: RoleInversionIntent,
): OperatorResult => {
  const target = document.entities.find(
    (entity) => entity.id === intent.targetConfirmationRef,
  );

  if (
    target === undefined ||
    target.category !== 'evidence' ||
    target.kind !== 'fulfillment_confirmation'
  ) {
    const interval =
      target !== undefined &&
      target.category === 'evidence' &&
      target.kind !== 'fulfillment_confirmation';

    throw new Error(
      interval
        ? `'${intent.targetConfirmationRef}' 是时段凭证（${target.kind}），只表示尚未落定的履约窗口，不能扮演能力角色；请先为它补上对应的履约确认，再抽象该确认。`
        : `'${intent.targetConfirmationRef}' 不是履约确认，无法抽象为能力角色。`,
    );
  }

  if (target.contextRef === undefined) {
    throw new Error('请先确定履约确认所属的合同上下文。');
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

  createEntityMutator(document, socketRole);
  createEntityMutator(document, supportingContext);
  createEntityMutator(document, provider);
  createEntityMutator(document, consumer);
  createContractMutator(document, supportingContract);
  createFulfillmentPairMutator(document, pair);
  createRelationshipMutator(document, {
    type: 'relationship',
    id: `relation.${target.id}-uses-${intent.socket.id}`,
    kind: 'references',
    sourceRef: target.id,
    targetRef: intent.socket.id,
    label: '确认引用履约能力角色',
    sourceCardinality: { min: 1, max: 1 },
    targetCardinality: { min: 1, max: 1 },
  });
  createRelationshipMutator(document, {
    type: 'relationship',
    id: `relation.${supporting.confirmation.id}-plays-${intent.socket.id}`,
    kind: 'plays_role',
    sourceRef: supporting.confirmation.id,
    targetRef: intent.socket.id,
    label: '外部履约确认扮演能力角色',
  });
  return {
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

export const isolateDomainCalculatorMutator = (
  document: DomainModelDocument,
  intent: DomainCalculatorIntent,
): OperatorResult => {
  const host = document.entities.find(
    (entity) => entity.id === intent.host.ref,
  );

  if (host === undefined) {
    throw new Error(
      `未知的宿主对象 '${intent.host.ref}'，无法为它抽出领域计算。`,
    );
  }

  if (host.category === 'context') {
    throw new Error(`上下文 '${intent.host.ref}' 不能承载计算属性。`);
  }

  if (
    (host.attributes ?? []).some(
      (attribute) =>
        attribute.name === intent.host.attribute.name &&
        attribute.derivedByRuleRef !== undefined,
    )
  ) {
    throw new Error(
      `'${intent.host.ref}.${intent.host.attribute.name}' 已有派生规则，先用 update-attribute 解除再抽出计算。`,
    );
  }

  const createdIds: string[] = [];
  const existingContext = document.entities.find(
    (entity) => entity.id === intent.context.id,
  );

  if (existingContext === undefined) {
    createEntityMutator(document, {
      type: 'entity',
      category: 'context',
      kind: 'domain',
      id: intent.context.id,
      label: intent.context.label,
      rootRefs: [intent.calculator.id],
    });
    createdIds.push(intent.context.id);
  } else if (
    existingContext.category !== 'context' ||
    existingContext.kind !== 'domain'
  ) {
    throw new Error(
      `'${intent.context.id}' 不是领域上下文，计算不能放在那里。`,
    );
  }

  if (document.entities.some((entity) => entity.id === intent.calculator.id)) {
    throw new Error(
      `'${intent.calculator.id}' 已被占用，领域组件需要新的标识。`,
    );
  }

  createEntityMutator(document, {
    type: 'entity',
    category: 'participant',
    kind: 'thing',
    id: intent.calculator.id,
    label: intent.calculator.label,
    contextRef: intent.context.id,
    domainRole: intent.calculator.role ?? 'calculator',
    ...(intent.calculator.meaning === undefined
      ? {}
      : { notes: intent.calculator.meaning }),
    ...(intent.calculator.attributes === undefined
      ? {}
      : { attributes: intent.calculator.attributes }),
  });
  createdIds.push(intent.calculator.id);

  const hasAttribute = (host.attributes ?? []).some(
    (attribute) => attribute.name === intent.host.attribute.name,
  );

  if (!hasAttribute) {
    addAttributeMutator(document, host.id, intent.host.attribute);
    createdIds.push(`${host.id}.${intent.host.attribute.name}`);
  }

  const alias = intent.rule.alias ?? 'calculator';

  bindDerivedRuleMutator(document, {
    entityRef: host.id,
    attribute: intent.host.attribute.name,
    rule: {
      id: intent.rule.id,
      label: intent.rule.label,
      description: intent.rule.description,
      bindings: {
        [alias]: { ref: intent.calculator.id },
        [intent.hostAlias ?? 'host']: { ref: host.id },
        ...intent.bindings,
      },
      expression: intent.rule.expression,
      resultType: intent.rule.resultType,
    },
  });
  createdIds.push(intent.rule.id);

  return { createdIds };
};
