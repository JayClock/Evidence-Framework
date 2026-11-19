import type {
  AttributeAST,
  DomainModelDocument,
  EntityAST,
  RuleAST,
} from '@evidence-poc/evidence-schema';

import { ParseError, type ASTNode } from '@marcbachmann/cel-js';

import { compileCelExpression } from '../cel/celEvaluator.js';
import {
  CEL_COLLECTION_MACROS,
  resolveCelReference,
  walkCelAst,
} from '../cel/celAst.js';

/**
 * Attribute-level lineage for the CEL rules.
 *
 * Every read a rule performs is traced to the modeled Entity attribute it comes
 * from, so a derived value can be explained by the values it was computed from.
 * The checks that make lineage meaningful are part of the walk: a collection
 * binding must be iterated by a macro, an access must name a real attribute, and
 * a derivation cycle is an error rather than a curiosity.
 */

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
  schemaVersion: '6.0';
  modelId: unknown;
  nodes: readonly TraceabilityNode[];
  edges: readonly TraceabilityEdge[];
  constraints: readonly TraceabilityConstraint[];
}

/** `entity.attribute` in the `entity#attribute` form the reports use. */
export const attributePath = (entityRef: string, attribute: string): string =>
  `${entityRef}#${attribute}`;

const attributesOf = (
  entity: EntityAST | undefined,
): Map<string, AttributeAST> =>
  new Map(
    (entity?.attributes ?? []).map(
      (attribute) => [attribute.name, attribute] as const,
    ),
  );

const dedupe = (messages: readonly string[]): string[] => [
  ...new Set(messages),
];

/** Binding name resolved through the current macro scope, else the rule's own. */
type Source = {
  binding: string;
  entityRef: string;
  cardinality: 'one' | 'many';
};

const bindingSources = (rule: RuleAST): Map<string, Source> => {
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

/** Extract reads directly from the native AST, including lexical macro aliases. */
export const extractRuleAttributeAccesses = (
  rule: RuleAST,
): { accesses: readonly AttributeAccess[]; errors: readonly string[] } => {
  let ast: ASTNode;
  try {
    ast = compileCelExpression(rule.expression).expr.ast;
  } catch (error) {
    // Syntax diagnostics belong to the static checks, not to lineage.
    if (error instanceof ParseError) return { accesses: [], errors: [] };
    throw error;
  }

  const sources = bindingSources(rule);
  const accesses = new Map<string, AttributeAccess>();
  const errors: string[] = [];
  walkCelAst(ast, (node, scope) => {
    if (node.op === 'rcall' && CEL_COLLECTION_MACROS.has(node.args[0])) {
      const reference = resolveCelReference(node.args[1], scope);
      const source =
        reference === null ? undefined : sources.get(reference.root);
      if (
        source !== undefined &&
        reference?.members.length === 0 &&
        (source.cardinality !== 'many' || reference.iterated)
      ) {
        errors.push(
          `${rule.id}: CEL macro '${node.args[0]}' iterates binding '${source.binding}', which must declare cardinality: many`,
        );
      }
    }
    if (
      node.op !== '.' &&
      node.op !== '.?' &&
      node.op !== '[]' &&
      node.op !== '[?]'
    )
      return;
    const reference = resolveCelReference(node, scope);
    if (reference === null && (node.op === '[]' || node.op === '[?]')) {
      const base = resolveCelReference(node.args[0], scope);
      const source = base === null ? undefined : sources.get(base.root);
      if (source !== undefined && base?.members.length === 0) {
        errors.push(
          source.cardinality === 'many' && !base.iterated
            ? `${rule.id}: many binding '${source.binding}' must be accessed through a CEL collection macro`
            : `${rule.id}: Entity binding '${source.binding}' must use a static string attribute index for traceability`,
        );
      }
      return;
    }
    const source = reference === null ? undefined : sources.get(reference.root);
    const attribute = reference?.members[0]?.name;
    if (source === undefined || attribute === undefined || reference === null)
      return;
    if (source.cardinality === 'many' && !reference.iterated) {
      errors.push(
        `${rule.id}: many binding '${source.binding}' must be accessed through a CEL collection macro`,
      );
    }
    accesses.set(`${source.entityRef}#${attribute}#${source.binding}`, {
      entityRef: source.entityRef,
      attribute,
      binding: source.binding,
    });
  });

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
    if (error instanceof ParseError) return [];
    throw error;
  }
};

/** Cycles in the lineage graph, printed as the path that closes them. */
const lineageCycleErrors = (edges: readonly TraceabilityEdge[]): string[] => {
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

  return [...cycles].sort().map((cycle) => `attribute lineage cycle: ${cycle}`);
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
        errors.push(
          `${entity.id}: duplicate attribute name '${attribute.name}'`,
        );
      }
      names.add(attribute.name);
    }
  }

  for (const rule of model.rules) {
    const { accesses, errors: accessErrors } =
      extractRuleAttributeAccesses(rule);
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

      if (
        binding !== undefined &&
        'ref' in binding &&
        binding.ref !== access.entityRef
      ) {
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
      accesses.map((access) =>
        attributePath(access.entityRef, access.attribute),
      ),
    ),
  );

  for (const rule of model.rules) {
    const accesses = accessesByRule.get(rule.id) ?? [];

    if (rule.kind === 'derivation' && rule.target !== undefined) {
      const target = attributePath(
        rule.target.entityRef,
        rule.target.attribute,
      );
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
        ...new Set(
          accesses.map((access) =>
            attributePath(access.entityRef, access.attribute),
          ),
        ),
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

      if (
        attribute.keyData !== true &&
        derivedBy === undefined &&
        !accessedPaths.has(path)
      ) {
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
          .filter(
            ([variable, binding]) => used.has(variable) && 'type' in binding,
          )
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
      schemaVersion: '6.0',
      modelId: model.manifest.id,
      nodes: [...nodes].sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
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
