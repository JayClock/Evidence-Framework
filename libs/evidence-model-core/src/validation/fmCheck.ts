import {
  isFulfillmentRequest,
  strictValidateDomainModel,
  type DomainModelDocument,
  type RuleAST,
} from '@evidence-poc/evidence-schema';

import {
  completenessGaps,
  scopeSuite,
  selectScope,
  simulationRules,
  ScopeSelectionError,
} from './scope.js';
import {
  simulateValidationSuite,
  type SimulationReport,
} from './simulation.js';
import {
  buildTimeline,
  digestOf,
  emptyTimelineCollections,
  timelineSummary,
  type EvidenceTimeline,
  type TimelineCollections,
  type TimelineSummary,
} from './timeline.js';
import { analyzeTraceability } from './traceability.js';
import {
  validateValidationSuite,
  type Scenario,
  type ValidationSuite,
} from './validationSuite.js';

/**
 * The FM consistency report the skills and the desktop status bar read.
 *
 * It answers three different questions and keeps them apart: is the model
 * consistent, is the requested scope complete, and did the scenarios execute.
 * Consistency is blocking; a scope gap is not, until the scope is asked for. The
 * report carries the contract version the stage gate demands.
 */

/** Report contract version; the stage gate refuses anything else. */
export const FM_CHECK_VERSION = 5;

export interface FmCheckScenarioResultLine {
  ruleRef: string;
  result: unknown;
  passed: boolean;
}

export interface FmCheckReport {
  checkVersion: number;
  valid: boolean;
  consistent: boolean;
  complete: boolean | null;
  scopeRefs: readonly string[];
  contextRefs: readonly string[];
  gaps: readonly string[];
  humanConfirmation: 'not-asserted-by-machine';
  modelDigest: string;
  inputChanged: boolean;
  modelValidated: boolean;
  scenarioRequirement: 'required' | 'not-applicable' | 'not-checked';
  simulationLimitations: readonly string[];
  scenarioCount: number;
  executedScenarioCount: number;
  simulationPassed: boolean | null;
  scenarioResults: SimulationReport['scenarioResults'];
  timelineSummary: TimelineSummary;
  errors: readonly string[];
}

export interface FmCheckRequest {
  model: DomainModelDocument;
  suite: ValidationSuite;
  /** Problems found while reading the sources; they count as model errors. */
  sourceIssues?: readonly string[];
  /** Independent Contexts to check for completeness; omitted means consistency only. */
  scopeRefs?: readonly string[];
  /** `sha256:...` of the sources the model was read from. */
  modelDigest?: string;
  /** Recomputed digest, so a source changing mid-check invalidates the report. */
  currentDigest?: () => string;
}

export interface FmCheckOutcome {
  report: FmCheckReport;
  timeline: EvidenceTimeline | null;
  simulation: SimulationReport | null;
  /** Scoped document the gaps were computed for, when a scope was asked for. */
  selected: DomainModelDocument | null;
}

const dedupe = (messages: readonly string[]): string[] => [...new Set(messages)];

const scopeOf = (model: DomainModelDocument, scopeRefs: readonly string[]): DomainModelDocument =>
  selectScope(model, scopeRefs);

/** Requests the model contains, which make scenarios mandatory inside a scope. */
const requestIds = (model: DomainModelDocument): readonly string[] =>
  model.entities.filter(isFulfillmentRequest).map((request) => request.id).sort();

/**
 * What the scope's scenarios still have to cover once it claims completeness.
 *
 * A rule without a scenario has not been executed, and a Fulfillment Request
 * without a status assertion has not been decided — either one keeps the scope
 * from being complete.
 */
const coverageGaps = (
  scenarioModels: readonly Scenario[],
  applicableRules: readonly RuleAST[],
  requests: readonly string[],
  suite: ValidationSuite,
): string[] => {
  const gaps: string[] = [];

  if (scenarioModels.length === 0) {
    gaps.push('scope requires executable normal and counterexample scenarios');
  }

  const evaluatedRules = new Set(
    scenarioModels.flatMap((scenario) =>
      (scenario.evaluations ?? []).map((evaluation) => evaluation.ruleRef),
    ),
  );

  for (const rule of applicableRules) {
    if (!evaluatedRules.has(rule.id)) {
      gaps.push(`${rule.id}: scope scenarios do not evaluate this Rule`);
    }
  }

  const instances = new Map(suite.instances.map((instance) => [instance.id, instance] as const));
  const assertedRequests = new Set(
    scenarioModels.flatMap((scenario) =>
      scenario.expectations.fulfillmentStatuses.map(
        (expectation) =>
          expectation.requestEntityRef ??
          instances.get(expectation.requestInstanceRef)?.entityRef,
      ),
    ),
  );

  for (const request of requests) {
    if (!assertedRequests.has(request)) {
      gaps.push(
        `${request}: scope scenarios do not assert this Fulfillment Request's status`,
      );
    }
  }

  return gaps;
};

