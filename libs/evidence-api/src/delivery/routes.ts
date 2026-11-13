import {
  EVIDENCE_TIME_ATTRIBUTE_NAMES,
  type AttributeAST,
  type DomainModelDocument,
  type RuleAST,
} from '@evidence-poc/evidence-schema';
import {
  createDomainGraph,
  type DomainGraph,
} from '@evidence-poc/evidence-model-core';

import {
  callerRoles,
  childShape,
  type UnaddressedRoute,
} from './addressing.js';
import {
  createSegmentAllocator,
  operationIdFor,
  rawSegmentOf,
  serviceIdOf,
} from './segments.js';

/**
 * The HTTP surface a modeled fulfillment implies.
 *
 * A fulfillment pair is already shaped like a route pair: a request is the
 * caller's intent and a confirmation is the answer that closes it. Projecting
 * them one-to-one keeps the contract honest — there is no endpoint that does not
 * correspond to a business moment, and no business moment reachable by editing a
 * table.
 *
 * What a caller may send is decided by the model, not by convenience: a derived
 * value has a rule, so the service computes it, and a business time is stamped
 * when the moment actually happens, so a caller cannot backdate one.
 */

/** Why an attribute is or is not part of the request body. */
export type DeliveryFieldReason = 'caller' | 'derived' | 'service-time';

/** One attribute as the contract describes it. */
export interface DeliveryField {
  name: string;
  label: string;
  valueType: string;
  required: boolean;
  reason: DeliveryFieldReason;
  meaning: string;
  /** Rule that produces the value, for a derived field. */
  ruleRef?: string;
  ruleExpression?: string;
}

export type DeliveryRouteMethod = 'GET' | 'POST';

/** Which business moment a route carries. */
export type DeliveryRoutePurpose =
  | 'sign'
  | 'read'
  | 'request'
  | 'confirm'
  | 'open'
  | 'propose';

export interface DeliveryRouteResponse {
  status: number;
  description: string;
  /** Object the body describes; absent for an empty body. */
  entityRef?: string;
}

export interface DeliveryRoute {
  id: string;
  operationId: string;
  method: DeliveryRouteMethod;
  path: string;
  purpose: DeliveryRoutePurpose;
  /** Service the route is served by. */
  serviceId: string;
  contextRef: string;
  /** Evidence or domain object the route acts on. */
  entityRef: string;
  contractRef: string | null;
  requestRef: string | null;
  confirmationRef: string | null;
  summary: string;
  /** Attributes the caller sends; everything else is the service's job. */
  fields: readonly DeliveryField[];
  derived: readonly DeliveryField[];
  stamped: readonly DeliveryField[];
  responses: readonly DeliveryRouteResponse[];
  shape: 'singleton' | 'collection';
  itemPath: string;
  allowedPartyRoleRefs: readonly string[];
  exposure: 'external' | 'internal';
  outputFields: readonly DeliveryField[];
  rules: readonly Pick<
    RuleAST,
    'id' | 'kind' | 'expression' | 'bindings' | 'target' | 'resultType'
  >[];
}

const timeAttributes = new Set<string>(EVIDENCE_TIME_ATTRIBUTE_NAMES);

/** How one attribute reaches the service. */
export const fieldFor = (
  attribute: AttributeAST,
  graph: DomainGraph,
  entityRef: string,
): DeliveryField => {
  const rule = graph.derivationRule(entityRef, attribute.name);
  const field: DeliveryField = {
    name: attribute.name,
    label: attribute.label,
    valueType: attribute.valueType ?? 'string',
    required: attribute.required === true,
    reason: 'caller',
    meaning: attribute.meaning,
  };

  if (rule !== undefined || attribute.derivedByRuleRef !== undefined) {
    return {
      ...field,
      reason: 'derived',
      ruleRef: rule?.id ?? attribute.derivedByRuleRef,
      ...(rule === undefined ? {} : { ruleExpression: rule.expression }),
    };
  }

  if (timeAttributes.has(attribute.name)) {
    return { ...field, reason: 'service-time' };
  }

  return field;
};

/** Classifies every attribute of one object once, in declaration order. */
const fieldsOf = (
  entityRef: string,
  graph: DomainGraph,
): {
  fields: DeliveryField[];
  derived: DeliveryField[];
  stamped: DeliveryField[];
} => {
  const classified = graph
    .attributesOf(entityRef)
    .map((attribute) => fieldFor(attribute, graph, entityRef));

  return {
    fields: classified.filter((field) => field.reason === 'caller'),
    derived: classified.filter((field) => field.reason === 'derived'),
    stamped: classified.filter((field) => field.reason === 'service-time'),
  };
};

