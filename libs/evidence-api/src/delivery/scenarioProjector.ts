import {
  assertValidDomainModel,
  type DomainModelDocument,
  type ModelExampleAST,
  type ExampleTestAST,
  type RuleAST,
} from '@evidence-poc/evidence-schema';
import { evaluateRuleOnExample } from '@evidence-poc/evidence-model-core';
import { buildDeliveryRoutes, type DeliveryRoute } from './routes.js';

/** Ephemeral compiler IR, never a persisted or user-authored suite format. */
export interface AcceptanceStep {
  ref: string;
  route: DeliveryRoute;
  asOf: string;
  actingRoleRef: string;
  status: number;
  inputs: Record<string, unknown>;
  assertions: Record<string, unknown>;
  /** Path placeholder -> captured variable name. */
  parameters: Record<string, string>;
  /** Captured variable -> JSONPath in this response. */
  captures: Record<string, string>;
}
export interface AcceptanceFlow {
  id: string;
  steps: AcceptanceStep[];
}
export interface AcceptanceProjection {
  modelId: string;
  flows: AcceptanceFlow[];
}
interface Case {
  ref: string;
  example: ModelExampleAST;
  test: ExampleTestAST;
  route: DeliveryRoute;
  dependencies: string[];
}
const fail = (ref: string, message: string): never => {
  throw new Error(`ACCEPTANCE_INVALID: ${ref}: ${message}`);
};
const fieldPath = (name: string): string => `$[${JSON.stringify(name)}]`;
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );

/**
 * Direct model -> test projection. A graph orders declared examples, not invented
 * business cases. Unsupported or ambiguous mappings are errors, never skipped.
 */
