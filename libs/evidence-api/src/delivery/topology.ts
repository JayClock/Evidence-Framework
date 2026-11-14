import type {
  ContextEntityAST,
  DomainModelDocument,
  EntityAST,
} from '@evidence-poc/evidence-schema';
import {
  createDomainGraph,
  type DomainGraph,
} from '@evidence-poc/evidence-model-core';

import { rawSegmentOf, serviceIdOf } from './segments.js';

/**
 * The services a model splits into, and how they talk.
 *
 * The boundary is the Contract Context, not the noun. Splitting by table would
 * put one agreement's request and confirmation in two services and make every
 * close a distributed transaction; splitting by Context keeps each promise and
 * its answer together. What crosses a boundary is a document, never a row: a
 * signature, an external confirmation, a domain answer.
 *
 * Four kinds cover the whole model:
 *
 * - `channel` — the pre-contract Context: enquiry and quote. High churn, high
 *   concurrency, no legal force until the contract is signed.
 * - `fulfillment` — the Contract Context: strict, auditable, and the only place
 *   a fulfillment pair is closed.
 * - `domain` — where a calculation or a check lives, read by the others.
 * - `capability` — a Contract Context that answers a socket another contract
 *   depends on, so a payment channel or a carrier can be replaced without
 *   touching the agreement that needs it.
 */

export type DeliveryServiceKind =
  | 'channel'
  | 'fulfillment'
  | 'domain'
  | 'capability';

export interface DeliveryService {
  id: string;
  name: string;
  kind: DeliveryServiceKind;
  contextRef: string;
  /** Path segment the Context's routes hang under. */
  lane: string;
  /** Root objects the Context declares. */
  rootRefs: readonly string[];
  /** Evidence kinds the Context holds, for a reader skimming the topology. */
  evidenceRefs: readonly string[];
  /** Capability sockets this Context answers for other Contexts. */
  supplies: readonly string[];
  /** Sockets the Context depends on but does not own. */
  consumes: readonly string[];
  notes: string;
}

export type DeliveryLinkMode = 'sync' | 'async';

export interface DeliveryLink {
  id: string;
  from: string;
  to: string;
  /** `signs`, `capability` or `reads`. */
  kind: 'signs' | 'capability' | 'reads';
  mode: DeliveryLinkMode;
  label: string;
  /** Object that carries the message: a contract, a confirmation, a thing. */
  viaRef: string;
}

export interface DeliveryTopology {
  services: readonly DeliveryService[];
  links: readonly DeliveryLink[];
}

const contextOf = (
  graph: DomainGraph,
  entity: EntityAST,
): ContextEntityAST | undefined => {
  const contextRef = 'contextRef' in entity ? entity.contextRef : undefined;

  return contextRef === undefined
    ? undefined
    : (graph.getEntity(contextRef) as ContextEntityAST | undefined);
};

/**
 * A Contract Context that supplies another Context's capability socket.
 *
 * The model already says this: a `role` of kind `evidence` is the socket, and a
 * confirmation from another Context plays it. Nothing has to be declared twice.
 */
const socketSupplies = (
  graph: DomainGraph,
): Map<string, { socketRef: string; consumerContextRef: string }[]> => {
  const supplies = new Map<
    string,
    { socketRef: string; consumerContextRef: string }[]
  >();

  for (const relationship of graph.relationships()) {
    if (relationship.kind !== 'plays_role') {
      continue;
    }

    const socket = graph.getEntity(relationship.targetRef);
    const player = graph.getEntity(relationship.sourceRef);

    if (socket?.category !== 'role' || socket.kind !== 'evidence') {
      continue;
    }

    if (player === undefined) {
      continue;
    }

    const supplier = contextOf(graph, player);

    if (supplier === undefined || supplier.id === socket.contextRef) {
      continue;
    }

    const bucket = supplies.get(supplier.id) ?? [];
    bucket.push({
      socketRef: socket.id,
      consumerContextRef: socket.contextRef,
    });
    supplies.set(supplier.id, bucket);
  }

  return supplies;
};

/** Domain Contexts a Context's rules or references reach into. */
const domainReads = (
  graph: DomainGraph,
  contextId: string,
): { domainContextRef: string; viaRef: string }[] => {
  const found = new Map<string, string>();
  const domainOf = (entityId: string): string | undefined => {
    const entity = graph.getEntity(entityId);

    if (entity === undefined) {
      return undefined;
    }

    const context = contextOf(graph, entity);

    return context?.kind === 'domain' ? context.id : undefined;
  };

  for (const rule of graph.rulesInContext(contextId)) {
    for (const binding of Object.values(rule.bindings)) {
      if (!('ref' in binding) || typeof binding.ref !== 'string') {
        continue;
      }

      const domainRef = domainOf(binding.ref);

      if (domainRef !== undefined && !found.has(domainRef)) {
        found.set(domainRef, binding.ref);
      }
    }
  }

  for (const entity of graph.entitiesInContext(contextId)) {
    for (const relationship of graph.outgoing(entity.id)) {
      if (relationship.kind !== 'references') {
        continue;
      }

      const domainRef = domainOf(relationship.targetRef);

      if (domainRef !== undefined && !found.has(domainRef)) {
        found.set(domainRef, relationship.targetRef);
      }
    }
  }

  return [...found.entries()].map(([domainContextRef, viaRef]) => ({
    domainContextRef,
    viaRef,
  }));
};