/**
 * Which enquiry each proposal answers, when the model says so.
 *
 * The reference is the only authority here: a proposal nested under the wrong
 * window would misdescribe when its price was true.
 */
const answeredRfpOf = (graph: DomainGraph): Map<string, string> => {
  const answered = new Map<string, string>();

  for (const relationship of graph.relationships()) {
    if (relationship.kind !== 'references') {
      continue;
    }

    const target = graph.getEntity(relationship.targetRef);

    if (target?.category === 'evidence' && target.kind === 'rfp') {
      answered.set(relationship.sourceRef, target.id);
    }
  }

  return answered;
};

/**
 * Every route one model implies, in Context order.
 *
 * The order is derived from the model (Contexts sorted by id, each Context's
 * objects sorted by id) so two projections diff cleanly and a reviewer can match
 * a line to an object.
 */
export const buildDeliveryRoutes = (
  document: DomainModelDocument,
  contextRefs?: ReadonlySet<string>,
): DeliveryRoute[] => {
  const graph = createDomainGraph(document);
  const segments = createSegmentAllocator(
    graph.entities().map((entity) => entity.id),
  );
  const routes: UnaddressedRoute[] = [];
  const contexts = graph
    .entities()
    .filter(
      (entity) =>
        entity.category === 'context' &&
        (contextRefs === undefined || contextRefs.has(entity.id)),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const context of contexts) {
    const serviceId = serviceIdOf(context.id);
    const lane = rawSegmentOf(context.id);

    if (context.kind === 'contract') {
      const contract = graph.rootContractOf(context.id);

      if (contract !== undefined) {
        const contractSegment = segments.segmentOf(contract.id);
        const contractFields = fieldsOf(contract.id, graph);

        routes.push({
          id: `route.sign.${contract.id}`,
          operationId: operationIdFor('sign', contract.id),
          method: 'POST',
          path: `/${lane}/${contractSegment}`,
          purpose: 'sign',
          serviceId,
          contextRef: context.id,
          entityRef: contract.id,
          contractRef: contract.id,
          requestRef: null,
          confirmationRef: null,
          summary: `签署${contract.label}，双方权责自此成立`,
          ...contractFields,
          responses: [
            {
              status: 201,
              description: '协议已签署',
              entityRef: contract.id,
            },
            { status: 422, description: '条款缺失或双方角色不成立' },
          ],
        });

        routes.push({
          id: `route.read.${contract.id}`,
          operationId: operationIdFor('read', contract.id),
          method: 'GET',
          path: `/${lane}/${contractSegment}/{contractId}`,
          purpose: 'read',
          serviceId,
          contextRef: context.id,
          entityRef: contract.id,
          contractRef: contract.id,
          requestRef: null,
          confirmationRef: null,
          summary: `读取${contract.label}及其全部履约状态`,
          fields: [],
          derived: contractFields.derived,
          stamped: contractFields.stamped,
          responses: [
            {
              status: 200,
              description: '协议与履约全貌',
              entityRef: contract.id,
            },
            { status: 404, description: '协议不存在' },
          ],
        });
      }

      for (const pair of graph.fulfillmentPairs()) {
        if (pair.request.contextRef !== context.id) {
          continue;
        }

        const requestSegment = segments.segmentOf(pair.request.id);
        const contractRef = contract?.id ?? null;
        const contractPart =
          contractRef === null
            ? `/${lane}`
            : `/${lane}/${segments.segmentOf(contractRef)}/{contractId}`;
        const requestFields = fieldsOf(pair.request.id, graph);

        routes.push({
          id: `route.request.${pair.request.id}`,
          operationId: operationIdFor('request', pair.request.id),
          method: 'POST',
          path: `${contractPart}/${requestSegment}/requests`,
          purpose: 'request',
          serviceId,
          contextRef: context.id,
          entityRef: pair.request.id,
          contractRef,
          requestRef: pair.request.id,
          confirmationRef: null,
          summary: `发起${pair.request.label}，开启一个有截止时间的履约窗口`,
          ...requestFields,
          responses: [
            {
              status: 201,
              description: '履约请求已登记，等待确认',
              entityRef: pair.request.id,
            },
            { status: 409, description: '同一合同已有未关闭的同类请求' },
          ],
        });

        routes.push({
          id: `route.ledger.${pair.request.id}`,
          operationId: operationIdFor('read', `${pair.request.id}.ledger`),
          method: 'GET',
          path: `${contractPart}/${requestSegment}`,
          purpose: 'read',
          serviceId,
          contextRef: context.id,
          entityRef: pair.request.id,
          contractRef,
          requestRef: pair.request.id,
          confirmationRef: null,
          summary: `读取${pair.request.label}的请求与确认账本`,
          fields: [],
          derived: requestFields.derived,
          stamped: requestFields.stamped,
          responses: [
            {
              status: 200,
              description: '履约请求、确认与证明',
              entityRef: pair.request.id,
            },
            { status: 404, description: '合同或履约项不存在' },
          ],
        });

        for (const confirmation of pair.confirmations) {
          const confirmationFields = fieldsOf(confirmation.id, graph);

          routes.push({
            id: `route.confirm.${confirmation.id}`,
            operationId: operationIdFor('confirm', confirmation.id),
            method: 'POST',
            path: `${contractPart}/${requestSegment}/requests/{requestId}/confirmations/${segments.segmentOf(confirmation.id)}`,
            purpose: 'confirm',
            serviceId,
            contextRef: context.id,
            entityRef: confirmation.id,
            contractRef,
            requestRef: pair.request.id,
            confirmationRef: confirmation.id,
            summary: `登记${confirmation.label}，关闭对应的履约请求`,
            ...confirmationFields,
            responses: [
              {
                status: 201,
                description: '确认已登记，请求关闭',
                entityRef: confirmation.id,
              },
              { status: 409, description: '请求已过期或已由其他确认关闭' },
              { status: 422, description: '确认内容与请求不匹配' },
            ],
          });
        }
      }

      continue;
    }

    if (context.kind === 'pre_contract') {
      const members = graph
        .entitiesInContext(context.id)
        .filter(
          (entity) =>
            entity.category === 'evidence' &&
            (entity.kind === 'rfp' || entity.kind === 'proposal'),
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      const rfps = members.filter((entity) => entity.kind === 'rfp');
      const proposals = members.filter((entity) => entity.kind === 'proposal');
      const answeredBy = answeredRfpOf(graph);

      for (const rfp of rfps) {
        const rfpSegment = segments.segmentOf(rfp.id);
        const rfpFields = fieldsOf(rfp.id, graph);

        routes.push({
          id: `route.open.${rfp.id}`,
          operationId: operationIdFor('open', rfp.id),
          method: 'POST',
          path: `/${lane}/${rfpSegment}`,
          purpose: 'open',
          serviceId,
          contextRef: context.id,
          entityRef: rfp.id,
          contractRef: null,
          requestRef: null,
          confirmationRef: null,
          summary: `发起${rfp.label}，向对方征询方案`,
          ...rfpFields,
          responses: [
            {
              status: 201,
              description: '征询已登记',
              entityRef: rfp.id,
            },
          ],
        });

        routes.push({
          id: `route.read.${rfp.id}`,
          operationId: operationIdFor('read', rfp.id),
          method: 'GET',
          path: `/${lane}/${rfpSegment}/{rfpId}`,
          purpose: 'read',
          serviceId,
          contextRef: context.id,
          entityRef: rfp.id,
          contractRef: null,
          requestRef: null,
          confirmationRef: null,
          summary: `读取${rfp.label}及其收到的方案`,
          fields: [],
          derived: rfpFields.derived,
          stamped: rfpFields.stamped,
          responses: [
            { status: 200, description: '征询与方案', entityRef: rfp.id },
            { status: 404, description: '征询不存在' },
          ],
        });
      }

      for (const proposal of proposals) {
        const proposalFields = fieldsOf(proposal.id, graph);
        const rfp = rfps.find(
          (candidate) => candidate.id === answeredBy.get(proposal.id),
        );
        // A proposal the model does not tie to an enquiry still has a business
        // moment; it answers no particular window, so it sits at the lane root
        // rather than being nested under a guess.
        const path =
          rfp === undefined
            ? `/${lane}/${segments.segmentOf(proposal.id)}`
            : `/${lane}/${segments.segmentOf(rfp.id)}/{rfpId}/${segments.segmentOf(proposal.id)}`;

        routes.push({
          id: `route.propose.${proposal.id}`,
          operationId: operationIdFor('propose', proposal.id),
          method: 'POST',
          path,
          purpose: 'propose',
          serviceId,
          contextRef: context.id,
          entityRef: proposal.id,
          contractRef: null,
          requestRef: null,
          confirmationRef: null,
          summary:
            rfp === undefined
              ? `提交${proposal.label}（模型未声明所属征询）`
              : `提交${proposal.label}，回应${rfp.label}`,
          ...proposalFields,
          responses: [
            {
              status: 201,
              description: '方案已登记',
              entityRef: proposal.id,
            },
            { status: 409, description: '征询已关闭' },
          ],
        });
      }

      continue;
    }

    // A Domain Context is where a question is answered, so it is read, never
    // written: a caller asks for the current answer instead of setting one.
    for (const thing of graph
      .entitiesInContext(context.id)
      .filter(
        (entity) =>
          entity.category === 'participant' && entity.kind === 'thing',
      )
      .sort((left, right) => left.id.localeCompare(right.id))) {
      const thingFields = fieldsOf(thing.id, graph);

      routes.push({
        id: `route.read.${thing.id}`,
        operationId: operationIdFor('read', thing.id),
        method: 'GET',
        path: `/${lane}/${segments.segmentOf(thing.id)}`,
        purpose: 'read',
        serviceId,
        contextRef: context.id,
        entityRef: thing.id,
        contractRef: null,
        requestRef: null,
        confirmationRef: null,
        summary: `读取${thing.label}的当前结论`,
        fields: [],
        derived: thingFields.derived,
        stamped: thingFields.stamped,
        responses: [
          { status: 200, description: '领域结论', entityRef: thing.id },
        ],
      });
    }
  }

  const requestPaths = new Map<string, { path: string; itemPath: string }>();
  for (const route of routes.filter((item) => item.purpose === 'request')) {
    const shape =
      route.contractRef === null
        ? 'collection'
        : childShape(graph, route.contractRef, route.entityRef);
    const path = route.path.replace(/\/requests$/, '/request');
    requestPaths.set(route.entityRef, {
      path,
      itemPath: shape === 'singleton' ? path : `${path}/{requestId}`,
    });
  }
  return routes
    .map<DeliveryRoute>((route) => {
      let path = route.path;
      let shape: DeliveryRoute['shape'] = 'collection';
      let itemPath = route.method === 'GET' ? path : `${path}/{evidenceId}`;
      const request = requestPaths.get(route.requestRef ?? '');
      if (route.purpose === 'request' && request !== undefined) {
        path = request.path;
        itemPath = request.itemPath;
        shape = path === itemPath ? 'singleton' : 'collection';
      } else if (route.purpose === 'confirm' && request !== undefined) {
        const confirmations =
          graph.fulfillmentPair(route.requestRef!)?.confirmations ?? [];
        path = `${request.itemPath}/confirmation${confirmations.length > 1 ? `/${segments.segmentOf(route.entityRef)}` : ''}`;
        shape = childShape(graph, route.requestRef!, route.entityRef);
        itemPath = shape === 'singleton' ? path : `${path}/{confirmationId}`;
      } else if (route.purpose === 'propose') {
        const parent = answeredRfpOf(graph).get(route.entityRef);
        if (parent !== undefined)
          shape = childShape(graph, parent, route.entityRef);
        itemPath = shape === 'singleton' ? path : `${path}/{proposalId}`;
      } else if (route.purpose === 'sign') itemPath = `${path}/{contractId}`;
      else if (route.purpose === 'open') itemPath = `${path}/{rfpId}`;
      const allowedPartyRoleRefs = callerRoles(graph, route);
      return {
        ...route,
        path,
        itemPath,
        shape,
        allowedPartyRoleRefs,
        exposure: allowedPartyRoleRefs.length === 0 ? 'internal' : 'external',
        rules: graph
          .rules()
          .filter(
            (rule) =>
              rule.target?.entityRef === route.entityRef ||
              Object.values(rule.bindings).some(
                (binding) =>
                  'ref' in binding && binding.ref === route.entityRef,
              ),
          )
          .map(({ id, kind, expression, bindings, target, resultType }) => ({
            id,
            kind,
            expression,
            bindings,
            ...(target === undefined ? {} : { target }),
            resultType,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        outputFields: graph
          .attributesOf(route.entityRef)
          .map((attribute) => fieldFor(attribute, graph, route.entityRef)),
      };
    })
    .sort(compareRoutes);
};

export const compareRoutes = (a: DeliveryRoute, b: DeliveryRoute): number =>
  a.contextRef.localeCompare(b.contextRef) || a.id.localeCompare(b.id);
