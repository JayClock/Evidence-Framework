import {
  compactCanonicalJson,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import { digestOf } from '../validation/modelDigest.js';
import type { FmCheckReport } from '../validation/fmCheck.js';
import type {
  FlowScenarioTrace,
  FlowStepTrace,
  StepFingerprintInput,
} from './types.js';

/** Hash only local facts, even when passed a complete step at runtime. */
export const computeStepHash = (input: StepFingerprintInput): string =>
  digestOf(
    compactCanonicalJson({
      entityId: input.entityId,
      entityKind: input.entityKind,
      actingRoleRef: input.actingRoleRef,
      asOf: input.asOf,
      basedOn: input.basedOn,
      values: input.values,
      derivedAssertions: input.derivedAssertions,
    }),
  );

export type FlowScenarioErrorCode =
  | 'DUPLICATE_EXAMPLE_REF'
  | 'UNKNOWN_DEPENDENCY'
  | 'AMBIGUOUS_DEPENDENCY'
  | 'CROSS_FLOW_DEPENDENCY'
  | 'CYCLIC_DEPENDENCY';

/** Invalid example graphs are never silently flattened into a story. */
export class FlowScenarioError extends Error {
  constructor(
    readonly code: FlowScenarioErrorCode,
    readonly flowId: string,
    readonly exampleRefs: readonly string[],
    detail: string,
    readonly dependencyRef?: string,
  ) {
    super(`${code}: flow '${flowId}': ${detail}`);
    this.name = 'FlowScenarioError';
  }
}

interface TraceNode {
  ref: string;
  flowId: string;
  time: number;
  step: Omit<FlowStepTrace, 'sequence'>;
  dependencies: Set<TraceNode>;
  dependents: Set<TraceNode>;
}

const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
const compareNodes = (a: TraceNode, b: TraceNode): number =>
  a.time - b.time || compareText(a.ref, b.ref);
const sortedUnique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort(compareText);

/** Descending ready queue: pop() always takes the earliest available step. */
const insertReady = (ready: TraceNode[], node: TraceNode): void => {
  let low = 0;
  let high = ready.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareNodes(ready[middle], node) > 0) low = middle + 1;
    else high = middle;
  }
  ready.splice(low, 0, node);
};

/** Find an actual cycle, excluding downstream nodes merely blocked by it. */
const cycleRefs = (nodes: readonly TraceNode[]): string[] => {
  const visited = new Set<TraceNode>();
  const active = new Map<TraceNode, number>();
  const frame = (node: TraceNode) => ({
    node,
    dependencies: [...node.dependencies]
      .sort((a, b) => compareText(a.ref, b.ref))
      .values(),
  });
  for (const root of [...nodes].sort((a, b) => compareText(a.ref, b.ref))) {
    if (visited.has(root)) continue;
    const stack = [frame(root)];
    active.set(root, 0);
    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const next = current.dependencies.next();
      if (next.done) {
        visited.add(current.node);
        active.delete(current.node);
        stack.pop();
      } else {
        const start = active.get(next.value);
        if (start !== undefined)
          return stack.slice(start).map(({ node }) => node.ref);
        if (!visited.has(next.value)) {
          active.set(next.value, stack.length);
          stack.push(frame(next.value));
        }
      }
    }
  }
  return [];
};

const orderFlow = (
  flowId: string,
  nodes: readonly TraceNode[],
): FlowStepTrace[] => {
  const indegrees = new Map(
    nodes.map((node) => [node, node.dependencies.size]),
  );
  const ready = nodes
    .filter((node) => indegrees.get(node) === 0)
    .sort((a, b) => compareNodes(b, a));
  const ordered: FlowStepTrace[] = [];
  for (let node = ready.pop(); node !== undefined; node = ready.pop()) {
    ordered.push({ ...node.step, sequence: ordered.length + 1 });
    for (const dependent of node.dependents) {
      const remaining = (indegrees.get(dependent) ?? 0) - 1;
      indegrees.set(dependent, remaining);
      if (remaining === 0) insertReady(ready, dependent);
    }
  }
  if (ordered.length !== nodes.length) {
    const refs = cycleRefs(
      nodes.filter((node) => (indegrees.get(node) ?? 0) > 0),
    );
    throw new FlowScenarioError(
      'CYCLIC_DEPENDENCY',
      flowId,
      refs,
      `cyclic example dependencies: ${[...refs, refs[0]].join(' -> ')}`,
    );
  }
  return ordered;
};

/**
 * Extract declared facts without validation, rule execution, I/O or test runs.
 * Canonical entityId#exampleLabel refs take precedence over value.id/value.ref
 * aliases; aliases must be unambiguous within their flow. Dependencies cannot
 * cross flows. All declared tests, including negative cases, remain visible.
 *
 * Reuse an existing FM report when available; no report means no reported gaps.
 * Gap subjects use the checker's `entityId[.attribute]: message` convention;
 * context gaps also apply to the steps in that context. Assertions are copied
 * from test.expect, not evaluated. The input model/report are never modified.
 */
