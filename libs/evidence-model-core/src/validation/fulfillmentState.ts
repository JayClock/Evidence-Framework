import {
  isFulfillmentRequest,
  type AttributeAST,
  type DomainModelDocument,
  type EntityAST,
  type RuleBinding,
} from '@evidence-poc/evidence-schema';

import { fulfillmentResults } from './scope.js';
import type { FulfillmentStatus } from './validationSuite.js';

/**
 * What a simulated run knows about one instance while it changes.
 *
 * This is the shape both the end-of-scenario verdict and the step-by-step
 * replay read, so a request cannot be "completed" in one and "pending" in the
 * other for the same graph.
 */
export interface RuntimeInstance {
  id: string;
  entityRef: string;
  values: Record<string, unknown>;
  basedOn: readonly string[];
}

/** One evaluated rule, remembered so a breach or completion can be scoped later. */
export interface RuleResultRecord {
  result: unknown;
  instanceRefs: readonly string[];
}

export const attributesOf = (
  entity: EntityAST | undefined,
): Map<string, AttributeAST> =>
  new Map(
    (entity?.attributes ?? []).map((attribute) => [
      attribute.name,
      attribute,
    ] as const),
  );

export const entityOf = (
  model: DomainModelDocument,
  entityId: string | undefined,
): EntityAST | undefined =>
  entityId === undefined
    ? undefined
    : model.entities.find((entity) => entity.id === entityId);

/** True when `instanceRef` is, or was derived from, `ancestorRef`. */
export const descendsFrom = (
  instanceRef: string,
  ancestorRef: string,
  instances: ReadonlyMap<string, RuntimeInstance>,
  seen: ReadonlySet<string> = new Set<string>(),
): boolean => {
  if (instanceRef === ancestorRef) {
    return true;
  }

  const visited = new Set(seen);

  if (visited.has(instanceRef)) {
    return false;
  }

  visited.add(instanceRef);

  return (instances.get(instanceRef)?.basedOn ?? []).some((parent) =>
    descendsFrom(parent, ancestorRef, instances, visited),
  );
};

const scopedResults = (
  records: readonly RuleResultRecord[],
  requestInstanceRef: string,
  instances: ReadonlyMap<string, RuntimeInstance>,
): readonly unknown[] =>
  records
    .filter(
      (record) =>
        record.instanceRefs.length === 0 ||
        record.instanceRefs.some((ref) =>
          descendsFrom(ref, requestInstanceRef, instances),
        ),
    )
    .map((record) => record.result);

/**
 * What one request's Fulfillment status is, using only the issued graph.
 *
 * A breach wins over a completion, and a completion only counts when a related
 * confirmation was actually issued: a rule that evaluates true on a graph with
 * no result cannot complete anything.
 */
export const fulfillmentStatusOf = (
  model: DomainModelDocument,
  instances: ReadonlyMap<string, RuntimeInstance>,
  issued: ReadonlySet<string>,
  requestInstanceRef: string,
  ruleResults: ReadonlyMap<string, readonly RuleResultRecord[]>,
  manualCompletions: ReadonlySet<string>,
): FulfillmentStatus => {
  const requestInstance = instances.get(requestInstanceRef);

  if (requestInstance === undefined || !issued.has(requestInstanceRef)) {
    return 'not_requested';
  }

  const requestEntity = entityOf(model, requestInstance.entityRef);

  if (requestEntity === undefined || !isFulfillmentRequest(requestEntity)) {
    return 'not_requested';
  }

  const results = fulfillmentResults(model, requestEntity.id);
  const confirmationTypes = new Set(results.confirmations.map((item) => item.id));

  for (const role of results.roles) {
    for (const relationship of model.relationships) {
      if (
        relationship.kind === 'plays_role' &&
        relationship.targetRef === role.id
      ) {
        confirmationTypes.add(relationship.sourceRef);
      }
    }
  }

  const relatedConfirmations = [...issued].filter((instanceRef) => {
    const instance = instances.get(instanceRef);

    return (
      instance !== undefined &&
      confirmationTypes.has(instance.entityRef) &&
      descendsFrom(instanceRef, requestInstanceRef, instances)
    );
  });

  if (manualCompletions.has(requestInstanceRef)) {
    return 'completed';
  }

  const contextRef =
    'contextRef' in requestEntity ? requestEntity.contextRef : undefined;
  const rules = model.rules.filter(
    (rule) =>
      rule.contextRef === contextRef &&
      (rule.kind === 'completion' || rule.kind === 'breach') &&
      Object.values(rule.bindings).some(
        (binding: RuleBinding) =>
          'ref' in binding && binding.ref === requestEntity.id,
      ),
  );

  for (const rule of rules) {
    if (rule.kind !== 'breach') {
      continue;
    }

    const scoped = scopedResults(
      ruleResults.get(rule.id) ?? [],
      requestInstanceRef,
      instances,
    );

    if (scoped.some((result) => Boolean(result))) {
      return 'breached';
    }
  }

  const completionRules = rules.filter((rule) => rule.kind === 'completion');

  if (completionRules.length > 0) {
    if (relatedConfirmations.length === 0) {
      return 'pending';
    }

    for (const rule of completionRules) {
      const scoped = scopedResults(
        ruleResults.get(rule.id) ?? [],
        requestInstanceRef,
        instances,
      );

      if (scoped.some((result) => Boolean(result))) {
        return 'completed';
      }
    }

    return 'pending';
  }

  return relatedConfirmations.length > 0 ? 'completed' : 'pending';
};
