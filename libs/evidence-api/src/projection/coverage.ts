import type { DesignDocument } from '../loader/apiLoader.js';
import type { FmIndex } from '../adapter/fmAdapter.js';
import {
  errorDiagnostic,
  gapDiagnostic,
  type Diagnostic,
} from '../diagnostics.js';
import { compareText } from '../order.js';
import type { ProjectedCapability } from './capabilities.js';

/**
 * Whether the API actually carries the business scenarios the model asserts.
 *
 * Two directions are checked and they are not the same question. Every FM step
 * has to land somewhere — an interface call or a declared internal/external
 * activity — and every declared journey step has to correspond to one it can
 * honestly perform. A missing direction would let a scenario look covered by a
 * journey that never happens.
 */

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const recordsOf = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const idOf = (item: JsonObject): string => String(item['id']);

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/** One FM step and where the design says it happens. */
export interface CoverageStep {
  sourceStepRef?: string;
  sequence: number;
  status: 'mapped' | 'gap';
  mapping?: string;
  /** Null when the step is not an interface call, and the report says so. */
  capabilityRef?: string | null;
  actingRoleRef?: unknown;
}

/** One scenario, with the steps it covers. */
export interface CoverageRow {
  journeyId?: string;
  scenarioRef?: string;
  sourceScenarioRef: string;
  status: 'mapped' | 'gap';
  steps: CoverageStep[];
}

const stepStatusOf = (
  mapped: JsonObject,
  sourceStep: { issueInstanceRef: string; actingRoleRef: string },
  sourceRef: string,
  design: DesignDocument,
  index: FmIndex,
  capabilities: ReadonlyMap<string, ProjectedCapability>,
): { status: 'mapped' | 'gap'; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const mappedId = idOf(mapped);
  const mapping = asString(mapped['mapping']);
  const entityRef = index.instances.get(sourceStep.issueInstanceRef)?.entityRef;

  if (mapping === 'capability') {
    const capability = capabilities.get(asString(mapped['capabilityRef']) ?? '');
    const scenarios = new Map(
      recordsOf(design['scenarios']).map(
        (item) => [idOf(item), asString(item['sourceScenarioRef'])] as const,
      ),
    );

    if (capability === undefined) {
      diagnostics.push(
        gapDiagnostic(
          'SCENARIO_UNCOVERED',
          `${mappedId}.capability`,
          'coverage',
          '流程步骤引用的接口不存在或无效',
          mappedId,
        ),
      );
    } else {
      const effect = isRecord(capability['effect']) ? capability['effect'] : {};
      const effectKind = asString(effect['kind']);
      const effectTarget = asString(effect['targetRef']);
      const backedScenarios = new Set(
        stringsOf(capability['scenarioRefs'])
          .map((reference) => scenarios.get(reference))
          .filter((value): value is string => value !== undefined),
      );

      if (
        capability.actorRoleRef !== sourceStep.actingRoleRef ||
        effectKind !== 'append_evidence' ||
        effectTarget !== entityRef ||
        !backedScenarios.has(sourceRef)
      ) {
        diagnostics.push(
          errorDiagnostic(
            'SCENARIO_CAPABILITY_MISMATCH',
            '接口角色、凭证效果或场景依据与 FM 步骤不一致',
            mappedId,
          ),
        );
      }
    }

    return { status: diagnostics.length > 0 ? 'gap' : 'mapped', diagnostics };
  }

  if (mapping === 'internal' || mapping === 'external') {
    const handling = recordsOf(design['nonApiActivities']).find(
      (item) => item['entityRef'] === entityRef,
    );

    if (handling === undefined || handling['handling'] !== mapping) {
      diagnostics.push(
        gapDiagnostic(
          'SCENARIO_HANDLING_MISMATCH',
          `${mappedId}.handling`,
          'coverage',
          '非接口步骤必须与整体模型的内部／外部活动说明一致',
          mappedId,
        ),
      );
    }

    return { status: diagnostics.length > 0 ? 'gap' : 'mapped', diagnostics };
  }

  diagnostics.push(
    gapDiagnostic(
      'SCENARIO_UNCOVERED',
      `${mappedId}.mapping`,
      'coverage',
      '流程步骤尚未映射',
      mappedId,
    ),
  );

  return { status: 'gap', diagnostics };
};

export interface ProjectCoverageResult {
  coverage: CoverageRow[];
  diagnostics: Diagnostic[];
}

/**
 * Maps every FM scenario step onto what the design does with it.
 *
 * A step that is neither called nor explained is a gap, not an omission: the
 * business says the interaction happens, so silence is a question.
 */