export function projectAcceptanceTests(
  model: DomainModelDocument,
  routes: readonly DeliveryRoute[] = buildDeliveryRoutes(model),
): AcceptanceProjection {
  assertValidDomainModel(model);
  const cases = new Map<string, Case>();
  for (const entity of model.entities)
    for (const example of entity.examples ?? []) {
      if (example.test === undefined) continue;
      const ref = `${entity.id}#${example.label}`;
      const candidates = routes.filter(
        (route) => route.entityRef === entity.id && route.method === 'POST',
      );
      if (candidates.length !== 1)
        fail(ref, 'requires exactly one modeled POST route');
      const route = candidates[0]!;
      const test = example.test;
      if (!route.allowedPartyRoleRefs.includes(test.actingRoleRef))
        fail(ref, `role '${test.actingRoleRef}' cannot call ${route.id}`);
      const dependencies = [
        ...new Set([
          ...(test.basedOn ?? []),
          ...Object.values(test.pathParameters ?? {}).map(
            (source) => source.exampleRef,
          ),
        ]),
      ];
      cases.set(ref, { ref, example, test, route, dependencies });
    }
  if (cases.size === 0)
    fail(model.manifest.id, 'no examples with test metadata');
  const ordered: Case[] = [];
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (item: Case): void => {
    if (visiting.has(item.ref)) fail(item.ref, 'cyclic example dependencies');
    if (visited.has(item.ref)) return;
    visiting.add(item.ref);
    for (const ref of [...item.dependencies].sort()) {
      const dependency = cases.get(ref);
      if (dependency === undefined) fail(item.ref, `unknown example '${ref}'`);
      if (dependency!.test.flow !== item.test.flow)
        fail(item.ref, 'cross-flow dependencies are not isolated');
      if ((dependency!.test.expectedStatus ?? 201) >= 400)
        fail(item.ref, 'cannot depend on a rejected operation');
      if (Date.parse(dependency!.test.asOf) > Date.parse(item.test.asOf))
        fail(item.ref, 'dependency clock is later than this step');
      visit(dependency!);
    }
    visiting.delete(item.ref);
    visited.add(item.ref);
    ordered.push(item);
  };
  for (const item of [...cases.values()].sort((a, b) =>
    a.ref.localeCompare(b.ref),
  ))
    visit(item);
  const facts = new Map<string, Record<string, unknown>>();
  const steps = new Map<string, AcceptanceStep>();
  const flows = new Map<string, AcceptanceFlow>();
  const ancestors = (item: Case): Case[] => {
    const found = new Map<string, Case>();
    const walk = (ref: string): void => {
      const source = cases.get(ref)!;
      if (found.has(ref)) return;
      found.set(ref, source);
      source.dependencies.forEach(walk);
    };
    item.dependencies.forEach(walk);
    return [...found.values()];
  };
  for (const item of ordered) {
    const { ref, route, example, test } = item;
    const status =
      test.expectedStatus ??
      route.responses.find(
        (response) => response.status >= 200 && response.status < 300,
      )?.status;
    if (
      status === undefined ||
      !route.responses.some((response) => response.status === status)
    )
      fail(ref, `status ${status} is not declared by ${route.id}`);
    const positive = status! < 400;
    const fields = new Set(route.outputFields.map((field) => field.name));
    for (const name of Object.keys(example.value))
      if (!fields.has(name)) fail(ref, `unknown example attribute '${name}'`);
    const values = structuredClone(example.value);
    const upstream = ancestors(item);
    const rules: RuleAST[] = route.derived.map((field) => {
      const rule = model.rules.find((rule) => rule.id === field.ruleRef);
      if (
        rule === undefined ||
        rule.kind !== 'derivation' ||
        rule.target?.entityRef !== route.entityRef ||
        rule.target.attribute !== field.name
      )
        fail(ref, `missing derivation for '${field.name}'`);
      return rule!;
    });
    if (positive) {
      // Clear asserted derived values first: the oracle may not read its own expected answer.
      for (const field of route.derived) delete values[field.name];
      let pending: RuleAST[] = [...rules];
      while (pending.length > 0) {
        const remaining: RuleAST[] = [],
          errors: string[] = [];
        for (const rule of pending) {
          try {
            const bindings: Record<string, unknown> = {};
            for (const [alias, binding] of Object.entries(rule.bindings)) {
              if ('type' in binding) continue; // sandbox injects clock aliases, refuses any other missing literal
              const sources =
                binding.ref === route.entityRef
                  ? [{ values }]
                  : upstream
                      .filter(
                        (source) => source.route.entityRef === binding.ref,
                      )
                      .map((source) => ({ values: facts.get(source.ref)! }));
              if (binding.cardinality === 'many')
                bindings[alias] = sources.map((source) => source.values);
              else {
                if (sources.length !== 1)
                  throw new Error(
                    `binding '${alias}' requires one example for '${binding.ref}', found ${sources.length}`,
                  );
                bindings[alias] = sources[0]!.values;
              }
            }
            const computed = evaluateRuleOnExample(model, rule, {
              asOf: test.asOf,
              bindings,
            });
            const name = rule.target!.attribute;
            if (
              Object.hasOwn(example.value, name) &&
              stable(example.value[name]) !== stable(computed)
            )
              fail(
                ref,
                `expected '${name}' disagrees with ${rule.id}: ${stable(computed)}`,
              );
            values[name] = computed;
          } catch (error) {
            remaining.push(rule);
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }
        if (remaining.length === pending.length)
          fail(ref, `cannot evaluate derivations: ${errors.join('; ')}`);
        pending = remaining;
      }
    }
    const inputs =
      test.inputs === undefined
        ? Object.fromEntries(
            route.fields
              .filter((field) => Object.hasOwn(values, field.name))
              .map((field) => [field.name, values[field.name]]),
          )
        : structuredClone(test.inputs);
    if (positive)
      for (const field of route.fields)
        if (field.required && !Object.hasOwn(inputs, field.name))
          fail(ref, `missing required input '${field.name}'`);
    const assertions: Record<string, unknown> = positive
      ? Object.fromEntries(
          Object.entries(values).map(([name, value]) => [
            fieldPath(name),
            value,
          ]),
        )
      : {};
    for (const [path, value] of Object.entries(test.expect ?? {})) {
      if (
        Object.hasOwn(assertions, path) &&
        stable(assertions[path]) !== stable(value)
      )
        fail(ref, `conflicting assertion '${path}'`);
      assertions[path] = value;
    }
    const step: AcceptanceStep = {
      ref,
      route,
      asOf: test.asOf,
      actingRoleRef: test.actingRoleRef,
      status: status!,
      inputs,
      assertions,
      parameters: {},
      captures: {},
    };
    const names = [...route.path.matchAll(/\{([^{}]+)\}/g)].map(
      (match) => match[1]!,
    );
    for (const name of Object.keys(test.pathParameters ?? {}))
      if (!names.includes(name)) fail(ref, `unknown path parameter '${name}'`);
    for (const name of names) {
      let source = test.pathParameters?.[name];
      if (source === undefined) {
        const entityRef =
          name === 'contractId'
            ? route.contractRef
            : name === 'requestId'
              ? route.requestRef
              : null;
        const candidates = upstream.filter(
          (source) => source.route.entityRef === entityRef,
        );
        if (
          candidates.length !== 1 ||
          !candidates[0]!.route.outputFields.some(
            (field) => field.name === 'id',
          )
        )
          fail(
            ref,
            `path parameter '${name}' needs an explicit exampleRef/jsonpath source`,
          );
        source = { exampleRef: candidates[0]!.ref, jsonpath: '$.id' };
      }
      const producer = steps.get(source.exampleRef);
      if (producer === undefined)
        fail(
          ref,
          `capture source '${source.exampleRef}' is not an earlier step`,
        );
      const existing = Object.entries(producer!.captures).find(
        ([, path]) => path === source!.jsonpath,
      )?.[0];
      const variable =
        existing ??
        `capture_${steps.size}_${Object.keys(producer!.captures).length}`;
      producer!.captures[variable] = source.jsonpath;
      step.parameters[name] = variable;
    }
    facts.set(ref, values);
    steps.set(ref, step);
    const flow: AcceptanceFlow = flows.get(test.flow) ?? {
      id: test.flow,
      steps: [],
    };
    flow.steps.push(step);
    flows.set(test.flow, flow);
  }
  return {
    modelId: model.manifest.id,
    flows: [...flows.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
