import type {
  AttributeAST,
  DomainModelDocument,
  EntityAST,
  RuleAST,
} from '@evidence-poc/evidence-schema';

import {
  CelEvaluationError,
  compileCelExpression,
  parseCelExpression,
  type CelNode,
} from '../cel/celEvaluator.js';

/**
 * Attribute-level lineage for the CEL rules.
 *
 * Every read a rule performs is traced to the modeled Entity attribute it comes
 * from, so a derived value can be explained by the values it was computed from.
 * The checks that make lineage meaningful are part of the walk: a collection
 * binding must be iterated by a macro, an access must name a real attribute, and
 * a derivation cycle is an error rather than a curiosity.
 */

const MACRO_NAMES = new Set(['all', 'exists', 'exists_one', 'filter', 'map']);

/** One CEL read of a modeled attribute, through one rule binding. */
export interface AttributeAccess {
  entityRef: string;
  attribute: string;
  binding: string;
}

export interface TraceabilityNode {
  path: string;
  entityRef: string;
  attribute: string;
  valueType: unknown;
  keyData: boolean;
  origin: 'derived' | 'asserted';
  derivedByRuleRef?: string;
}

export interface TraceabilityEdge {
  source: string;
  target: string;
  ruleRef: string;
}

export interface TraceabilityConstraint {
  ruleRef: string;
  kind: string;
  attributeRefs: readonly string[];
}

export interface TraceabilityDocument {
  schemaVersion: '5.0';
  modelId: unknown;
  nodes: readonly TraceabilityNode[];
  edges: readonly TraceabilityEdge[];
  constraints: readonly TraceabilityConstraint[];
}

/** `entity.attribute` in the `entity#attribute` form the reports use. */
export const attributePath = (entityRef: string, attribute: string): string =>
  `${entityRef}#${attribute}`;

const attributesOf = (entity: EntityAST | undefined): Map<string, AttributeAST> =>
  new Map(
    (entity?.attributes ?? []).map((attribute) => [attribute.name, attribute] as const),
  );

const dedupe = (messages: readonly string[]): string[] => [...new Set(messages)];

/** Binding name resolved through the current macro scope, else the rule's own. */
type Source = {
  binding: string;
  entityRef: string;
  cardinality: 'one' | 'many';
};

const bindingSources = (
  rule: RuleAST,
): Map<string, Source> => {
  const sources = new Map<string, Source>();

  for (const [name, binding] of Object.entries(rule.bindings)) {
    if ('ref' in binding) {
      sources.set(name, {
        binding: name,
        entityRef: binding.ref,
        cardinality: binding.cardinality === 'many' ? 'many' : 'one',
      });
    }
  }

  return sources;
};

/** The `alias.a.b` path a member or index chain reads, when it is static. */
const memberPath = (node: CelNode): readonly string[] | null => {
  if (node.kind === 'identifier') {
    return [node.name];
  }

  if (node.kind === 'member') {
    const base = memberPath(node.object);

    return base === null ? null : [...base, node.name];
  }

  if (node.kind === 'index') {
    const base = memberPath(node.object);

    if (base === null || node.index.kind !== 'literal') {
      return null;
    }

    return typeof node.index.value === 'string'
      ? [...base, node.index.value]
      : null;
  }

  return null;
};

/** The literal string a node evaluates to, unwrapping parentheses. */
const literalString = (node: CelNode): string | null =>
  node.kind === 'literal' && typeof node.value === 'string' ? node.value : null;

/**
 * Extracts the attribute reads of one rule's expression.
 *
 * A macro body reads through the macro's own variable, so the walk carries the
 * macro's source down into the body instead of stopping at the binder.
 */
