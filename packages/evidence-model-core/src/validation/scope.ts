import {
  REQUIRED_EVIDENCE_TIME_ATTRIBUTES,
  type DomainModelDocument,
  type EntityAST,
  type RuleAST,
  entitySignature,
  isContextEntity,
  isFulfillmentRequest,
} from '@evidence-poc/evidence-schema';

import type { ValidationSuite } from './validationSuite.js';

/**
 * Responsibility scope, rebuilt from the single FM source.
 *
 * A scope is never persisted as a second model: it is the subset a delivery
 * consumes, derived on demand. Porting `fm_scope.py` keeps the three rules that
 * matter — a scope is always whole Contexts plus real outbound dependencies, a
 * shared Participant never drags in an unrelated Contract, and an unresolved
 * Context Role is retained rather than invented.
 */

type JsonObject = Record<string, unknown>;

/** Raised when the requested scopes do not name independent Contexts. */
export class ScopeSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeSelectionError';
  }
}

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every `*Ref`, `*Refs`, `ref` and `basedOn` value a document cites.
 *
 * Relationships carry their endpoints, rules carry their bindings and instances
 * carry their basis, so one walk covers all of them.
 */
export const referencesOf = (
  value: unknown,
  into: Set<string> = new Set<string>(),
): Set<string> => {
  if (Array.isArray(value)) {
    value.forEach((item) => referencesOf(item, into));

    return into;
  }

  if (!isRecord(value)) {
    return into;
  }

  for (const [key, item] of Object.entries(value)) {
    if ((key.endsWith('Ref') || key === 'ref') && typeof item === 'string') {
      into.add(item);
    } else if (
      (key.endsWith('Refs') || key === 'basedOn') &&
      Array.isArray(item)
    ) {
      item
        .filter((ref): ref is string => typeof ref === 'string')
        .forEach((ref) => into.add(ref));
    } else {
      referencesOf(item, into);
    }
  }

  return into;
};

/**
 * Every object a scope can contain, keyed by id.
 *
 * The walk in `fm_scope.py` treats entities, rules and relationships alike — an
 * object's Context is whichever of them owns it — so they share one map here and
 * the typed maps below only serve the projection at the end.
 */
const indexObjects = (
  model: DomainModelDocument,
): Map<string, JsonObject> =>
  new Map<string, JsonObject>(
    [
      ...model.entities,
      ...model.rules,
      ...model.relationships,
    ].map((item) => [item.id, item as unknown as JsonObject] as const),
  );

/** The Context an object belongs to, or undefined when it is not owned. */
const ownerContextOf = (
  objects: ReadonlyMap<string, JsonObject>,
  item: JsonObject,
): string | undefined =>
  item['category'] === 'context'
    ? String(item['id'])
    : typeof item['contextRef'] === 'string'
      ? item['contextRef']
      : undefined;

/**
 * Keeps whole independent Contexts, their descendants and real dependencies.
 *
 * A child stage or a Fulfillment cannot be selected to hide another obligation
 * of the same contract, and a Participant shared by two Contracts does not pull
 * the unrelated one in: only a non-Party source pulls its outbound references.
 */
