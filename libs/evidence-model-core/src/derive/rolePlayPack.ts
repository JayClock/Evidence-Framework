import type { AttributeAST, DomainModelDocument, EntityAST } from '@evidence-poc/evidence-schema';

import { simulateValidationSuite, type ScenarioResult } from '../validation/simulation.js';
import type {
  EvidenceInstance,
  Scenario,
  ScenarioEvaluation,
  ScenarioStep,
  ValidationSuite,
} from '../validation/validationSuite.js';

/**
 * A human role-play packet for one scenario.
 *
 * The packet is what a facilitator hands out: blank documents a participant
 * fills in, source documents they may read, one sheet per Role, the facilitator's
 * expected outcome and an audit checklist. Every value in it is derivable from
 * the scenario that just passed, so a packet cannot describe a run that would not
 * simulate.
 */

export class RolePlayPackError extends Error {
  readonly errors: readonly string[];

  constructor(message: string, errors: readonly string[]) {
    super([message, ...errors.map((item) => `- ${item}`)].join('\n'));
    this.name = 'RolePlayPackError';
    this.errors = errors;
  }
}

/** `instance.payment-request` → `instance--payment-request.md`. */
const fileNameOf = (ref: string): string => `${ref.split('.').join('--')}.md`;

/**
 * JSON with the separators the packet has always printed.
 *
 * `json.dumps` writes `", "` between entries and `": "` after a key, and the
 * packet is read by a person, so the spacing is part of what they compare
 * against a recorded session.
 */
const packetJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => packetJson(item)).join(', ')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );

    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}: ${packetJson(item)}`)
      .join(', ')}}`;
  }

  return JSON.stringify(value) ?? 'null';
};

const renderValue = (value: unknown): string =>
  typeof value === 'object' && value !== null
    ? `\`${packetJson(value)}\``
    : `\`${String(value)}\``;

const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortKeysDeep(item)]),
    );
  }

  return value;
};

const attributesOf = (entity: EntityAST): readonly AttributeAST[] =>
  [...(entity.attributes ?? [])].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

const documentTemplate = (
  instance: EvidenceInstance,
  entity: EntityAST,
  revealValues: boolean,
): string => {
  const valueColumn = revealValues ? 'Provided value' : 'Role-play entry';
  const lines = [
    `# ${entity.label} · ${instance.id}`,
    '',
    `- Evidence type: \`${instance.entityRef}\``,
    `- Based on: ${(instance.basedOn ?? []).map((item) => `\`${item}\``).join(', ') || 'none'}`,
    '',
    `| Field | Type | Required | Key data | ${valueColumn} |`,
    '|---|---|---:|---:|---|',
  ];

  for (const attribute of attributesOf(entity)) {
    const supplied =
      revealValues && attribute.name in instance.values
        ? renderValue(instance.values[attribute.name])
        : '________________';

    lines.push(
      `| \`${attribute.name}\` | \`${attribute.valueType ?? ''}\` | ` +
        `${attribute.required === true ? 'yes' : 'no'} | ` +
        `${attribute.keyData === true ? 'yes' : 'no'} | ${supplied} |`,
    );
  }

  lines.push(
    '',
    '> During the exercise, use only evidence explicitly available to your Role.',
    '',
  );

  return lines.join('\n');
};

const evaluationReferences = (
  evaluation: ScenarioEvaluation,
): ReadonlySet<string> => {
  const refs = new Set<string>();

  if (evaluation.targetInstanceRef !== undefined) {
    refs.add(evaluation.targetInstanceRef);
  }

  for (const binding of Object.values(evaluation.bindings)) {
    if ('instanceRef' in binding) {
      refs.add(binding.instanceRef);
    } else if ('instanceRefs' in binding) {
      binding.instanceRefs.forEach((ref) => refs.add(ref));
    }
  }

  return refs;
};