export const extractRuleAttributeAccesses = (
  rule: RuleAST,
): { accesses: readonly AttributeAccess[]; errors: readonly string[] } => {
  let ast: CelNode;

  try {
    ast = parseCelExpression(rule.expression);
  } catch (error) {
    // Syntax diagnostics belong to the static checks, not to lineage.
    if (error instanceof CelEvaluationError) {
      return { accesses: [], errors: [] };
    }

    throw error;
  }

  const sources = bindingSources(rule);
  const accesses = new Map<string, AttributeAccess>();
  const errors: string[] = [];

  const collectionSource = (
    node: CelNode,
    local: ReadonlyMap<string, Source>,
  ): Source | null => {
    const path = memberPath(node);

    if (path !== null && path.length === 1) {
      const name = path[0] as string;

      return local.get(name) ?? sources.get(name) ?? null;
    }

    if (node.kind === 'call' && node.callee.kind === 'member') {
      const method = node.callee.name;

      if (method === 'filter' || method === 'map' || MACRO_NAMES.has(method)) {
        return collectionSource(node.callee.object, local);
      }
    }

    return null;
  };

  const record = (
    path: readonly string[],
    local: ReadonlyMap<string, Source>,
  ): void => {
    if (path.length < 2) {
      return;
    }

    const root = path[0] as string;
    const source = local.get(root) ?? sources.get(root);

    if (source === undefined) {
      return;
    }

    if (source.cardinality === 'many' && !local.has(root)) {
      errors.push(
        `${rule.id}: many binding '${source.binding}' must be accessed through a CEL collection macro`,
      );
    }

    const attribute = path[1] as string;

    accesses.set(`${source.entityRef}#${attribute}#${source.binding}`, {
      entityRef: source.entityRef,
      attribute,
      binding: source.binding,
    });
  };

  const walk = (node: CelNode, local: ReadonlyMap<string, Source>): void => {
    if (node.kind === 'call' && node.callee.kind === 'member') {
      const method = node.callee.name;

      if (MACRO_NAMES.has(method)) {
        walk(node.callee.object, local);

        const [binder, ...rest] = node.args;
        const source = collectionSource(node.callee.object, local);
        const nested = new Map(local);

        if (binder?.kind === 'identifier' && source !== null) {
          if (source.cardinality !== 'many') {
            errors.push(
              `${rule.id}: CEL macro '${method}' iterates binding '${source.binding}', which must declare cardinality: many`,
            );
          }

          nested.set(binder.name, { ...source, cardinality: 'one' });
        }

        rest.forEach((argument) => walk(argument, nested));

        return;
      }

      walk(node.callee.object, local);
      node.args.forEach((argument) => walk(argument, local));

      return;
    }

    const path = memberPath(node);

    if (node.kind === 'member' || node.kind === 'index') {
      if (node.kind === 'index' && path === null) {
        const base = memberPath(node.object);
        const root = base !== null && base.length === 1 ? (base[0] as string) : null;
        const source =
          root === null ? null : (local.get(root) ?? sources.get(root) ?? null);
        const attribute = literalString(node.index);

        if (source !== null && attribute === null) {
          errors.push(
            source.cardinality === 'many'
              ? `${rule.id}: many binding '${source.binding}' must be accessed through a CEL collection macro`
              : `${rule.id}: Entity binding '${source.binding}' must use a static string attribute index for traceability`,
          );
        }
      }

      if (path !== null) {
        record(path, local);
      }

      walk(node.object, local);

      if (node.kind === 'index') {
        walk(node.index, local);
      }

      return;
    }

    switch (node.kind) {
      case 'call':
        node.args.forEach((argument) => walk(argument, local));

        return;
      case 'identifier':
      case 'literal':
        return;
      case 'unary':
        walk(node.operand, local);

        return;
      case 'binary':
        walk(node.left, local);
        walk(node.right, local);

        return;
      case 'conditional':
        walk(node.test, local);
        walk(node.consequent, local);
        walk(node.alternate, local);

        return;
      case 'list':
        node.items.forEach((item) => walk(item, local));

        return;
      case 'map':
        node.entries.forEach((entry) => {
          walk(entry.key, local);
          walk(entry.value, local);
        });

        return;
    }
  };

  walk(ast, new Map());

  return {
    accesses: [...accesses.values()].sort(
      (left, right) =>
        left.entityRef.localeCompare(right.entityRef) ||
        left.attribute.localeCompare(right.attribute) ||
        left.binding.localeCompare(right.binding),
    ),
    errors: dedupe(errors),
  };
};

