import { fieldFor } from './fieldOrigin.js';
export { fieldFor } from './fieldOrigin.js';
import {
  type DomainModelDocument,
  type ModelExampleAST,
  type RuleAST,
} from '@evidence-poc/evidence-schema';
import {
  createDomainGraph,
  type DomainGraph,
} from '@evidence-poc/evidence-model-core';

import {
  callbackRoles,
  callerRoles,
  childShape,
  type UnaddressedRoute,
} from './addressing.js';
import {
  confirmationNounOf,
  createSegmentAllocator,
  operationIdFor,
  pluralSegmentOf,
  itemParameterOf,
  rawSegmentOf,
  serviceIdOf,
} from './segments.js';

/**
 * The HTTP surface a modeled fulfillment implies.
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

export type DeliveryExample = ModelExampleAST;

export const SHARED_REQUEST_IDS = 'request_ids';

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
  /** Request types whose instance IDs a shared creation accepts. */
  requestRefs?: readonly string[];
  confirmationRef: string | null;
  summary: string;
  /** Attributes the caller sends; everything else is the service's job. */
  fields: readonly DeliveryField[];
  derived: readonly DeliveryField[];
  stamped: readonly DeliveryField[];
  responses: readonly DeliveryRouteResponse[];
  shape: 'singleton' | 'collection';
  /** A collection read returns HAL summaries rather than one entity. */
  responseShape: 'item' | 'collection';
  /** HAL embedding name for collection responses. */
  collectionRel?: string;
  /** Path variables retain their modeled identity for acceptance captures. */
  parameterEntityRefs: Readonly<Record<string, string>>;
  itemPath: string;
  allowedPartyRoleRefs: readonly string[];
  /** Third-party delegates explicitly authorized to record this confirmation. */
  allowedCallbackRoleRefs?: readonly string[];
  exposure: 'external' | 'internal';
  outputFields: readonly DeliveryField[];
  /** Concrete values declared for the route's modeled entity. */
  examples: readonly DeliveryExample[];
  rules: readonly Pick<
    RuleAST,
    'id' | 'kind' | 'expression' | 'bindings' | 'target' | 'resultType'
  >[];
}