const roleSheet = ({
  model,
  role,
  steps,
  instances,
  scenario,
}: {
  model: DomainModelDocument;
  role: EntityAST;
  steps: readonly ScenarioStep[];
  instances: ReadonlyMap<string, EvidenceInstance>;
  scenario: Scenario;
}): string => {
  const rules = new Map(model.rules.map((rule) => [rule.id, rule] as const));
  const lines = [
    `# Role · ${role.label}`,
    '',
    `Role ID: \`${role.id}\``,
    `Scenario as-of: \`${scenario.asOf}\``,
    '',
    'Do not use facilitator expectations or facts that are not present in the listed documents.',
    '',
  ];
  const sequenceOf = new Map(
    scenario.steps.map((step) => [step.issueInstanceRef, step.sequence] as const),
  );
  const given = new Set(scenario.givenInstanceRefs ?? []);

  for (const step of steps) {
    const instance = instances.get(step.issueInstanceRef);
    const available =
      step.availableInstanceRefs ?? instance?.basedOn ?? [];

    lines.push(
      `## Step ${step.sequence}`,
      '',
      `Available evidence: ${available.map((item) => `\`${item}\``).join(', ') || 'none'}`,
      `Issue document: \`${step.issueInstanceRef}\` (\`${instance?.entityRef ?? ''}\`)`,
      '',
      'Questions before issuing:',
      '',
      '- Why is this Role responsible for issuing this Evidence?',
      '- Are all required values available from the listed evidence?',
      '- Which key values are asserted, and which are derived?',
      '- What would prevent this document from being accepted as proof?',
      '',
      'Applicable modeled rules (expressions are policy, not expected answers):',
      '',
    );

    const issuedSoFar = new Set([
      ...given,
      ...[...sequenceOf]
        .filter(([, sequence]) => sequence <= step.sequence)
        .map(([ref]) => ref),
    ]);
    const applicable = (scenario.evaluations ?? [])
      .filter((evaluation) => {
        const refs = evaluationReferences(evaluation);

        return (
          refs.has(step.issueInstanceRef) &&
          [...refs].every((ref) => issuedSoFar.has(ref))
        );
      })
      .sort((left, right) => left.ruleRef.localeCompare(right.ruleRef));

    if (applicable.length === 0) {
      lines.push('- none', '');
      continue;
    }

    for (const evaluation of applicable) {
      const rule = rules.get(evaluation.ruleRef);
      const bindingSources = Object.fromEntries(
        Object.entries(evaluation.bindings).map(([variable, source]) => [
          variable,
          'instanceRef' in source
            ? source.instanceRef
            : 'instanceRefs' in source
              ? source.instanceRefs
              : 'scenario value',
        ]),
      );

      lines.push(
        `- \`${evaluation.ruleRef}\` (${rule?.kind ?? ''}): \`${rule?.expression ?? ''}\``,
        `  - Evidence bindings: \`${packetJson(bindingSources)}\``,
        '',
      );
    }
  }

  return lines.join('\n');
};

const facilitatorSheet = (scenario: Scenario, result: ScenarioResult): string => {
  const lines = [
    `# Facilitator · ${scenario.label}`,
    '',
    `- Scenario: \`${scenario.id}\``,
    `- Fixed as-of time: \`${scenario.asOf}\``,
    `- Machine validation: \`${result.machineValidated ? 'passed' : 'failed'}\``,
    `- Scenario simulation: \`${result.simulationPassed ? 'passed' : 'failed'}\``,
    '',
    '## Evidence sequence',
    '',
  ];
  const finalValues = new Map(
    result.instanceValues.map((item) => [item.instanceRef, item] as const),
  );

  for (const instanceRef of result.issuedInstanceRefs) {
    const item = finalValues.get(instanceRef);

    lines.push(
      `- \`${instanceRef}\` → \`${String(item?.entityRef ?? '')}\`; values: ` +
        `\`${packetJson(item?.values ?? {})}\``,
    );
  }

  lines.push('', '## Expected rule results', '');

  for (const evaluation of result.evaluations) {
    lines.push(
      `- \`${evaluation.ruleRef}\`: \`${JSON.stringify(evaluation.result)}\``,
    );
  }

  lines.push('', '## Expected fulfillment outcomes', '');

  for (const status of result.fulfillmentStatuses) {
    lines.push(
      `- \`${status.requestInstanceRef}\`: \`${status.expectedStatus}\``,
    );
  }

  lines.push(
    '',
    '## Facilitation rule',
    '',
    'Do not reveal later evidence or expected outcomes to a participant before their step.',
    'Record every piece of oral knowledge needed to continue; each one is a model gap candidate.',
    '',
  );

  return lines.join('\n');
};

