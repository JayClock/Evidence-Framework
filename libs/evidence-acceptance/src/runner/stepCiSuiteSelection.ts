import type { Workflow } from '@stepci/runner';
import {
  canonical,
  selectFlows,
  validationSchema,
  type SuiteSelection,
} from './suiteSelection.js';

export interface StepCiSuiteSelection extends Omit<SuiteSelection, 'baseline'> {
  readonly baseline?: Workflow;
}

/** Compare executable semantics, not generated flow ordinals or capture variable names. */
function fingerprint(
  workflow: Workflow,
  test: Workflow['tests'][string],
): string {
  const captures = new Map<string, string>();
  test.steps.forEach((step, index) => {
    for (const [name, source] of Object.entries(step.http?.captures ?? {}))
      captures.set(name, `step:${step.name ?? index}:${canonical(source)}`);
  });
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string')
      return value.replace(
        /\$\{\{(env|captures)\.([^}]+)\}\}/g,
        (match, kind: string, key: string) =>
          kind === 'captures'
            ? (captures.get(key) ?? match)
            : key === 'host'
              ? match
              : String(
                  (test.env as Record<string, unknown> | undefined)?.[key] ??
                    workflow.env?.[key] ??
                    match,
                ),
      );
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          captures.get(key) ?? key,
          visit(item),
        ]),
      );
    return value;
  };
  const steps = structuredClone(test.steps);
  for (const step of steps)
    if (step.http?.check?.schema)
      step.http.check.schema = validationSchema(
        step.http.check.schema,
      ) as object;
  return canonical(visit(steps));
}
function tagsOf(test: Workflow['tests'][string]): string[] {
  const value = (test.env as Record<string, unknown> | undefined)?.[
    'evidenceTags'
  ];
  if (value === undefined) return [];
  const tags: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string'))
    throw new Error('Flow env.evidenceTags must be a JSON array of strings');
  return tags;
}

/** Phase 1 keeps the existing YAML runner working until the Bruno cutover. */
export function selectStepCiFlows(
  current: Workflow,
  options: StepCiSuiteSelection,
): Workflow {
  const { baseline, gate } = options;
  const entries = (workflow: Workflow) =>
    Object.entries(workflow.tests).map(([id, test]) => ({
      name: test.name ?? id,
      tags: () => tagsOf(test),
      fingerprint: () => fingerprint(workflow, test),
      value: [id, test] as const,
    }));
  const tests = Object.fromEntries(
    selectFlows(entries(current), baseline && entries(baseline), options),
  );
  const source = gate === 'regression' && baseline ? baseline : current;
  return structuredClone({ ...source, tests });
}
