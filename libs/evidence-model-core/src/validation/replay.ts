import {
  REQUIRED_EVIDENCE_TIME_ATTRIBUTES,
  isEvidenceEntity,
  isFulfillmentRequest,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

import { celValueToJson, compileCelExpression } from '../cel/celEvaluator.js';

import {
  entityOf,
  fulfillmentStatusOf,
  type RuleResultRecord,
  type RuntimeInstance,
} from './fulfillmentState.js';
import { buildActivation, requiredInstanceRefs } from './ruleActivation.js';
import { jsonValuesEqual, normalizeJsonValue } from './typedValues.js';
import {
  indexSuite,
  validateValidationSuite,
  type FulfillmentStatus,
  type Scenario,
  type ScenarioEvaluation,
  type ValidationSuite,
} from './validationSuite.js';

/**
 * A scenario played back one step at a time.
 *
 * The simulation answers "did it close"; the replay answers "which step closed
 * it". Nothing here reads a clock: every frame is the state after one declared
 * step, so pressing step-forward twice on the same sources always shows the
 * same two frames.
 */

/** One derived value a step introduced. */
export interface ReplayDerivation {
  ruleRef: string;
  /** `entity#attribute` the rule wrote to. */
  target: string | null;
  result: unknown;
}

/** One assertion a step decided. */
export interface ReplayCheckpoint {
  ruleRef: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

/** What one request was after a step. */
export interface ReplayFulfillmentState {
  requestInstanceRef: string;
  requestEntityRef: string;
  status: FulfillmentStatus;
}

/** One declarative step, with everything it changed. */
export interface ReplayStep {
  sequence: number;
  actingRoleRef: string;
  instanceRef: string;
  entityRef: string;
  contextRef: string | null;
  evidenceKind: string | null;
  /** Business time the issued evidence carries, when it declares one. */
  at: string | null;
  basedOn: readonly string[];
  /** Instances the acting Role could see when it issued this one. */
  visibleRefs: readonly string[];
  derivations: readonly ReplayDerivation[];
  checkpoints: readonly ReplayCheckpoint[];
  fulfillmentStates: readonly ReplayFulfillmentState[];
  /** Values of the instance this step issued, after its derivations. */
  values: Record<string, unknown>;
}

/** The state the scenario starts from, before any step is played. */
export interface ReplayOpening {
  /** Assertions that only the starting graph could decide. */
  derivations: readonly ReplayDerivation[];
  checkpoints: readonly ReplayCheckpoint[];
  fulfillmentStates: readonly ReplayFulfillmentState[];
}

export interface ScenarioReplay {
  scenarioId: string;
  label: string;
  asOf: string;
  /** Instances already in force before the first frame. */
  givenInstanceRefs: readonly string[];
  opening: ReplayOpening;
  steps: readonly ReplayStep[];
  /** Every assertion the replay decided, in the order it decided them. */
  checkpointCount: number;
  passed: boolean;
  errors: readonly string[];
}

export interface ReplayReport {
  modelId: unknown;
  replays: readonly ScenarioReplay[];
  passed: boolean;
  errors: readonly string[];
}

const dedupe = (messages: readonly string[]): string[] => [...new Set(messages)];

const print = (value: unknown): string => JSON.stringify(value) ?? 'null';

/** The business time an issued instance carries, read from its own values. */
const businessTimeOf = (
  instance: RuntimeInstance | undefined,
  model: DomainModelDocument,
): string | null => {
  if (instance === undefined) {
    return null;
  }

  const entity = entityOf(model, instance.entityRef);

  if (entity === undefined || !isEvidenceEntity(entity)) {
    return null;
  }

  for (const attribute of REQUIRED_EVIDENCE_TIME_ATTRIBUTES[entity.kind]) {
    const value = instance.values[attribute];

    if (typeof value === 'string') {
      return value;
    }
  }

  return null;
};

interface ReplayContext {
  model: DomainModelDocument;
  instances: Map<string, RuntimeInstance>;
  issued: Set<string>;
  ruleResults: Map<string, RuleResultRecord[]>;
  /** Evaluations already executed, by index in the scenario. */
  settled: Set<number>;
  manualCompletions: ReadonlySet<string>;
  errors: string[];
  scenarioId: string;
}

/**
 * Runs every evaluation whose inputs are now in force.
 *
 * A scenario lists its evaluations once, but a replay has to decide them at the
 * step that made them answerable: otherwise the last frame carries every verdict
 * and the intermediate frames carry none.
 */
const settleEvaluations = (
  context: ReplayContext,
  evaluations: readonly ScenarioEvaluation[],
  at: string,
): { derivations: ReplayDerivation[]; checkpoints: ReplayCheckpoint[] } => {
  const derivations: ReplayDerivation[] = [];
  const checkpoints: ReplayCheckpoint[] = [];

  evaluations.forEach((evaluation, index) => {
    if (context.settled.has(index)) {
      return;
    }

    const rule = context.model.rules.find((item) => item.id === evaluation.ruleRef);

    if (rule === undefined) {
      return;
    }

    if (
      requiredInstanceRefs(evaluation).some(
        (ref) => !context.instances.has(ref) || !context.issued.has(ref),
      )
    ) {
      return;
    }

    context.settled.add(index);

    try {
      const activation = buildActivation(
        rule,
        evaluation,
        context.instances,
        context.model,
        at,
      );
      const result = normalizeJsonValue(
        celValueToJson(compileCelExpression(rule.expression).evaluate(activation)),
      );
      const passed = jsonValuesEqual(result, evaluation.expectedResult);

      checkpoints.push({
        ruleRef: rule.id,
        expected: normalizeJsonValue(evaluation.expectedResult),
        actual: result,
        passed,
      });

      if (!passed) {
        context.errors.push(
          `${context.scenarioId}.evaluations[${index}]: Rule '${rule.id}' returned ${print(result)}, expected ${print(normalizeJsonValue(evaluation.expectedResult))}`,
        );
      }

      if (rule.kind === 'derivation') {
        const target =
          evaluation.targetInstanceRef === undefined
            ? undefined
            : context.instances.get(evaluation.targetInstanceRef);
        const attribute = rule.target?.attribute;

        if (target !== undefined && attribute !== undefined) {
          if (!(attribute in target.values)) {
            target.values[attribute] = result;
          }

          derivations.push({
            ruleRef: rule.id,
            target: `${target.entityRef}#${attribute}`,
            result,
          });
        }
      }

      const records = context.ruleResults.get(rule.id) ?? [];

      records.push({
        result,
        instanceRefs: requiredInstanceRefs(evaluation),
      });
      context.ruleResults.set(rule.id, records);
    } catch (error) {
      context.errors.push(
        `${context.scenarioId}.evaluations[${index}]: cannot evaluate Rule '${rule.id}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  return { derivations, checkpoints };
};

/** Fulfillment status of every request instance issued so far, in id order. */
const fulfillmentStatesOf = (
  context: ReplayContext,
): readonly ReplayFulfillmentState[] =>
  [...context.instances.values()]
    .filter((instance) => {
      const entity = entityOf(context.model, instance.entityRef);

      return (
        context.issued.has(instance.id) &&
        entity !== undefined &&
        isFulfillmentRequest(entity)
      );
    })
    .map((instance) => ({
      requestInstanceRef: instance.id,
      requestEntityRef: instance.entityRef,
      status: fulfillmentStatusOf(
        context.model,
        context.instances,
        context.issued,
        instance.id,
        context.ruleResults,
        context.manualCompletions,
      ),
    }))
    .sort((left, right) =>
      left.requestInstanceRef.localeCompare(right.requestInstanceRef),
    );

const replayOne = (
  model: DomainModelDocument,
  suite: ValidationSuite,
  scenario: Scenario,
): ScenarioReplay => {
  const instances = new Map<string, RuntimeInstance>();

  for (const [id, instance] of indexSuite(suite).instances) {
    instances.set(id, {
      id,
      entityRef: instance.entityRef,
      values: { ...instance.values },
      basedOn: instance.basedOn ?? [],
    });
  }

  const givenInstanceRefs = [...(scenario.givenInstanceRefs ?? [])];
  const issueOrder = [
    ...givenInstanceRefs,
    ...scenario.steps.map((step) => step.issueInstanceRef),
  ];

  if (new Set(issueOrder).size !== issueOrder.length) {
    return {
      scenarioId: scenario.id,
      label: scenario.label,
      asOf: scenario.asOf,
      givenInstanceRefs,
      opening: { derivations: [], checkpoints: [], fulfillmentStates: [] },
      steps: [],
      checkpointCount: 0,
      passed: false,
      errors: [
        `${scenario.id}: an instance is issued more than once, so the replay order is not defined`,
      ],
    };
  }

  const context: ReplayContext = {
    model,
    instances,
    issued: new Set(givenInstanceRefs),
    ruleResults: new Map<string, RuleResultRecord[]>(),
    settled: new Set<number>(),
    manualCompletions: new Set(scenario.manualCompletionRequestRefs ?? []),
    errors: [],
    scenarioId: scenario.id,
  };
  const evaluations = scenario.evaluations ?? [];
  const steps: ReplayStep[] = [];

  // Assertions that only the starting graph can decide belong to the opening,
  // before any step is played.
  const settledAtOpening = settleEvaluations(
    context,
    evaluations,
    scenario.asOf,
  );
  const opening: ReplayOpening = {
    derivations: settledAtOpening.derivations,
    checkpoints: settledAtOpening.checkpoints,
    fulfillmentStates: fulfillmentStatesOf(context),
  };

  for (const step of [...scenario.steps].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    const instance = context.instances.get(step.issueInstanceRef);

    context.issued.add(step.issueInstanceRef);

    const entity =
      instance === undefined ? undefined : entityOf(model, instance.entityRef);
    const settled = settleEvaluations(context, evaluations, scenario.asOf);
    const current = context.instances.get(step.issueInstanceRef);

    steps.push({
      sequence: step.sequence,
      actingRoleRef: step.actingRoleRef,
      instanceRef: step.issueInstanceRef,
      entityRef: instance?.entityRef ?? '',
      contextRef:
        entity !== undefined && 'contextRef' in entity
          ? (entity.contextRef ?? null)
          : null,
      evidenceKind: entity !== undefined && isEvidenceEntity(entity) ? entity.kind : null,
      at: businessTimeOf(current, model),
      basedOn: [...(instance?.basedOn ?? [])],
      visibleRefs: [
        ...(step.availableInstanceRefs ?? instance?.basedOn ?? []),
      ].sort(),
      derivations: settled.derivations,
      checkpoints: settled.checkpoints,
      fulfillmentStates: fulfillmentStatesOf(context),
      values: normalizeJsonValue(current?.values ?? {}) as Record<string, unknown>,
    });
  }

  const checkpointCount = steps.reduce(
    (total, step) => total + step.checkpoints.length,
    0,
  );

  return {
    scenarioId: scenario.id,
    label: scenario.label,
    asOf: scenario.asOf,
    givenInstanceRefs,
    opening,
    steps,
    checkpointCount,
    passed: context.errors.length === 0,
    errors: dedupe(context.errors),
  };
};

/**
 * Replays one scenario.
 *
 * A suite that does not validate is not replayed: playing back steps that
 * reference objects the model does not have would produce frames that look
 * authoritative and mean nothing.
 */
export const replayScenario = (
  model: DomainModelDocument,
  suite: ValidationSuite,
  scenario: Scenario,
): ScenarioReplay => {
  const suiteErrors = validateValidationSuite(model, suite);

  if (suiteErrors.length > 0) {
    return {
      scenarioId: scenario.id,
      label: scenario.label,
      asOf: scenario.asOf,
      givenInstanceRefs: [...(scenario.givenInstanceRefs ?? [])],
      opening: { derivations: [], checkpoints: [], fulfillmentStates: [] },
      steps: [],
      checkpointCount: 0,
      passed: false,
      errors: suiteErrors,
    };
  }

  return replayOne(model, suite, scenario);
};

/** Replays every requested scenario, or all of them when none is named. */
export const replayValidationSuite = (
  model: DomainModelDocument,
  suite: ValidationSuite,
  scenarioIds?: readonly string[],
): ReplayReport => {
  const requested = new Set(scenarioIds ?? []);
  const unknown = [...requested].filter(
    (id) => !suite.scenarios.some((scenario) => scenario.id === id),
  );
  const errors = unknown.map((id) => `unknown scenario id '${id}'`);

  if (errors.length > 0) {
    return { modelId: model.manifest.id, replays: [], passed: false, errors };
  }

  const replays = suite.scenarios
    .filter((scenario) => requested.size === 0 || requested.has(scenario.id))
    .map((scenario) => replayScenario(model, suite, scenario));

  return {
    modelId: model.manifest.id,
    replays,
    passed: replays.every((replay) => replay.passed),
    errors: dedupe(replays.flatMap((replay) => replay.errors)),
  };
};

/** The scenario ids a suite can be played back for, in file order. */
export const replayableScenarioIds = (
  suite: ValidationSuite,
): readonly string[] => suite.scenarios.map((scenario) => scenario.id);