const AUDIT_CHECKLIST = `# Audit and dispute checklist

- Can the reviewer prove that the Contract or agreement existed?
- Which Role was responsible for each Evidence?
- Was the Request validly issued and available to its recipient?
- What business deadline applied, and where did it come from?
- Does the Confirmation prove full, partial, or no completion?
- Can every critical amount, quantity, time, and KPI be traced to source evidence?
- Were correction, cancellation, refund, reversal, and compensation recorded as new Evidence?
- Can the conclusion be reached without oral background knowledge?
- Would adding another external channel leave the core contract model unchanged?

## Observations

- Missing evidence:
- Missing key data:
- Hidden oral knowledge:
- Ambiguous Evidence responsibility:
- Proposed model correction:
- Stakeholder decision:
`;

export interface RolePlayPack {
  /** POSIX path relative to the packet root → file content. */
  files: ReadonlyMap<string, string>;
  scenarioId: string;
}

/**
 * Builds the packet in memory.
 *
 * Nothing is written here: a caller decides where it goes, and a failing
 * scenario raises before a partial packet can appear on disk.
 */
export const buildRolePlayPack = ({
  model,
  suite,
  scenarioId,
}: {
  model: DomainModelDocument;
  suite: ValidationSuite;
  scenarioId: string;
}): RolePlayPack => {
  const scenario = suite.scenarios.find((item) => item.id === scenarioId);

  if (scenario === undefined) {
    throw new RolePlayPackError('Cannot generate role-play packet:', [
      `unknown scenario id '${scenarioId}'`,
    ]);
  }

  const { report, errors } = simulateValidationSuite(model, suite, [scenarioId]);

  if (errors.length > 0) {
    throw new RolePlayPackError(
      'Cannot generate role-play packet from a failing scenario:',
      errors,
    );
  }

  const result = report.scenarioResults[0];

  if (result === undefined) {
    throw new RolePlayPackError('Cannot generate role-play packet:', [
      'the scenario produced no result',
    ]);
  }

  const entities = new Map(model.entities.map((entity) => [entity.id, entity] as const));
  const instances = new Map(suite.instances.map((instance) => [instance.id, instance] as const));
  const given = new Set(scenario.givenInstanceRefs ?? []);
  const files = new Map<string, string>();

  for (const instanceRef of result.issuedInstanceRefs) {
    const instance = instances.get(instanceRef);
    const entity = instance === undefined ? undefined : entities.get(instance.entityRef);

    if (instance === undefined || entity === undefined) {
      continue;
    }

    const revealValues = given.has(instanceRef);

    files.set(
      `${revealValues ? 'source-documents' : 'blank-documents'}/${fileNameOf(instanceRef)}`,
      documentTemplate(instance, entity, revealValues),
    );
  }

  const stepsByRole = new Map<string, ScenarioStep[]>();

  for (const step of scenario.steps) {
    stepsByRole.set(step.actingRoleRef, [
      ...(stepsByRole.get(step.actingRoleRef) ?? []),
      step,
    ]);
  }

  for (const [roleRef, steps] of [...stepsByRole].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const role = entities.get(roleRef);

    if (role === undefined) {
      continue;
    }

    files.set(
      fileNameOf(roleRef),
      roleSheet({ model, role, steps, instances, scenario }),
    );
  }

  files.set('facilitator.md', facilitatorSheet(scenario, result));
  files.set('audit-checklist.md', AUDIT_CHECKLIST);

  const manifest = {
    modelId: model.manifest.id,
    scenarioId,
    asOf: result.asOf,
    machineValidated: result.machineValidated,
    simulationPassed: result.simulationPassed,
    files: [...files.keys(), 'manifest.json'].sort(),
  };

  files.set(
    'manifest.json',
    `${JSON.stringify(sortKeysDeep(manifest), null, 2)}\n`,
  );

  return { files, scenarioId };
};