export const projectCoverage = (
  design: DesignDocument,
  index: FmIndex,
  capabilities: readonly ProjectedCapability[],
): ProjectCoverageResult => {
  const diagnostics: Diagnostic[] = [];
  const scenarioDesign = new Map(
    recordsOf(design['scenarios']).map((item) => [idOf(item), item] as const),
  );
  const capabilityMap = new Map(
    capabilities.map((item) => [item.id, item] as const),
  );
  const coverage: CoverageRow[] = [];
  const mappedScenarios = new Set<string>();

  for (const scenario of scenarioDesign.values()) {
    if (!index.scenarios.has(String(scenario['sourceScenarioRef'] ?? ''))) {
      diagnostics.push(
        errorDiagnostic(
          'SCENARIO_REF_NOT_FOUND',
          'API 场景引用的 FM 场景不存在',
          idOf(scenario),
        ),
      );
    }
  }

  for (const journey of recordsOf(design['journeys']).sort((left, right) =>
    compareText(idOf(left), idOf(right)),
  )) {
    const journeyId = idOf(journey);
    const scenario = scenarioDesign.get(asString(journey['scenarioRef']) ?? '');
    const source =
      scenario === undefined
        ? undefined
        : index.scenarios.get(String(scenario['sourceScenarioRef'] ?? ''));

    if (source === undefined || scenario === undefined) {
      diagnostics.push(
        errorDiagnostic('SCENARIO_REF_NOT_FOUND', '流程引用的场景不存在', journeyId),
      );
      continue;
    }

    const sourceRef = source.id;
    mappedScenarios.add(sourceRef);

    const bySequence = new Map<number, JsonObject>();

    for (const step of recordsOf(journey['steps'])) {
      const sequence = Number(step['sourceStepSequence']);

      if (bySequence.has(sequence)) {
        diagnostics.push(
          errorDiagnostic(
            'SCENARIO_STEP_DUPLICATE',
            '同一流程重复映射 FM 步骤',
            idOf(step),
          ),
        );
      }

      bySequence.set(sequence, step);
    }

    const rows: CoverageStep[] = [];

    for (const sourceStep of [...source.steps].sort(
      (left, right) => left.sequence - right.sequence,
    )) {
      const mapped = bySequence.get(sourceStep.sequence);

      if (mapped === undefined) {
        diagnostics.push(
          gapDiagnostic(
            'SCENARIO_UNCOVERED',
            `${journeyId}.step-${sourceStep.sequence}`,
            'coverage',
            'FM 场景步骤未映射',
            journeyId,
          ),
        );
        rows.push({
          sequence: sourceStep.sequence,
          status: 'gap',
          actingRoleRef: sourceStep.actingRoleRef,
        });
        continue;
      }

      const { status, diagnostics: stepDiagnostics } = stepStatusOf(
        mapped,
        sourceStep,
        sourceRef,
        design,
        index,
        capabilityMap,
      );
      diagnostics.push(...stepDiagnostics);

      rows.push({
        sourceStepRef: idOf(mapped),
        sequence: sourceStep.sequence,
        status,
        mapping: asString(mapped['mapping']),
        capabilityRef: asString(mapped['capabilityRef']) ?? null,
        actingRoleRef: sourceStep.actingRoleRef,
      });
    }

    const knownSequences = new Set(source.steps.map((step) => step.sequence));

    for (const sequence of [...bySequence.keys()]
      .filter((value) => !knownSequences.has(value))
      .sort((left, right) => left - right)) {
      diagnostics.push(
        errorDiagnostic(
          'SCENARIO_STEP_NOT_FOUND',
          `FM 场景中不存在步骤 ${sequence}`,
          journeyId,
        ),
      );
    }

    coverage.push({
      journeyId,
      scenarioRef: asString(journey['scenarioRef']),
      sourceScenarioRef: sourceRef,
      status: rows.some((row) => row.status === 'gap') ? 'gap' : 'mapped',
      steps: rows,
    });
  }

  for (const ref of [...index.scenarios.keys()]
    .filter((key) => !mappedScenarios.has(key))
    .sort(compareText)) {
    diagnostics.push(
      gapDiagnostic(
        'SCENARIO_UNCOVERED',
        `${ref}.journey`,
        'coverage',
        '整体 FM 场景未回映到接口或非接口活动',
        ref,
      ),
    );
    coverage.push({ sourceScenarioRef: ref, status: 'gap', steps: [] });
  }

  return { coverage, diagnostics };
};