export const selectScope = (
  model: DomainModelDocument,
  scopeRefs: readonly string[],
): DomainModelDocument => {
  const objects = indexObjects(model);
  const contexts = new Set<string>();
  const members = new Set<string>();

  const include = (ref: string): void => {
    const item = objects.get(ref);

    if (item === undefined) {
      return;
    }

    members.add(ref);

    let contextId = ownerContextOf(objects, item);
    let guard = 0;

    while (contextId !== undefined && !contexts.has(contextId) && guard < 64) {
      contexts.add(contextId);
      const context = objects.get(contextId);
      contextId =
        context === undefined ? undefined : (context['parentContextRef'] as string | undefined);
      guard += 1;
    }
  };

  if (scopeRefs.length === 0 || new Set(scopeRefs).size !== scopeRefs.length) {
    throw new ScopeSelectionError(
      'scopeRefs must contain distinct independent Context IDs',
    );
  }

  for (const ref of scopeRefs) {
    const context = model.entities.find((entity) => entity.id === ref);

    if (
      context === undefined ||
      !isContextEntity(context) ||
      context.parentContextRef !== undefined
    ) {
      throw new ScopeSelectionError(
        `scope '${ref}' must be an independent Context, not a fulfillment slice`,
      );
    }

    include(ref);
  }

  let previous: string | null = null;
  let relations: DomainModelDocument['relationships'] = [];

  for (;;) {
    const snapshot = `${[...members].sort().join(',')}|${[...contexts].sort().join(',')}`;

    if (snapshot === previous) {
      break;
    }

    previous = snapshot;

    for (const [ref, item] of objects) {
      const ownerContext = item['contextRef'];
      const parentContext = item['parentContextRef'];

      if (
        contexts.has(ref) ||
        (typeof ownerContext === 'string' && contexts.has(ownerContext)) ||
        (typeof parentContext === 'string' && contexts.has(parentContext))
      ) {
        include(ref);
      }
    }

    for (const ref of [...members]) {
      const item = objects.get(ref);

      if (item !== undefined) {
        referencesOf(item).forEach(include);
      }
    }

    relations = [];

    for (const relation of model.relationships) {
      const source = model.entities.find((entity) => entity.id === relation.sourceRef);
      const outgoing =
        members.has(relation.sourceRef) &&
        !(source !== undefined && entitySignature(source) === 'participant.party');
      const player =
        relation.kind === 'plays_role' && members.has(relation.targetRef);

      if (
        outgoing ||
        player ||
        (members.has(relation.sourceRef) && members.has(relation.targetRef))
      ) {
        relations.push(relation);
        include(relation.id);
        referencesOf(relation).forEach(include);
      }
    }
  }

  return {
    manifest: { ...model.manifest, entryContextRefs: [...scopeRefs] },
    entities: model.entities.filter((entity) => members.has(entity.id)),
    relationships: relations,
    rules: model.rules.filter((rule) => members.has(rule.id)),
  };
};

/** Keeps only the scenarios and instances the scoped model can execute. */
export const scopeSuite = (
  model: DomainModelDocument,
  suite: ValidationSuite,
): ValidationSuite => {
  const entityIds = new Set(model.entities.map((entity) => entity.id));
  const ruleIds = new Set(model.rules.map((rule) => rule.id));
  const instances = new Map(
    suite.instances.map((instance) => [instance.id, instance] as const),
  );
  const scenarios = suite.scenarios.filter((scenario) => {
    const refs = [...referencesOf(scenario)];

    return (
      refs.some((ref) => ruleIds.has(ref)) ||
      refs.some((ref) => {
        const instance = instances.get(ref);

        return instance !== undefined && entityIds.has(instance.entityRef);
      })
    );
  });

  const needed = new Set<string>();

  for (const scenario of scenarios) {
    referencesOf(scenario).forEach((ref) => needed.add(ref));
  }

  let previous = new Set<string>();

  while (previous.size !== needed.size) {
    previous = new Set(needed);

    for (const ref of [...needed]) {
      const instance = instances.get(ref);

      if (instance !== undefined) {
        referencesOf(instance).forEach((dependency) => needed.add(dependency));
      }
    }
  }

  return {
    instances: suite.instances.filter((instance) => needed.has(instance.id)),
    scenarios,
    errors: suite.errors,
  };
};

/**
 * Rules the Evidence-instance simulator can execute, and the rest as limits.
 *
 * A Thing, a Participant or a capability rule has behavior the simulator does
 * not model, so it is reported as a limitation instead of silently passing.
 */
