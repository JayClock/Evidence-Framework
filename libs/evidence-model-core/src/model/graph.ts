import {
  type AttributeAST,
  type ContextEntityAST,
  type DomainModelDocument,
  type EntityAST,
  type EvidenceEntityAST,
  type RelationshipAST,
  type RuleAST,
  findAttribute,
  isContextEntity,
  isContractEntity,
  isEvidenceEntity,
  isFulfillmentConfirmation,
  isFulfillmentRequest,
} from '@evidence-poc/evidence-schema';

/** One request paired with the results and rules that decide its fulfillment. */
export interface FulfillmentPair {
  readonly request: EvidenceEntityAST;
  /** Root Contract of the request's Contract Context, when modeled. */
  readonly contract: EvidenceEntityAST | null;
  /** `fulfillment_confirmation` moments referencing the request. */
  readonly confirmations: readonly EvidenceEntityAST[];
  /** `other_evidence` moments referencing the request or its confirmations. */
  readonly proofs: readonly EvidenceEntityAST[];
  readonly completionRules: readonly RuleAST[];
  readonly breachRules: readonly RuleAST[];
}

/**
 * Read-only indexes over one immutable {@link DomainModelDocument}.
 *
 * The graph is rebuilt whenever the session document changes; every lookup is
 * O(1) except the memoized fulfillment pairs, which are derived on first use.
 */
export interface DomainGraph {
  readonly document: DomainModelDocument;
  getEntity(entityId: string): EntityAST | undefined;
  getRule(ruleId: string): RuleAST | undefined;
  getRelationship(relationshipId: string): RelationshipAST | undefined;
  entities(): readonly EntityAST[];
  rules(): readonly RuleAST[];
  relationships(): readonly RelationshipAST[];
  attributesOf(entityId: string): readonly AttributeAST[];
  attribute(entityId: string, attributeName: string): AttributeAST | undefined;
  /** Relationships pointing at or from the object. */
  outgoing(objectId: string): readonly RelationshipAST[];
  incoming(objectId: string): readonly RelationshipAST[];
  /** Distinct object ids reachable through one formal relationship. */
  relatedIds(objectId: string): readonly string[];
  /** Objects owned by one Context through `contextRef`. */
  entitiesInContext(contextId: string): readonly EntityAST[];
  childContexts(contextId: string): readonly ContextEntityAST[];
  /** Root-to-node chain, cycle safe. */
  contextPath(contextId: string): readonly ContextEntityAST[];
  /** Root Contract of a Contract Context. */
  rootContractOf(contextId: string): EvidenceEntityAST | undefined;
  rulesInContext(contextId: string): readonly RuleAST[];
  rulesReferencing(entityId: string): readonly RuleAST[];
  derivationRule(entityId: string, attributeName: string): RuleAST | undefined;
  fulfillmentPairs(): readonly FulfillmentPair[];
  fulfillmentPair(requestId: string): FulfillmentPair | undefined;
}

const groupBy = <TItem>(
  items: readonly TItem[],
  key: (item: TItem) => string | undefined,
): Map<string, TItem[]> => {
  const grouped = new Map<string, TItem[]>();

  for (const item of items) {
    const group = key(item);

    if (group === undefined) {
      continue;
    }

    const bucket = grouped.get(group);

    if (bucket === undefined) {
      grouped.set(group, [item]);
    } else {
      bucket.push(item);
    }
  }

  return grouped;
};

const rulesBinding = (rule: RuleAST, objectId: string): boolean =>
  Object.values(rule.bindings).some(
    (binding) => 'ref' in binding && binding.ref === objectId,
  );