export const collectFlowScenarios = (
  model: DomainModelDocument,
  fmCheckReport?: Pick<FmCheckReport, 'gaps'>,
): readonly FlowScenarioTrace[] => {
  const cases = new Map<string, TraceNode>();
  const aliases = new Map<string, Set<TraceNode>>();
  const flows = new Map<string, TraceNode[]>();
  const gapsBySubject = new Map<string, string[]>();
  for (const gap of fmCheckReport?.gaps ?? []) {
    const separator = gap.indexOf(':');
    if (separator < 0) continue;
    const subject = gap.slice(0, separator);
    const gaps = gapsBySubject.get(subject) ?? [];
    gaps.push(gap);
    gapsBySubject.set(subject, gaps);
  }
  for (const entity of model.entities) {
    const contextRef = 'contextRef' in entity ? entity.contextRef : undefined;
    const subjects = [
      entity.id,
      ...(contextRef === undefined ? [] : [contextRef]),
      ...(entity.attributes ?? []).map(
        (attribute) => `${entity.id}.${attribute.name}`,
      ),
    ];
    const gaps = sortedUnique(
      subjects.flatMap((subject) => gapsBySubject.get(subject) ?? []),
    );
    for (const example of entity.examples ?? []) {
      const test = example.test;
      if (!test?.flow) continue;
      const ref = `${entity.id}#${example.label}`;
      if (cases.has(ref))
        throw new FlowScenarioError(
          'DUPLICATE_EXAMPLE_REF',
          test.flow,
          [ref],
          `duplicate example '${ref}'`,
        );
      const input: StepFingerprintInput = {
        entityId: entity.id,
        entityKind: entity.kind,
        actingRoleRef: test.actingRoleRef,
        asOf: test.asOf,
        basedOn: [...(test.basedOn ?? [])],
        values: structuredClone(example.value),
        ...(test.expect === undefined
          ? {}
          : { derivedAssertions: structuredClone(test.expect) }),
      };
      const node: TraceNode = {
        ref,
        flowId: test.flow,
        time: Date.parse(test.asOf),
        step: {
          ...input,
          stepHash: computeStepHash(input),
          entityLabel: entity.label,
          ...(contextRef === undefined ? {} : { contextRef }),
          ...('responsibleRoleRef' in entity &&
          entity.responsibleRoleRef !== undefined
            ? { responsibleRoleRef: entity.responsibleRoleRef }
            : {}),
          exampleLabel: example.label,
          gaps,
        },
        dependencies: new Set(),
        dependents: new Set(),
      };
      cases.set(ref, node);
      for (const alias of [example.value.id, example.value.ref]) {
        if (typeof alias !== 'string' || alias.length === 0) continue;
        const matches = aliases.get(alias) ?? new Set<TraceNode>();
        matches.add(node);
        aliases.set(alias, matches);
      }
      const flow = flows.get(test.flow) ?? [];
      flow.push(node);
      flows.set(test.flow, flow);
    }
  }
  for (const node of cases.values()) {
    for (const ref of node.step.basedOn) {
      const exact = cases.get(ref);
      const candidates =
        exact === undefined ? [...(aliases.get(ref) ?? [])] : [exact];
      const local = candidates.filter(
        (candidate) => candidate.flowId === node.flowId,
      );
      const code =
        candidates.length === 0
          ? 'UNKNOWN_DEPENDENCY'
          : local.length === 0
            ? 'CROSS_FLOW_DEPENDENCY'
            : local.length > 1
              ? 'AMBIGUOUS_DEPENDENCY'
              : undefined;
      if (code !== undefined)
        throw new FlowScenarioError(
          code,
          node.flowId,
          sortedUnique([
            node.ref,
            ...candidates.map((candidate) => candidate.ref),
          ]),
          `'${node.ref}' cannot resolve dependency '${ref}' (${code})`,
          ref,
        );
      const dependency = local[0];
      node.dependencies.add(dependency);
      dependency.dependents.add(node);
    }
  }
  return [...flows]
    .sort(([a], [b]) => compareText(a, b))
    .map(([flowId, nodes]) => {
      const steps = orderFlow(flowId, nodes);
      return {
        flowId,
        flowTitle: flowId,
        involvedContextRefs: sortedUnique(
          steps.flatMap((step) =>
            step.contextRef === undefined ? [] : [step.contextRef],
          ),
        ),
        involvedRoleRefs: sortedUnique(
          steps.flatMap((step) =>
            [step.actingRoleRef, step.responsibleRoleRef].filter(
              (ref): ref is string => ref !== undefined,
            ),
          ),
        ),
        steps,
        traceDigest: digestOf(steps.map((step) => step.stepHash).join('')),
      };
    });
};