/** Attributes a derivation expression reads directly, not through a binding. */
const freeIdentifiers = (rule: RuleAST): readonly string[] => {
  try {
    return compileCelExpression(rule.expression).identifiers();
  } catch (error) {
    if (error instanceof CelEvaluationError) {
      return [];
    }

    throw error;
  }
};

/** Cycles in the lineage graph, printed as the path that closes them. */
const lineageCycleErrors = (
  edges: readonly TraceabilityEdge[],
): string[] => {
  const adjacency = new Map<string, Set<string>>();

  for (const edge of edges) {
    const targets = adjacency.get(edge.source) ?? new Set<string>();
    targets.add(edge.target);
    adjacency.set(edge.source, targets);
  }

  const visiting: string[] = [];
  const active = new Set<string>();
  const complete = new Set<string>();
  const cycles = new Set<string>();

  const walk = (node: string): void => {
    if (complete.has(node)) {
      return;
    }
    if (active.has(node)) {
      const start = visiting.indexOf(node);
      cycles.add([...visiting.slice(start), node].join(' -> '));

      return;
    }

    active.add(node);
    visiting.push(node);

    for (const target of [...(adjacency.get(node) ?? [])].sort()) {
      walk(target);
    }

    visiting.pop();
    active.delete(node);
    complete.add(node);
  };

  for (const node of [...adjacency.keys()].sort()) {
    walk(node);
  }

  return [...cycles]
    .sort()
    .map((cycle) => `attribute lineage cycle: ${cycle}`);
};

/**
 * Builds the lineage document and the problems that make it inconsistent.
 *
 * The document is deterministic — nodes by path, edges by target then source —
 * because it is generated output that a review compares across runs.
 */
