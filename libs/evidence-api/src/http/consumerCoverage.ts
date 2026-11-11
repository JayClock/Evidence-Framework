import {
  errorDiagnostic,
  gapDiagnostic,
  type Diagnostic,
} from '../diagnostics.js';
import type { ProjectedCapability } from '../projection/capabilities.js';
import type { CoverageRow, CoverageStep } from '../projection/coverage.js';
import type { JourneyRow } from './httpJourneys.js';

/**
 * Whether a consumer can actually reach each business step over HTTP.
 *
 * This is a different question from "did the design map this step": a journey
 * step that never succeeds does not consume anything, and a single request
 * cannot stand in for several business interactions in the same scenario. The
 * two are reported separately so a reader can tell a mapping gap from a
 * consumption gap.
 */

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/** One business step and the HTTP steps that consume it. */
export interface ConsumptionStep {
  sourceStepRef: string | null;
  sequence: number;
  mapping?: string;
  status: 'mapped' | 'gap';
  httpSteps: { journeyRef: string; stepRef: string }[];
}

/** One scenario, and whether every step of it is consumed. */
export interface ConsumptionRow {
  scenarioRef: unknown;
  sourceScenarioRef: string;
  status: 'mapped' | 'gap';
  steps: ConsumptionStep[];
}

interface BusinessStep {
  scenarioRef: unknown;
  step: CoverageStep;
}

const isSuccess = (status: number): boolean => status >= 200 && status < 300;

export interface CheckConsumptionResult {
  consumerCoverage: ConsumptionRow[];
  diagnostics: Diagnostic[];
}

/**
 * Cross-checks the business steps against the journeys that consume them.
 *
 * A step counts as consumed only by a successful mapped HTTP step whose
 * capability is the one the business step was mapped to, and only once per
 * scenario: the second request has to be a second interaction, not a replay.
 */
export const checkConsumption = (
  coverage: readonly CoverageRow[],
  journeys: readonly JourneyRow[],
  capabilities: ReadonlyMap<string, ProjectedCapability>,
): CheckConsumptionResult => {
  const diagnostics: Diagnostic[] = [];
  const rows: ConsumptionRow[] = [];
  const scenarioRefs = new Set(
    coverage
      .map((scenario) => scenario.scenarioRef)
      .filter((ref): ref is string => typeof ref === 'string'),
  );

  for (const journey of journeys) {
    if (journey.status === 'gap' && journey.steps.length === 0) {
      continue;
    }

    const declared = journey.scenarioRefs;

    if (declared.length === 0 || !declared.every((ref) => scenarioRefs.has(ref))) {
      diagnostics.push(
        errorDiagnostic('HTTP_FLOW_SCENARIO', 'HTTP 流程必须引用已有 API 场景', journey.id),
      );
    }
  }

  const hasSourceSteps = journeys.some((journey) =>
    journey.steps.some((step) => step.sourceStepRefs.length > 0),
  );

  if (!hasSourceSteps) {
    return { consumerCoverage: rows, diagnostics };
  }

  const businessSteps = new Map<string, BusinessStep>();

  for (const scenario of coverage) {
    for (const step of scenario.steps) {
      const reference = step.sourceStepRef;

      if (reference === undefined) {
        continue;
      }

      if (businessSteps.has(reference)) {
        diagnostics.push(
          errorDiagnostic('HTTP_SOURCE_STEP_DUPLICATE', '业务步骤 ID 必须全局唯一', reference),
        );
      }

      businessSteps.set(reference, { scenarioRef: scenario.scenarioRef, step });
    }
  }

  const consumed = new Map<string, { journeyRef: string; stepRef: string }[]>();

  for (const journey of journeys) {
    if (journey.status === 'gap' && journey.steps.length === 0) {
      continue;
    }

    const declared = journey.scenarioRefs;

    for (const step of journey.steps) {
      const capability = capabilities.get(step.capabilityRef);

      if (capability === undefined) {
        continue;
      }

      if (!declared.every((ref) => stringsOf(capability['scenarioRefs']).includes(ref))) {
        diagnostics.push(
          errorDiagnostic('HTTP_FLOW_SCENARIO', '步骤能力不支持流程声明的场景', step.id),
        );
      }

      const perScenario = new Set<string>();

      for (const reference of step.sourceStepRefs) {
        const source = businessSteps.get(reference);

        if (source === undefined) {
          diagnostics.push(
            errorDiagnostic('HTTP_FLOW_SOURCE_STEP', '引用的业务步骤不存在', step.id),
          );
          continue;
        }

        if (
          typeof source.scenarioRef !== 'string' ||
          !declared.includes(source.scenarioRef) ||
          source.step.mapping !== 'capability' ||
          source.step.capabilityRef !== step.capabilityRef ||
          source.step.actingRoleRef !== journey.actorRoleRef
        ) {
          diagnostics.push(
            errorDiagnostic(
              'HTTP_FLOW_SOURCE_STEP',
              'HTTP 步骤与业务步骤的场景、角色或能力不匹配',
              step.id,
            ),
          );
          continue;
        }

        if (perScenario.has(source.scenarioRef)) {
          diagnostics.push(
            errorDiagnostic(
              'HTTP_FLOW_OCCURRENCE',
              '一次请求不能冒充同一场景中的多次业务交互',
              step.id,
            ),
          );
          continue;
        }

        perScenario.add(source.scenarioRef);

        if (step.status === 'mapped' && isSuccess(step.expectStatus)) {
          const matches = consumed.get(reference) ?? [];
          matches.push({ journeyRef: journey.id, stepRef: step.id });
          consumed.set(reference, matches);
        }
      }
    }
  }

  for (const scenario of coverage) {
    const steps: ConsumptionStep[] = [];

    for (const businessStep of scenario.steps) {
      const reference = businessStep.sourceStepRef;
      const matches = reference === undefined ? [] : (consumed.get(reference) ?? []);
      const requiresHttp = businessStep.mapping === 'capability';
      const status =
        businessStep.status === 'mapped' && (matches.length > 0 || !requiresHttp)
          ? 'mapped'
          : 'gap';

      if (requiresHttp && matches.length === 0 && reference !== undefined) {
        diagnostics.push(
          gapDiagnostic(
            'HTTP_SCENARIO_STEP_UNCOVERED',
            `${reference}.consumption`,
            'coverage',
            '业务步骤没有匹配的成功 HTTP 消费步骤',
            reference,
          ),
        );
      }

      steps.push({
        sourceStepRef: reference ?? null,
        sequence: businessStep.sequence,
        ...(businessStep.mapping === undefined
          ? {}
          : { mapping: businessStep.mapping }),
        status,
        httpSteps: matches,
      });
    }

    rows.push({
      scenarioRef: scenario.scenarioRef,
      sourceScenarioRef: scenario.sourceScenarioRef,
      status:
        scenario.status === 'mapped' && steps.every((step) => step.status === 'mapped')
          ? 'mapped'
          : 'gap',
      steps,
    });
  }

  return { consumerCoverage: rows, diagnostics };
};