export const simulationRules = (
  model: DomainModelDocument,
): { rules: readonly RuleAST[]; limitations: readonly string[] } => {
  const entities = new Map(
    model.entities.map((entity) => [entity.id, entity] as const),
  );
  const hasEvidence = model.entities.some(
    (entity) => entity.category === 'evidence',
  );
  const supported = new Set([
    'evidence.rfp',
    'evidence.proposal',
    'evidence.contract',
    'evidence.fulfillment_request',
    'evidence.fulfillment_confirmation',
    'evidence.other_evidence',
    'role.evidence',
  ]);
  const rules: RuleAST[] = [];
  const limitations: string[] = [];

  for (const rule of model.rules) {
    const refs = [
      ...Object.values(rule.bindings)
        .filter((binding): binding is { ref: string } => 'ref' in binding)
        .map((binding) => binding.ref),
      ...(rule.target === undefined ? [] : [rule.target.entityRef]),
    ];
    const applicable =
      hasEvidence &&
      refs.every((ref) => {
        const entity = entities.get(ref);

        return entity !== undefined && supported.has(entitySignature(entity));
      });

    if (applicable) {
      rules.push(rule);
    } else {
      limitations.push(
        `${rule.id}: behavior is not executed by the Evidence Instance simulator`,
      );
    }
  }

  return { rules, limitations };
};

/**
 * Both Contract Parties must each claim a main Fulfillment as right holder.
 *
 * A Contract only exists between two Parties, so one direction alone is a scope
 * gap: the model can be saved and checked while the other direction is unclear,
 * but it cannot be delivered.
 */
export const pairingGaps = (model: DomainModelDocument): string[] => {
  const entities = new Map(
    model.entities.map((entity) => [entity.id, entity] as const),
  );
  const claimants = new Map<string, Set<string>>();
  const contextsWithRequests = new Set<string>();
  const requests = model.entities.filter(isFulfillmentRequest);

  for (const request of requests) {
    contextsWithRequests.add(request.contextRef);

    const roleRef = request.responsibleRoleRef;

    if (roleRef !== undefined) {
      const claimed = claimants.get(request.contextRef) ?? new Set<string>();
      claimed.add(roleRef);
      claimants.set(request.contextRef, claimed);
    }
  }

  const gaps: string[] = [];

  for (const entity of model.entities) {
    if (!isContextEntity(entity) || entity.kind !== 'contract') {
      continue;
    }
    if (!contextsWithRequests.has(entity.id)) {
      continue;
    }

    const contracts = (entity.rootRefs ?? [])
      .map((ref) => entities.get(ref))
      .filter(
        (candidate): candidate is EntityAST =>
          candidate !== undefined &&
          entitySignature(candidate) === 'evidence.contract',
      );

    if (contracts.length !== 1) {
      continue;
    }

    const contract = contracts[0] as EntityAST;
    const claimed = claimants.get(entity.id) ?? new Set<string>();
    const roleRefs = 'roleRefs' in contract ? (contract.roleRefs ?? []) : [];

    for (const roleRef of roleRefs) {
      if (claimed.has(roleRef)) {
        continue;
      }

      gaps.push(
        `${entity.id}: primary Fulfillments must cover both Contract Parties; Party Role '${roleRef}' is not the right holder of any Fulfillment Request`,
      );
    }
  }

  return gaps;
};

/**
 * Checks that only fail when the model is asked to be complete.
 *
 * They are the `complete=True` half of `validate_model`: an Evidence moment
 * without its business time, an attribute without a declared type or
 * requirement, and a Fulfillment that no confirmation or proof closes.
 */
