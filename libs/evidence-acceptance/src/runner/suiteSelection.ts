import { createHash } from 'node:crypto';
import type {
  AcceptanceFlow,
  AcceptanceProjection,
} from '../delivery/scenarioProjector.js';

export type AcceptanceGate = 'regression' | 'dod';
interface FlowFilters {
  readonly gate?: AcceptanceGate;
  /** Flow ID substring, or * / ? glob. Always selects whole flows. */
  readonly filter?: string;
  readonly tags?: readonly string[];
}
export interface SuiteSelection extends FlowFilters {
  readonly baseline?: AcceptanceProjection;
}

export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : item,
  );

/** Strip annotations only at schema nodes, never from property names or const data. */
export function validationSchema(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          ![
            'examples',
            'example',
            'description',
            'title',
            '$comment',
            'deprecated',
            'default',
            'readOnly',
            'writeOnly',
          ].includes(key) && !key.startsWith('x-'),
      )
      .map(([key, item]) => {
        if (
          [
            'properties',
            'patternProperties',
            '$defs',
            'definitions',
            'dependentSchemas',
          ].includes(key) &&
          item &&
          typeof item === 'object'
        )
          return [
            key,
            Object.fromEntries(
              Object.entries(item).map(([name, schema]) => [
                name,
                validationSchema(schema),
              ]),
            ),
          ];
        if (
          ['allOf', 'anyOf', 'oneOf', 'prefixItems'].includes(key) &&
          Array.isArray(item)
        )
          return [key, item.map(validationSchema)];
        if (
          [
            'items',
            'additionalProperties',
            'unevaluatedProperties',
            'unevaluatedItems',
            'contains',
            'not',
            'if',
            'then',
            'else',
            'propertyNames',
            'contentSchema',
          ].includes(key)
        )
          return [key, validationSchema(item)];
        return [key, item];
      }),
  );
}

/** Wire semantics only: a variable name is replaced by its producer and JSONPath. */
export function fingerprintFlow(flow: AcceptanceFlow): string {
  const captures = new Map<string, { producer: number; path: string }>();
  const steps = flow.steps.map((step, index) => {
    const path = step.route.path.split(/\{([^{}]+)\}/g).map((part, i) => {
      if (i % 2 === 0) return part;
      const variable = step.parameters[part];
      const binding =
        variable === undefined ? undefined : captures.get(variable);
      if (!binding)
        throw new Error(
          `Missing upstream capture for '${part}' in ${step.ref}`,
        );
      return binding;
    });
    for (const [variable, path] of Object.entries(step.captures))
      captures.set(variable, { producer: index, path });
    return {
      method: step.route.method,
      path,
      asOf: step.asOf,
      actingRoleRef: step.actingRoleRef,
      status: step.status,
      inputs: step.inputs,
      assertions: step.assertions,
      responseSchema: validationSchema(step.responseSchema),
    };
  });
  return createHash('sha256').update(canonical(steps)).digest('hex');
}

function matches(name: string, pattern: string): boolean {
  if (!/[?*]/.test(pattern)) return name.includes(pattern);
  const expression = pattern
    .split(/([?*])/)
    .map((part) =>
      part === '*'
        ? '.*'
        : part === '?'
          ? '.'
          : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^${expression}$`).test(name);
}

export interface SelectableFlow<T> {
  readonly name: string;
  readonly tags: () => readonly string[];
  readonly fingerprint: () => string;
  readonly value: T;
}

/** Shared gate policy; the Step CI adapter only supplies a view of legacy suites. */
export function selectFlows<T>(
  current: readonly SelectableFlow<T>[],
  baseline: readonly SelectableFlow<T>[] | undefined,
  options: FlowFilters,
): T[] {
  const { gate, filter } = options;
  const byName = (flows: readonly SelectableFlow<T>[]) => {
    const result = new Map<string, SelectableFlow<T>>();
    for (const flow of flows) {
      if (result.has(flow.name))
        throw new Error(`Ambiguous duplicate flow name: ${flow.name}`);
      result.set(flow.name, flow);
    }
    return result;
  };
  byName(current);
  const previous = baseline && byName(baseline);
  const source = gate === 'regression' && baseline ? baseline : current;
  const selected = source.filter((flow) => {
    const tags = flow.tags();
    if (filter !== undefined && !matches(flow.name, filter)) return false;
    if (options.tags?.some((tag) => !tags.includes(tag))) return false;
    if (!gate) return true;
    if (!previous) return tags.includes(gate);
    if (gate === 'regression') return true;
    const prior = previous.get(flow.name);
    return !prior || flow.fingerprint() !== prior.fingerprint();
  });
  if (
    selected.length === 0 &&
    !(gate === 'dod' && baseline && !filter && !options.tags?.length)
  )
    throw new Error(
      'No acceptance flows selected; check baseline, --filter or --tag (gates without baseline require explicit gate tags)',
    );
  return selected.map(({ value }) => value);
}

export function selectAcceptanceFlows(
  current: AcceptanceProjection,
  options: SuiteSelection,
): AcceptanceProjection {
  const { baseline, gate } = options;
  const entries = (projection: AcceptanceProjection) =>
    projection.flows.map((flow) => ({
      name: flow.id,
      tags: () => [`flow:${flow.id}`, ...(flow.tags ?? [])],
      fingerprint: () => fingerprintFlow(flow),
      value: flow,
    }));
  const flows = selectFlows(
    entries(current),
    baseline && entries(baseline),
    options,
  );
  const source = gate === 'regression' && baseline ? baseline : current;
  return { modelId: source.modelId, flows: structuredClone(flows) };
}