/** One derived edge of the navigation graph. */
export interface NavigationEdge {
  representationRef: string;
  rel: string;
  kind: 'navigation' | 'identity';
  capabilityRef?: unknown;
  capabilityRefs?: string[];
  whenRuleRef?: unknown;
  availability: 'not_evaluated';
}

/**
 * The edges a client can follow between representations.
 *
 * A representation's own `self` link is `identity` unless some caller can
 * actually GET it — claiming navigation where there is no read would invent a
 * capability the design never declared.
 */
export const navigationGraph = (
  representations: readonly JsonObject[],
  capabilities: ReadonlyMap<string, ProjectedCapability>,
): NavigationEdge[] => {
  const edges: NavigationEdge[] = [];

  for (const representation of representations) {
    for (const link of Array.isArray(representation['links'])
      ? representation['links'].filter(isRecord)
      : []) {
      edges.push({
        representationRef: String(representation['id']),
        rel: String(link['rel'] ?? ''),
        kind: link['kind'] === 'navigation' ? 'navigation' : 'identity',
        capabilityRef: link['capabilityRef'],
        ...(link['whenRuleRef'] === undefined
          ? {}
          : { whenRuleRef: link['whenRuleRef'] }),
        availability: 'not_evaluated',
      });
    }

    const roles = new Set(stringsOf(representation['actorRoleRefs']));
    const reads = [...capabilities.values()]
      .filter(
        (capability) =>
          capability.method === 'GET' &&
          capability.resourceRef === representation['resourceRef'] &&
          capability.view === representation['view'] &&
          roles.has(capability.actorRoleRef),
      )
      .map((capability) => capability.id)
      .sort();

    edges.push({
      representationRef: String(representation['id']),
      rel: 'self',
      kind: reads.length > 0 ? 'navigation' : 'identity',
      capabilityRefs: reads,
      availability: 'not_evaluated',
    });
  }

  return edges;
};