export const analyzeTraceability = (
  model: DomainModelDocument,
): { document: TraceabilityDocument; errors: readonly string[] } => {
  const entities = new Map(
    model.entities.map((entity) => [entity.id, entity] as const),
  );
  const rules = new Map(model.rules.map((rule) => [rule.id, rule] as const));
  const accessesByRule = new Map<string, readonly AttributeAccess[]>();
  const errors: string[] = [];

  for (const entity of model.entities) {
    const names = new Set<string>();

    for (const attribute of entity.attributes ?? []) {
      if (names.has(attribute.name)) {
        errors.push(`${entity.id}: duplicate attribute name '${attribute.name}'`);
      }
      names.add(attribute.name);
    }
  }

  for (const rule of model.rules) {
    const { accesses, errors: accessErrors } = extractRuleAttributeAccesses(rule);
    accessesByRule.set(rule.id, accesses);
    errors.push(...accessErrors);

    for (const access of accesses) {
      const declared = attributesOf(entities.get(access.entityRef));

      if (!declared.has(access.attribute)) {
        errors.push(
          `${rule.id}: CEL binding '${access.binding}' reads unknown attribute '${attributePath(access.entityRef, access.attribute)}'`,
        );
      }

      const binding = rule.bindings[access.binding];

      if (binding !== undefined && 'ref' in binding && binding.ref !== access.entityRef) {
        errors.push(
          `${rule.id}: attribute access '${attributePath(access.entityRef, access.attribute)}' does not match binding '${access.binding}'`,
        );
      }
    }
  }

  const edges: TraceabilityEdge[] = [];
  const constraints: TraceabilityConstraint[] = [];
  const ruleByTarget = new Map<string, string>();
  const accessedPaths = new Set(
    [...accessesByRule.values()].flatMap((accesses) =>
      accesses.map((access) => attributePath(access.entityRef, access.attribute)),
    ),
  );

  for (const rule of model.rules) {
    const accesses = accessesByRule.get(rule.id) ?? [];

    if (rule.kind === 'derivation' && rule.target !== undefined) {
      const target = attributePath(rule.target.entityRef, rule.target.attribute);
      const previous = ruleByTarget.get(target);

      if (previous !== undefined && previous !== rule.id) {
        errors.push(
          `${target}: multiple derivation Rules target this attribute: '${previous}', '${rule.id}'`,
        );
      } else {
        ruleByTarget.set(target, rule.id);
      }

      for (const access of accesses) {
        edges.push({
          source: attributePath(access.entityRef, access.attribute),
          target,
          ruleRef: rule.id,
        });
      }

      continue;
    }

    constraints.push({
      ruleRef: rule.id,
      kind: rule.kind,
      attributeRefs: [
        ...new Set(accesses.map((access) => attributePath(access.entityRef, access.attribute))),
      ].sort(),
    });
  }

  const nodes: TraceabilityNode[] = [];

  for (const entity of [...model.entities].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    for (const attribute of [...(entity.attributes ?? [])].sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = attributePath(entity.id, attribute.name);
      const derivedBy = attribute.derivedByRuleRef;

      if (attribute.keyData !== true && derivedBy === undefined && !accessedPaths.has(path)) {
        continue;
      }

      nodes.push({
        path,
        entityRef: entity.id,
        attribute: attribute.name,
        valueType: attribute.valueType,
        keyData: attribute.keyData === true,
        origin: derivedBy === undefined ? 'asserted' : 'derived',
        ...(derivedBy === undefined ? {} : { derivedByRuleRef: derivedBy }),
      });

      if (derivedBy === undefined) {
        continue;
      }

      if (ruleByTarget.get(path) !== derivedBy) {
        errors.push(
          `${path}: derivedByRuleRef '${derivedBy}' has no matching derivation target`,
        );
      }

      const derivation = rules.get(derivedBy);
      const derivationAccesses = accessesByRule.get(derivedBy) ?? [];

      if (attribute.keyData === true && derivationAccesses.length === 0) {
        errors.push(
          `${path}: key derived attribute must trace to at least one modeled Entity attribute`,
        );
      }

      if (attribute.keyData === true && derivation !== undefined) {
        const used = new Set(freeIdentifiers(derivation));
        const scalarInputs = Object.entries(derivation.bindings)
          .filter(([variable, binding]) => used.has(variable) && 'type' in binding)
          .map(([variable]) => variable)
          .sort();

        if (scalarInputs.length > 0) {
          errors.push(
            `${path}: key derivation scalar inputs ${JSON.stringify(scalarInputs)} must be modeled as Entity attributes`,
          );
        }
      }
    }
  }

  for (const [target, ruleRef] of ruleByTarget) {
    const separator = target.indexOf('#');
    const entityRef = target.slice(0, separator);
    const attribute = target.slice(separator + 1);
    const declared = attributesOf(entities.get(entityRef)).get(attribute);

    if (declared !== undefined && declared.derivedByRuleRef !== ruleRef) {
      errors.push(
        `${target}: derivation Rule '${ruleRef}' must be declared by derivedByRuleRef`,
      );
    }
  }

  errors.push(...lineageCycleErrors(edges));

  return {
    document: {
      schemaVersion: '5.0',
      modelId: model.manifest.id,
      nodes: [...nodes].sort((left, right) => left.path.localeCompare(right.path)),
      edges: [...edges].sort(
        (left, right) =>
          left.target.localeCompare(right.target) ||
          left.source.localeCompare(right.source) ||
          left.ruleRef.localeCompare(right.ruleRef),
      ),
      constraints: [...constraints].sort((left, right) =>
        left.ruleRef.localeCompare(right.ruleRef),
      ),
    },
    errors: dedupe(errors),
  };
};
