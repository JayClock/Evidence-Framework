import type { RuleBinding, RuleAST } from '@evidence-poc/evidence-schema';

import type { DomainGraph } from '../model/graph.js';
import type { CelCandidate } from './celAnalysis.js';

const attributesOf = (
  graph: DomainGraph,
  entityId: string,
): CelCandidate['attributes'] =>
  graph.attributesOf(entityId).map((attribute) => ({
    name: attribute.name,
    label: attribute.label,
    valueType: attribute.valueType,
  }));

const candidateFor = (
  graph: DomainGraph,
  alias: string,
  binding: RuleBinding,
): CelCandidate => {
  if (!('ref' in binding)) {
    return {
      alias,
      label: `运行时 ${binding.type}`,
      valueType: binding.type,
      attributes: [],
    };
  }

  const entity = graph.getEntity(binding.ref);

  return {
    alias,
    label: entity?.label ?? binding.ref,
    ref: binding.ref,
    ...(binding.cardinality === undefined
      ? {}
      : { cardinality: binding.cardinality }),
    attributes: entity === undefined ? [] : attributesOf(graph, entity.id),
  };
};

/**
 * Collects the aliases a derivation rule may read for one attribute.
 *
 * The candidate pool is the point of the inline editor: the model can only read
 * modeled attributes, so the suggestions come from the graph rather than from a
 * generic CEL vocabulary.
 */
export const collectCelCandidates = ({
  graph,
  entityRef,
  ruleId,
}: {
  graph: DomainGraph;
  entityRef: string;
  ruleId?: string;
}): readonly CelCandidate[] => {
  const existing = ruleId === undefined ? undefined : graph.getRule(ruleId);

  if (existing !== undefined) {
    return Object.entries(existing.bindings).map(([alias, binding]) =>
      candidateFor(graph, alias, binding),
    );
  }

  const entity = graph.getEntity(entityRef);
  const candidates: CelCandidate[] = [
    {
      alias: 'self',
      label: `${entity?.label ?? entityRef}（当前对象）`,
      ref: entityRef,
      attributes: attributesOf(graph, entityRef),
    },
  ];
  const contextRef =
    entity !== undefined && 'contextRef' in entity
      ? entity.contextRef
      : undefined;

  if (contextRef === undefined) {
    return candidates;
  }

  // Contract parameters and sibling evidence in the same Context are the two
  // other legal sources, so they are offered by name instead of by free text.
  for (const sibling of graph.entitiesInContext(contextRef)) {
    // Only objects that carry values are legal derivation sources: Contexts are
    // boundaries and Roles describe responsibility, not data.
    if (
      sibling.id === entityRef ||
      (sibling.category !== 'evidence' && sibling.category !== 'participant')
    ) {
      continue;
    }

    const alias = aliasFor(sibling.id, sibling.category);

    if (aliasesTaken(candidates).has(alias)) {
      continue;
    }

    candidates.push({
      alias,
      label: sibling.label,
      ref: sibling.id,
      attributes: attributesOf(graph, sibling.id),
    });
  }

  return candidates;
};

const aliasesTaken = (candidates: readonly CelCandidate[]): Set<string> =>
  new Set(candidates.map((candidate) => candidate.alias));

/** Turns `evidence.contract` into the CEL-safe alias `contract`. */
export const aliasFor = (entityId: string, category: string): string => {
  const head = entityId.includes('.')
    ? (entityId.split('.').at(-1) ?? entityId)
    : entityId;
  const normalized = head.replace(/[^A-Za-z0-9_]/g, '_');

  return /^[A-Za-z_]/.test(normalized) ? normalized : `${category}_${normalized}`;
};

/** Bindings a derivation rule needs to read the candidates it mentions. */
export const bindingsForAliases = (
  candidates: readonly CelCandidate[],
  aliases: readonly string[],
): Record<string, RuleBinding> => {
  const byAlias = new Map(candidates.map((candidate) => [candidate.alias, candidate]));
  const bindings: Record<string, RuleBinding> = {};

  for (const alias of aliases) {
    const candidate = byAlias.get(alias);

    if (candidate === undefined) {
      continue;
    }

    bindings[alias] =
      candidate.ref === undefined
        ? { type: candidate.valueType ?? 'dynamic' }
        : { ref: candidate.ref };
  }

  return bindings;
};

/** Reads the derivation rule bound to one attribute, if any. */
export const derivationRuleOf = (
  graph: DomainGraph,
  entityRef: string,
  attributeName: string,
): RuleAST | undefined =>
  graph.derivationRule(entityRef, attributeName);