/**
 * Runs the consistency check and, when asked, the scope completeness check.
 *
 * The report always carries a digest: a caller that re-reads the sources can
 * compare it and mark the conclusion stale instead of trusting an old verdict.
 */
export const buildFmCheckReport = (request: FmCheckRequest): FmCheckOutcome => {
  const { model, suite } = request;
  const scopeRefs = request.scopeRefs;
  const digest = request.modelDigest ?? digestOf(model);

  const modelIssues = [
    ...(request.sourceIssues ?? []),
    ...strictValidateDomainModel(model).issues.map(
      (issue) => `${issue.path}: ${issue.message}`,
    ),
    ...analyzeTraceability(model).errors,
  ];
  const suiteErrors = validateValidationSuite(model, suite);
  const hasLoadErrors = (request.sourceIssues ?? []).length > 0;

  let timeline: EvidenceTimeline | null = null;
  let timelineErrors: readonly string[] = [];

  if (!hasLoadErrors) {
    const built = buildTimeline(model, suite);
    timeline = built.timeline;
    timelineErrors = built.errors;
  }

  const staticErrors = dedupe([...modelIssues, ...suiteErrors, ...timelineErrors]);
  const modelValidated = modelIssues.length === 0;

  let selected: DomainModelDocument | null = null;
  let target = model;
  let targetSuite = suite;
  let scopeSelected = false;

  if (scopeRefs !== undefined && suiteErrors.length === 0 && modelValidated) {
    try {
      selected = scopeOf(model, scopeRefs);
      target = selected;
      targetSuite = scopeSuite(selected, suite);
      scopeSelected = true;
      staticErrors.push(...validateValidationSuite(target, targetSuite));
    } catch (error) {
      if (!(error instanceof ScopeSelectionError)) {
        throw error;
      }

      staticErrors.push(error.message);
    }
  }

  const gaps = modelValidated ? completenessGaps(target, modelIssues) : [];
  const { rules: applicableRules, limitations } = modelValidated
    ? simulationRules(target)
    : { rules: [], limitations: [] as readonly string[] };
  const requests = modelValidated ? requestIds(target) : [];
  const scenarioRequirement =
    applicableRules.length > 0 || requests.length > 0 ? 'required' : 'not-applicable';

  if (scopeSelected && scenarioRequirement === 'required') {
    gaps.push(
      ...coverageGaps(targetSuite.scenarios, applicableRules, requests, targetSuite),
    );
  }

  const currentDigest = request.currentDigest?.() ?? digest;
  const inputChanged = currentDigest !== digest;
  let simulation: SimulationReport | null = null;
  let executedScenarioCount = 0;
  let simulationPassed: boolean | null = null;
  const errors = dedupe(staticErrors);

  if (
    errors.length === 0 &&
    gaps.length === 0 &&
    targetSuite.scenarios.length > 0 &&
    modelValidated
  ) {
    const simulated = simulateValidationSuite(target, targetSuite);
    simulation = simulated.report;
    executedScenarioCount = simulated.report.scenarioResults.length;

    if (executedScenarioCount > 0) {
      simulationPassed = simulated.report.simulationPassed;
    }

    errors.push(...simulated.errors);
  }

  if (inputChanged) {
    errors.push('Model inputs changed during validation');
  }

  const consistent = staticErrors.length === 0 && !inputChanged;
  const complete =
    scopeRefs === undefined ? null : gaps.length === 0 && consistent;
  const timelineValue: TimelineCollections =
    errors.length === 0 && timeline !== null
      ? timeline
      : emptyTimelineCollections();

  return {
    report: {
      checkVersion: FM_CHECK_VERSION,
      valid: errors.length === 0 && complete !== false,
      consistent,
      complete,
      scopeRefs: scopeRefs === undefined ? [] : [...scopeRefs],
      contextRefs: scopeSelected
        ? selected === null
          ? []
          : selected.entities
              .filter((entity) => entity.category === 'context')
              .map((entity) => entity.id)
              .sort()
        : [],
      gaps: dedupe(gaps),
      humanConfirmation: 'not-asserted-by-machine',
      modelDigest: digest,
      inputChanged,
      modelValidated,
      scenarioRequirement:
        scopeRefs === undefined ? 'not-checked' : scenarioRequirement,
      simulationLimitations: limitations,
      scenarioCount: targetSuite.scenarios.length,
      executedScenarioCount,
      simulationPassed,
      scenarioResults: simulation?.scenarioResults ?? [],
      timelineSummary: timelineSummary(timelineValue),
      errors: dedupe(errors),
    },
    timeline,
    simulation,
    selected,
  };
};