const examplesOf = (
  graph: DomainGraph,
  entityRef: string,
): readonly DeliveryExample[] => {
  const examples = graph.getEntity(entityRef)?.examples;
  return Array.isArray(examples)
    ? examples.filter(
        (example) =>
          example !== null &&
          typeof example === 'object' &&
          typeof example.label === 'string' &&
          example.value !== null &&
          typeof example.value === 'object' &&
          !Array.isArray(example.value),
      )
    : [];
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

/** Business addresses are independent of the Context that deploys them. */
export const buildDeliveryRoutes = (
  document: DomainModelDocument,
  contextRefs?: ReadonlySet<string>,
): DeliveryRoute[] => {
  const graph = createDomainGraph(document);
  const answeredBy = answeredRfpOf(graph);
  const confirmations = graph.fulfillmentConfirmations();
  const confirmationById = new Map(
    confirmations.map((entry) => [entry.entity.id, entry]),
  );
  const collectionRel = (ref: string) =>
    pluralSegmentOf(confirmationById.has(ref) ? confirmationNounOf(ref) : ref);
  const roots = graph
    .entities()
    .filter(
      (entity) =>
        (entity.category === 'evidence' &&
          (entity.kind === 'contract' ||
            entity.kind === 'rfp' ||
            entity.kind === 'fulfillment_confirmation' ||
            (entity.kind === 'proposal' && !answeredBy.has(entity.id)) ||
            (entity.kind === 'other_evidence' &&
              entity.attributes?.some((field) => field.valueType === 'id')))) ||
        (entity.category === 'participant' && entity.kind === 'thing'),
    );
  const rootSegments = createSegmentAllocator(
    roots.map((entity) => entity.id),
    collectionRel,
  );
  const routes: DeliveryRoute[] = [];
  type Address = {
    path: string;
    itemPath: string;
    shape: DeliveryRoute['shape'];
    parameterEntityRefs: Record<string, string>;
  };
  const address = (
    path: string,
    entityRef: string,
    shape: DeliveryRoute['shape'],
    parent?: Address,
    itemParameter = itemParameterOf(entityRef),
  ): Address => {
    let parameter = itemParameter;
    if (parent?.parameterEntityRefs[parameter] !== undefined)
      parameter = operationIdFor('item', entityRef) + 'Id';
    return {
      path,
      itemPath: shape === 'singleton' ? path : path + '/{' + parameter + '}',
      shape,
      parameterEntityRefs: {
        ...parent?.parameterEntityRefs,
        ...(shape === 'collection' ? { [parameter]: entityRef } : {}),
      },
    };
  };
  const add = (
    entityRef: string,
    contextRef: string,
    location: Address,
    purpose: DeliveryRoutePurpose,
    summary: string,
    refs: {
      contractRef?: string;
      requestRef?: string;
      requestRefs?: readonly string[];
      confirmationRef?: string;
    } = {},
    suffix?: string,
    primary?: Address,
  ): void => {
    const classified = fieldsOf(entityRef, graph);
    if (refs.requestRefs !== undefined) {
      classified.fields = [
        ...classified.fields.filter(({ name }) => name !== SHARED_REQUEST_IDS),
        {
          name: SHARED_REQUEST_IDS,
          label: '关联履约请求',
          valueType: 'list',
          required: true,
          reason: 'caller',
          meaning: '此共享凭证关联的履约请求实例 ID',
        },
      ];
    }
    const reading = purpose === 'read';
    const entity = graph.getEntity(entityRef);
    const accepted =
      purpose === 'request' &&
      entity?.category === 'evidence' &&
      entity.asyncAcceptance === true;
    const collectionRead = reading && suffix !== undefined;
    const item = primary ?? location;
    const route: UnaddressedRoute = {
      id: 'route.' + (suffix ?? purpose) + '.' + entityRef,
      operationId: operationIdFor(suffix ?? purpose, entityRef),
      method: reading ? 'GET' : 'POST',
      path: reading && !collectionRead ? location.itemPath : location.path,
      purpose,
      serviceId: serviceIdOf(contextRef),
      contextRef,
      entityRef,
      contractRef: refs.contractRef ?? null,
      requestRef: refs.requestRef ?? null,
      ...(refs.requestRefs === undefined
        ? {}
        : { requestRefs: refs.requestRefs }),
      confirmationRef: refs.confirmationRef ?? null,
      summary,
      ...classified,
      fields: reading ? [] : classified.fields,
      responses: [
        accepted
          ? {
              status: 202,
              description: '已受理处理；读取请求以跟踪结果',
              entityRef,
            }
          : { status: reading ? 200 : 201, description: summary, entityRef },
        ...(reading
          ? [{ status: 404, description: '资源不存在' }]
          : purpose === 'open'
            ? []
            : [
                { status: 409, description: '业务窗口已关闭或资源状态冲突' },
                { status: 422, description: '输入内容或业务角色不成立' },
              ]),
      ],
    };
    const allowedPartyRoleRefs = callerRoles(graph, route);
    const allowedCallbackRoleRefs = callbackRoles(graph, route);
    routes.push({
      ...route,
      shape: item.shape,
      itemPath: item.itemPath,
      responseShape: collectionRead ? 'collection' : 'item',
      ...(collectionRead ? { collectionRel: collectionRel(entityRef) } : {}),
      parameterEntityRefs: {
        ...location.parameterEntityRefs,
        ...item.parameterEntityRefs,
      },
      allowedPartyRoleRefs,
      ...(allowedCallbackRoleRefs.length === 0
        ? {}
        : { allowedCallbackRoleRefs }),
      exposure:
        allowedPartyRoleRefs.length + allowedCallbackRoleRefs.length === 0
          ? 'internal'
          : 'external',
      rules: graph
        .rules()
        .filter(
          (rule) =>
            rule.target?.entityRef === entityRef ||
            Object.values(rule.bindings).some(
              (binding) => 'ref' in binding && binding.ref === entityRef,
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
        .attributesOf(entityRef)
        .map((attribute) => fieldFor(attribute, graph, entityRef)),
      examples: examplesOf(graph, entityRef),
    });
  };
  const reads = (
    entityRef: string,
    contextRef: string,
    location: Address,
    refs: Parameters<typeof add>[5] = {},
    listId = 'list',
  ) => {
    add(entityRef, contextRef, location, 'read', '读取资源详情', refs);
    if (location.shape === 'collection')
      add(
        entityRef,
        contextRef,
        location,
        'read',
        '读取资源集合',
        refs,
        listId,
      );
  };
  const contexts = graph
    .entities()
    .filter((entity) => entity.category === 'context')
    .sort((a, b) => a.id.localeCompare(b.id));
  const requestAddresses = new Map<
    string,
    {
      child: Address;
      root: Address;
      contractRef: string;
      appendSegments: ReturnType<typeof createSegmentAllocator>;
    }
  >();
  // Allocate all addresses before scope filtering; a scoped export must keep the same URIs.
  for (const context of contexts) {
    if (context.kind === 'contract') {
      const contract = graph.rootContractOf(context.id);
      if (contract === undefined) continue;
      const root = address(
        '/' + rootSegments.segmentOf(contract.id),
        contract.id,
        'collection',
      );
      const contractRefs = { contractRef: contract.id };
      add(
        contract.id,
        context.id,
        root,
        'sign',
        '签署' + contract.label + '，双方权责自此成立',
        contractRefs,
      );
      reads(contract.id, context.id, root, contractRefs);
      const pairs = graph
        .fulfillmentPairs()
        .filter((pair) => pair.request.contextRef === context.id);
      const shapes = new Map(
        pairs.map(({ request }) => [
          request.id,
          childShape(graph, contract.id, request.id),
        ]),
      );
      const appended = pairs
        .filter(({ request }) => shapes.get(request.id) === 'singleton')
        .flatMap(({ confirmations }) => confirmations)
        .filter(
          ({ id }) =>
            confirmationById.get(id)?.topologyKind === 'exclusive_collection',
        );
      const segments = createSegmentAllocator(
        [
          ...pairs.map(({ request }) => request.id),
          ...appended.map(({ id }) => id),
        ],
        (id) =>
          confirmationById.has(id)
            ? rootSegments.segmentOf(id)
            : shapes.get(id) === 'collection'
              ? pluralSegmentOf(id)
              : rawSegmentOf(id),
      );
      for (const pair of pairs) {
        const shape = shapes.get(pair.request.id)!;
        const child = address(
          root.itemPath + '/' + segments.segmentOf(pair.request.id),
          pair.request.id,
          shape,
          root,
        );
        requestAddresses.set(pair.request.id, {
          child,
          root,
          contractRef: contract.id,
          appendSegments: segments,
        });
        const refs = { ...contractRefs, requestRef: pair.request.id };
        add(
          pair.request.id,
          context.id,
          child,
          'request',
          '发起' + pair.request.label + '，开启一个有截止时间的履约窗口',
          refs,
        );
        reads(pair.request.id, context.id, child, refs, 'ledger');
      }
      continue;
    }
    if (context.kind === 'pre_contract') {
      const members = graph
        .entitiesInContext(context.id)
        .filter((entity) => entity.category === 'evidence');
      const rfps = members.filter(
        (entity) =>
          entity.kind === 'rfp' &&
          (context.rootRefs === undefined ||
            context.rootRefs.includes(entity.id)),
      );
      const rfpAddresses = new Map<string, Address>();
      for (const rfp of rfps) {
        const root = address(
          '/' + rootSegments.segmentOf(rfp.id),
          rfp.id,
          'collection',
        );
        rfpAddresses.set(rfp.id, root);
        add(
          rfp.id,
          context.id,
          root,
          'open',
          '发起' + rfp.label + '，向对方征询方案',
        );
        reads(rfp.id, context.id, root);
      }
      const proposals = members.filter((entity) => entity.kind === 'proposal');
      const segments = createSegmentAllocator(
        proposals.map((entity) => entity.id),
      );
      for (const proposal of proposals) {
        const rfpRef = answeredBy.get(proposal.id);
        const parent = rfpAddresses.get(rfpRef ?? '');
        if (rfpRef !== undefined && parent === undefined) continue;
        const shape =
          parent === undefined
            ? 'collection'
            : childShape(graph, rfpRef!, proposal.id);
        const segment = segments.segmentOf(proposal.id);
        const child =
          parent === undefined
            ? address(
                '/' + rootSegments.segmentOf(proposal.id),
                proposal.id,
                shape,
              )
            : address(
                parent.itemPath +
                  '/' +
                  (shape === 'collection' ? pluralSegmentOf(segment) : segment),
                proposal.id,
                shape,
                parent,
              );
        add(
          proposal.id,
          context.id,
          child,
          'propose',
          parent === undefined
            ? '提交' + proposal.label + '（模型未声明所属征询）'
            : '提交' +
                proposal.label +
                '，回应' +
                graph.getEntity(rfpRef!)!.label,
        );
        reads(proposal.id, context.id, child);
        for (const edge of graph
          .outgoing(proposal.id)
          .concat(graph.incoming(proposal.id))) {
          if (edge.kind !== 'references' || edge.targetRef !== proposal.id)
            continue;
          const contract = graph.getEntity(edge.sourceRef);
          if (
            contract?.category !== 'evidence' ||
            contract.kind !== 'contract' ||
            contract.contextRef === undefined
          )
            continue;
          const primary = address(
            '/' + rootSegments.segmentOf(contract.id),
            contract.id,
            'collection',
          );
          const sign = address(
            child.itemPath + '/' + rootSegments.segmentOf(contract.id),
            contract.id,
            'collection',
            child,
          );
          // Signing executes in the contract service while retaining the proposal URI.
          add(
            contract.id,
            contract.contextRef,
            sign,
            'sign',
            '接受' + proposal.label + '并签署' + contract.label,
            { contractRef: contract.id },
            'sign-from-' + proposal.id,
            primary,
          );
        }
      }
      continue;
    }
    for (const thing of graph
      .entitiesInContext(context.id)
      .filter(
        (entity) =>
          entity.category === 'participant' &&
          entity.kind === 'thing' &&
          (context.rootRefs === undefined ||
            context.rootRefs.includes(entity.id)),
      )) {
      reads(
        thing.id,
        context.id,
        address('/' + rootSegments.segmentOf(thing.id), thing.id, 'collection'),
      );
    }
  }
  for (const { entity, incomingRequests, topologyKind } of confirmations) {
    const { id, contextRef, label } = entity;
    if (contextRef === undefined) continue;
    const refs = { confirmationRef: id };
    const segment = rootSegments.segmentOf(id);
    const parameter = operationIdFor('', confirmationNounOf(id)) + 'Id';
    const primary = address(
      '/' + segment,
      id,
      'collection',
      undefined,
      parameter,
    );
    const request = incomingRequests[0];
    if (topologyKind === 'shared') {
      const requestRefs = incomingRequests.map(({ id }) => id).sort();
      add(id, contextRef, primary, 'read', '读取资源详情', refs);
      add(id, contextRef, primary, 'confirm', '登记' + label, {
        ...refs,
        requestRefs,
      });
      for (const request of incomingRequests) {
        const parent = requestAddresses.get(request.id);
        if (parent === undefined || request.contextRef === undefined) continue;
        const reverse = address(
          parent.child.itemPath + '/' + segment,
          id,
          'collection',
          parent.child,
          parameter,
        );
        add(
          id,
          request.contextRef,
          reverse,
          'read',
          '追溯关联确认凭证',
          {
            ...refs,
            contractRef: parent.contractRef,
            requestRef: request.id,
          },
          'list-from-' + request.id,
          primary,
        );
      }
      continue;
    }
    const parent =
      request === undefined ? undefined : requestAddresses.get(request.id);
    const exclusiveRefs =
      parent === undefined
        ? refs
        : { ...refs, contractRef: parent.contractRef, requestRef: request!.id };
    add(id, contextRef, primary, 'read', '读取资源详情', exclusiveRefs);
    if (parent === undefined) continue;
    const append = topologyKind === 'exclusive_collection';
    const owner =
      append && parent.child.shape === 'singleton' ? parent.root : parent.child;
    let action = append ? segment : 'confirmation';
    if (append && owner === parent.root)
      action = parent.appendSegments.segmentOf(id);
    if (!append) {
      const siblings =
        graph
          .fulfillmentPair(request!.id)
          ?.confirmations.filter(
            ({ id }) =>
              confirmationById.get(id)?.topologyKind === 'exclusive_singleton',
          ) ?? [];
      if (siblings.length > 1)
        action +=
          '/' +
          createSegmentAllocator(siblings.map(({ id }) => id)).segmentOf(id);
    }
    const entrance = address(
      owner.itemPath + '/' + action,
      id,
      append ? 'collection' : 'singleton',
      owner,
      parameter,
    );
    add(
      id,
      contextRef,
      entrance,
      'confirm',
      '登记' + label,
      exclusiveRefs,
      undefined,
      primary,
    );
    if (append)
      add(
        id,
        contextRef,
        entrance,
        'read',
        '读取资源集合',
        exclusiveRefs,
        'list',
        primary,
      );
  }
  for (const entity of roots.filter(
    (entity) =>
      entity.category === 'evidence' && entity.kind === 'other_evidence',
  )) {
    if (entity.category === 'evidence' && entity.contextRef !== undefined)
      reads(
        entity.id,
        entity.contextRef,
        address(
          '/' + rootSegments.segmentOf(entity.id),
          entity.id,
          'collection',
        ),
      );
  }
  return routes
    .filter(
      (route) => contextRefs === undefined || contextRefs.has(route.contextRef),
    )
    .sort(compareRoutes);
};

export const compareRoutes = (a: DeliveryRoute, b: DeliveryRoute): number =>
  a.contextRef.localeCompare(b.contextRef) || a.id.localeCompare(b.id);