export function createDomainGraph(document: DomainModelDocument): DomainGraph {
  const entityById = new Map(
    document.entities.map((entity) => [entity.id, entity]),
  );
  const ruleById = new Map(document.rules.map((rule) => [rule.id, rule]));
  const relationshipById = new Map(
    document.relationships.map((relationship) => [
      relationship.id,
      relationship,
    ]),
  );
  const outgoing = groupBy(
    document.relationships,
    (relationship) => relationship.sourceRef,
  );
  const incoming = groupBy(
    document.relationships,
    (relationship) => relationship.targetRef,
  );
  const inContext = groupBy(document.entities, (entity) =>
    'contextRef' in entity ? entity.contextRef : undefined,
  );
  const childContexts = groupBy(
    document.entities.filter(isContextEntity),
    (context) => context.parentContextRef,
  );

  let pairs: readonly FulfillmentPair[] | undefined;
  let pairsByRequest: Map<string, FulfillmentPair> | undefined;

  const rootContractOf = (contextId: string): EvidenceEntityAST | undefined => {
    const context = entityById.get(contextId);

    if (context === undefined || !isContextEntity(context)) {
      return undefined;
    }

    const contracts = (context.rootRefs ?? [])
      .map((ref) => entityById.get(ref))
      .filter(isContractEntity);

    return contracts.length === 1 ? contracts[0] : undefined;
  };

  const referencesTo = (objectId: string): readonly EntityAST[] =>
    (incoming.get(objectId) ?? [])
      .filter((relationship) => relationship.kind === 'references')
      .map((relationship) => entityById.get(relationship.sourceRef))
      .filter((entity): entity is EntityAST => entity !== undefined);

  const buildPair = (request: EvidenceEntityAST): FulfillmentPair => {
    const confirmations = referencesTo(request.id).filter(
      isFulfillmentConfirmation,
    );
    const proofSources = [request.id, ...confirmations.map(({ id }) => id)];
    const proofs = proofSources
      .flatMap((sourceId) => referencesTo(sourceId))
      .filter(
        (entity): entity is EvidenceEntityAST =>
          isEvidenceEntity(entity) && entity.kind === 'other_evidence',
      )
      .filter(
        (entity, index, list) =>
          list.findIndex((candidate) => candidate.id === entity.id) === index,
      );

    return {
      request,
      contract: rootContractOf(request.contextRef) ?? null,
      confirmations,
      proofs,
      completionRules: document.rules.filter(
        (rule) => rule.kind === 'completion' && rulesBinding(rule, request.id),
      ),
      breachRules: document.rules.filter(
        (rule) => rule.kind === 'breach' && rulesBinding(rule, request.id),
      ),
    };
  };

  const ensurePairs = (): readonly FulfillmentPair[] => {
    if (pairs === undefined) {
      pairs = document.entities.filter(isFulfillmentRequest).map(buildPair);
      pairsByRequest = new Map(
        pairs.map((pair) => [pair.request.id, pair] as const),
      );
    }

    return pairs;
  };

  return {
    document,
    getEntity: (entityId) => entityById.get(entityId),
    getRule: (ruleId) => ruleById.get(ruleId),
    getRelationship: (relationshipId) => relationshipById.get(relationshipId),
    entities: () => document.entities,
    rules: () => document.rules,
    relationships: () => document.relationships,
    attributesOf: (entityId) => entityById.get(entityId)?.attributes ?? [],
    attribute: (entityId, attributeName) =>
      findAttribute(entityById.get(entityId), attributeName),
    outgoing: (objectId) => outgoing.get(objectId) ?? [],
    incoming: (objectId) => incoming.get(objectId) ?? [],
    relatedIds: (objectId) => {
      const related = new Set<string>();

      for (const relationship of [
        ...(outgoing.get(objectId) ?? []),
        ...(incoming.get(objectId) ?? []),
      ]) {
        related.add(
          relationship.sourceRef === objectId
            ? relationship.targetRef
            : relationship.sourceRef,
        );
      }

      return [...related];
    },
    entitiesInContext: (contextId) => inContext.get(contextId) ?? [],
    childContexts: (contextId) => childContexts.get(contextId) ?? [],
    contextPath: (contextId) => {
      const path: ContextEntityAST[] = [];
      const seen = new Set<string>();
      let current = entityById.get(contextId);

      while (
        current !== undefined &&
        isContextEntity(current) &&
        !seen.has(current.id)
      ) {
        seen.add(current.id);
        path.unshift(current);
        current =
          current.parentContextRef === undefined
            ? undefined
            : entityById.get(current.parentContextRef);
      }

      return path;
    },
    rootContractOf,
    rulesInContext: (contextId) =>
      document.rules.filter((rule) => rule.contextRef === contextId),
    rulesReferencing: (entityId) =>
      document.rules.filter((rule) => rulesBinding(rule, entityId)),
    derivationRule: (entityId, attributeName) => {
      const ruleRef = findAttribute(
        entityById.get(entityId),
        attributeName,
      )?.derivedByRuleRef;

      return ruleRef === undefined ? undefined : ruleById.get(ruleRef);
    },
    fulfillmentPairs: ensurePairs,
    fulfillmentPair: (requestId) => {
      ensurePairs();

      return pairsByRequest?.get(requestId);
    },
  };
}