const notesFor = (
  kind: DeliveryServiceKind,
  context: ContextEntityAST,
  supplied: number,
): string => {
  switch (kind) {
    case 'channel':
      return '合同前上下文：并发高、无需强一致；签约后单向触发核心履约，不回写渠道状态。';
    case 'domain':
      return '领域上下文：只回答计算与检查，不持有履约账本，可被多个合同上下文复用。';
    case 'capability':
      return '能力支撑上下文：以确认凭证扮演其他合同的履约能力插槽，供应商可整体替换。';
    default:
      return supplied > 0
        ? '合同上下文：既关闭自己的履约项，也为其他合同提供能力确认。'
        : '合同上下文：拥有独立的履约账本，异常走补偿履约而非回滚。';
  }
};

/**
 * Projects the services and their links.
 *
 * A Context becomes exactly one service. A Contract Context that answers another
 * Context's socket becomes a `capability` service, because that is the reason it
 * exists: the core agreement must be able to swap it.
 */
export const buildDeliveryTopology = (
  document: DomainModelDocument,
): DeliveryTopology => {
  const graph = createDomainGraph(document);
  const supplies = socketSupplies(graph);
  const services: DeliveryService[] = [];
  const links: DeliveryLink[] = [];

  const contexts = graph
    .entities()
    .filter((entity) => entity.category === 'context')
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const context of contexts) {
    const supplied = supplies.get(context.id) ?? [];
    const kind: DeliveryServiceKind =
      supplied.length > 0
        ? 'capability'
        : context.kind === 'pre_contract'
          ? 'channel'
          : context.kind === 'domain'
            ? 'domain'
            : 'fulfillment';
    const members = graph.entitiesInContext(context.id);
    const consumes = members
      .filter(
        (entity) =>
          entity.category === 'role' &&
          entity.kind === 'evidence' &&
          supplied.every((entry) => entry.socketRef !== entity.id),
      )
      .map((entity) => entity.id)
      .sort();

    services.push({
      id: serviceIdOf(context.id),
      name: context.label,
      kind,
      contextRef: context.id,
      lane: rawSegmentOf(context.id),
      rootRefs: [...(context.rootRefs ?? [])].sort(),
      evidenceRefs: members
        .filter((entity) => entity.category === 'evidence')
        .map((entity) => entity.id)
        .sort(),
      supplies: [...new Set(supplied.map((entry) => entry.socketRef))].sort(),
      consumes,
      notes: notesFor(kind, context, supplied.length),
    });

    if (kind === 'capability') {
      for (const entry of supplied) {
        const socket = graph.getEntity(entry.socketRef);

        links.push({
          id: `link.capability.${context.id}.${entry.socketRef}`,
          from: serviceIdOf(context.id),
          to: serviceIdOf(entry.consumerContextRef),
          kind: 'capability',
          // The confirmation is produced by the supplier's own clock and arrives
          // as a callback; making it synchronous would reintroduce the coupling
          // the socket removed.
          mode: 'async',
          label: `扮演${socket?.label ?? entry.socketRef}`,
          viaRef: entry.socketRef,
        });
      }
    }

    for (const read of domainReads(graph, context.id)) {
      links.push({
        id: `link.reads.${context.id}.${read.domainContextRef}`,
        from: serviceIdOf(context.id),
        to: serviceIdOf(read.domainContextRef),
        kind: 'reads',
        mode: 'sync',
        label: '读取领域结论',
        viaRef: read.viaRef,
      });
    }

    if (
      context.kind === 'pre_contract' &&
      context.parentContextRef !== undefined
    ) {
      const contract = graph.rootContractOf(context.parentContextRef);

      links.push({
        id: `link.signs.${context.id}.${context.parentContextRef}`,
        from: serviceIdOf(context.id),
        to: serviceIdOf(context.parentContextRef),
        kind: 'signs',
        mode: 'sync',
        label:
          contract === undefined ? '签约后进入履约' : `签约${contract.label}`,
        viaRef: contract?.id ?? context.parentContextRef,
      });
    }
  }

  const uniqueLinks = new Map(links.map((link) => [link.id, link]));

  return {
    services,
    links: [...uniqueLinks.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
};