export const completenessIssues = (
  model: DomainModelDocument,
): readonly string[] => {
  const issues: string[] = [];
  const confirmations = new Set<string>();

  for (const entity of model.entities) {
    if (entity.category === 'evidence') {
      const attributes = new Map(
        (entity.attributes ?? []).map((attribute) => [attribute.name, attribute] as const),
      );

      for (const name of REQUIRED_EVIDENCE_TIME_ATTRIBUTES[entity.kind] ?? []) {
        const attribute = attributes.get(name);

        if (attribute === undefined) {
          issues.push(
            `${entity.id}: ${entity.kind} requires explicit time attribute '${name}'`,
          );
        }
      }
    }

    for (const attribute of entity.attributes ?? []) {
      if (attribute.valueType === undefined) {
        issues.push(`${entity.id}.${attribute.name}: missing valueType`);
      }
      if (attribute.required === undefined) {
        issues.push(`${entity.id}.${attribute.name}: missing required`);
      }
    }
  }

  for (const entity of model.entities) {
    if (!isFulfillmentRequest(entity)) {
      continue;
    }

    const pair = fulfillmentResults(model, entity.id);

    if (pair.confirmations.length === 0 && pair.roles.length === 0) {
      issues.push(
        `${entity.id}: must be associated with at least one Fulfillment Confirmation or Evidence Role`,
      );
    }

    pair.confirmations.forEach((confirmation) =>
      confirmations.add(confirmation.id),
    );
  }

  for (const entity of model.entities) {
    if (entitySignature(entity) !== 'evidence.fulfillment_confirmation') {
      continue;
    }

    if (!confirmations.has(entity.id)) {
      issues.push(
        `${entity.id}: must be associated with at least one Fulfillment Request through a references Relationship`,
      );
    }
  }

  return issues;
};

/**
 * Confirmations and proof Roles that close one request.
 *
 * A result counts as associated through a `references` relationship or through
 * the request's own completion and breach rule bindings, which is how the
 * checker decides whether a request can ever be completed.
 */
export const fulfillmentResults = (
  model: DomainModelDocument,
  requestId: string,
): { confirmations: readonly EntityAST[]; roles: readonly EntityAST[] } => {
  const entities = new Map(
    model.entities.map((entity) => [entity.id, entity] as const),
  );
  const request = entities.get(requestId);

  if (request === undefined || !('contextRef' in request)) {
    return { confirmations: [], roles: [] };
  }

  const contextId = request.contextRef;
  const confirmationIds = new Set<string>();
  const roleIds = new Set<string>();

  const consider = (ref: string | undefined): void => {
    if (ref === undefined || ref === requestId) {
      return;
    }

    const other = entities.get(ref);

    if (other === undefined || !('contextRef' in other)) {
      return;
    }
    if (other.contextRef !== contextId) {
      return;
    }

    const signature = entitySignature(other);

    if (signature === 'evidence.fulfillment_confirmation') {
      confirmationIds.add(ref);
    } else if (signature === 'role.evidence') {
      roleIds.add(ref);
    }
  };

  for (const relationship of model.relationships) {
    if (
      relationship.kind === 'references' &&
      relationship.targetRef === requestId
    ) {
      consider(relationship.sourceRef);
    }
  }

  for (const rule of model.rules) {
    if (rule.contextRef !== contextId) {
      continue;
    }
    if (rule.kind !== 'completion' && rule.kind !== 'breach') {
      continue;
    }

    const bindings = Object.values(rule.bindings);

    if (!bindings.some((binding) => 'ref' in binding && binding.ref === requestId)) {
      continue;
    }

    bindings.forEach((binding) => {
      if ('ref' in binding) {
        consider(binding.ref);
      }
    });
  }

  const sorted = (ids: ReadonlySet<string>): EntityAST[] =>
    [...ids]
      .sort()
      .map((id) => entities.get(id))
      .filter((entity): entity is EntityAST => entity !== undefined);

  return { confirmations: sorted(confirmationIds), roles: sorted(roleIds) };
};

/**
 * What still keeps a scope from being complete once it is consistent.
 *
 * Gaps are reported, not thrown: a single identified obligation direction can be
 * saved and reviewed while the other is still unclear.
 */
export const completenessGaps = (
  model: DomainModelDocument,
  consistentErrors: readonly string[],
): string[] => {
  const consistent = new Set(consistentErrors);
  const gaps = completenessIssues(model).filter((issue) => !consistent.has(issue));
  const requestContexts = new Set(
    model.entities.filter(isFulfillmentRequest).map((request) => request.contextRef),
  );

  for (const entity of model.entities) {
    if (
      entitySignature(entity) === 'context.contract' &&
      !requestContexts.has(entity.id)
    ) {
      gaps.push(
        `${entity.id}: Contract Context requires its primary Fulfillment Request before scope completion`,
      );
    }
  }

  gaps.push(...pairingGaps(model));

  return gaps;
};
