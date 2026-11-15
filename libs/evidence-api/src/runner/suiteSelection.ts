import type { Workflow } from '@stepci/runner';

export type AcceptanceGate = 'regression' | 'dod';
export interface SuiteSelection {
  readonly gate?: AcceptanceGate;
  readonly baseline?: Workflow;
  /** Flow name substring, or * / ? glob. Always selects whole flows. */
  readonly filter?: string;
  readonly tags?: readonly string[];
}
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );

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
  return canonical(visit(test.steps));
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

export function selectAcceptanceFlows(
  current: Workflow,
  options: SuiteSelection,
): Workflow {
  const { baseline, gate } = options;
  const source = gate === 'regression' && baseline ? baseline : current;
  const names = new Set<string>();
  for (const workflow of [current, ...(baseline ? [baseline] : [])]) {
    names.clear();
    for (const [id, test] of Object.entries(workflow.tests)) {
      const name = test.name ?? id;
      if (names.has(name))
        throw new Error(`Ambiguous duplicate flow name: ${name}`);
      names.add(name);
    }
  }
  const baseByName = new Map(
    Object.entries(baseline?.tests ?? {}).map(([id, test]) => [
      test.name ?? id,
      test,
    ]),
  );
  const tests = Object.fromEntries(
    Object.entries(source.tests).filter(([id, test]) => {
      const name = test.name ?? id;
      const tags = tagsOf(test);
      if (options.filter !== undefined && !matches(name, options.filter))
        return false;
      if (
        options.tags?.length &&
        !options.tags.every((tag) => tags.includes(tag))
      )
        return false;
      if (!gate) return true;
      if (!baseline) return tags.includes(gate);
      if (gate === 'regression') return true;
      const previous = baseByName.get(name);
      return (
        !previous ||
        fingerprint(current, test) !== fingerprint(baseline, previous)
      );
    }),
  );
  if (
    Object.keys(tests).length === 0 &&
    !(gate === 'dod' && baseline && !options.filter && !options.tags?.length)
  )
    throw new Error(
      'No acceptance flows selected; check baseline, --filter or --tag (gates without baseline require explicit gate tags)',
    );
  return { ...structuredClone(source), tests: structuredClone(tests) };
}
