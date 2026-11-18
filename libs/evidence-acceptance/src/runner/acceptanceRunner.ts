import path from 'node:path';
import type { SuiteStep } from '../delivery/scenarioProjector.js';
import {
  brunoRequestPath,
  responseExpression,
  responseSegments,
} from '../renderer/brunoRenderer.js';
import { readAcceptanceSuite } from '../renderer/brunoSuite.js';
import { runBruno, type BrunoResult } from './brunoCli.js';
import {
  selectAcceptanceFlows,
  type SuiteSelection,
} from './suiteSelection.js';
import {
  createDriftInspector,
  type DriftIssue,
  type DriftReport,
} from './driftInspector.js';
export type { AcceptanceGate } from './suiteSelection.js';
export type { DriftIssue } from './driftInspector.js';

export interface AcceptanceRunOptions extends SuiteSelection {
  readonly detectDrift?: boolean;
  readonly strictDrift?: boolean;
  /** Directory containing one generated Bruno collection. */
  readonly suitePath: string;
  readonly targetUrl: string;
  /** Overrides request clocks only; compiled business assertions remain unchanged. */
  readonly asOf?: string;
  readonly timeoutMs?: number;
  /** Optional preflight called only after validation and non-empty selection. */
  readonly preflight?: () => Promise<void>;
}
export interface AssertionResult {
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly passed: boolean;
}
export interface StepExecutionResult {
  readonly id: string;
  readonly flow: string;
  readonly name: string;
  readonly method: string;
  readonly url: string;
  readonly status?: number;
  readonly expectedStatus?: unknown;
  readonly passed: boolean;
  readonly skipped: boolean;
  readonly errored?: boolean;
  readonly durationMs: number;
  readonly assertions: readonly AssertionResult[];
  readonly failureDetails?: string;
  readonly driftIssues?: readonly DriftIssue[];
}
export interface AcceptanceRunReport {
  readonly suitePath: string;
  readonly targetUrl: string;
  readonly passed: boolean;
  readonly totalDurationMs: number;
  readonly steps: readonly StepExecutionResult[];
  readonly gate?: 'regression' | 'dod';
  readonly selectedFlowCount?: number;
  readonly emptyReason?: string;
}

export function validateTargetUrl(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Target must be an HTTP(S) URL without credentials, query or fragment',
    );
  return url.href.replace(/\/$/, '');
}

/** Strict UTC RFC3339, rejecting normalized dates such as February 30. */
export function validateAsOf(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().replace('.000Z', 'Z') !==
      value.replace('.000Z', 'Z')
  )
    throw new Error(
      '--as-of must be a valid UTC timestamp, e.g. 2026-03-31T10:00:00Z',
    );
  return value;
}

function responseValue(body: unknown, jsonPath: string, ref: string): unknown {
  return responseSegments(jsonPath, ref).reduce<unknown>(
    (value, key) =>
      value !== null && typeof value === 'object' && Object.hasOwn(value, key)
        ? (value as Record<string, unknown>)[key]
        : undefined,
    body,
  );
}

function normalizeStep(
  result: BrunoResult,
  step: SuiteStep,
  id: string,
  flow: string,
  options: AcceptanceRunOptions,
  inspect?: (payload: unknown) => DriftReport,
): StepExecutionResult {
  const status =
    typeof result.response.status === 'number'
      ? result.response.status
      : undefined;
  const skipped = result.status === 'skipped';
  const errored = result.status === 'error';
  const body = result.response.data;
  let drift: DriftReport | undefined;
  if (inspect && status !== undefined) {
    let payload = body;
    try {
      if (typeof payload === 'string') payload = JSON.parse(payload);
    } catch {
      drift = {
        hasDrift: true,
        issues: [
          {
            type: 'type_mismatch',
            path: '',
            keyword: 'parse',
            message: 'Response is not valid JSON',
          },
        ],
      };
    }
    drift ??= inspect(payload);
  }
  const checkResults = [
    ...result.assertionResults,
    ...result.testResults,
    ...(result.preRequestTestResults ?? []),
    ...(result.postResponseTestResults ?? []),
  ];
  const knownExpressions = new Map(
    Object.keys(step.assertions).map((key) => [
      responseExpression(key, step.ref),
      key,
    ]),
  );
  const assertions = checkResults.map((check): AssertionResult => {
    const name = check.lhsExpr ?? check.description ?? 'Bruno check';
    const jsonPath =
      (check.lhsExpr && knownExpressions.get(check.lhsExpr)) ??
      (Object.hasOwn(step.assertions, name) ? name : undefined);
    return {
      path: jsonPath ? `jsonpath.${jsonPath}` : name,
      expected: jsonPath
        ? step.assertions[jsonPath]
        : name === 'res.status'
          ? step.status
          : undefined,
      actual: jsonPath
        ? responseValue(body, jsonPath, step.ref)
        : name === 'res.status'
          ? status
          : undefined,
      passed: check.status === 'pass',
    };
  });
  if (
    !skipped &&
    !errored &&
    result.assertionResults.length + result.testResults.length <
      1 + Object.keys(step.assertions).length + Number(step.status === 202)
  )
    throw new Error(`Incomplete Bruno check report for ${step.ref}`);
  const advisory = options.detectDrift && !options.strictDrift;
  if (drift && !advisory)
    assertions.push({
      path: 'schema',
      expected: 'response matches JSON Schema',
      actual: drift.issues.map(
        ({ path, message }) => `${path || '/'} ${message}`,
      ),
      passed: !drift.hasDrift,
    });
  const failures = [result.error, ...checkResults.map((check) => check.error)]
    .filter(Boolean)
    .join('\n');
  return {
    id,
    flow,
    name: step.ref,
    method: step.route.method,
    url: result.request.url ?? `${options.targetUrl}${step.route.path}`,
    ...(status === undefined ? {} : { status }),
    expectedStatus: step.status,
    passed:
      status !== undefined &&
      !errored &&
      !skipped &&
      assertions.every((check) => check.passed),
    skipped,
    errored,
    durationMs: result.response.duration ?? 0,
    assertions,
    ...(failures ? { failureDetails: failures } : {}),
    ...(drift && (options.detectDrift || options.strictDrift)
      ? { driftIssues: drift.issues }
      : {}),
  };
}

/** Select model flows, then delegate all HTTP and business assertions to Bruno. */
export async function runAcceptanceSuite(
  options: AcceptanceRunOptions,
): Promise<AcceptanceRunReport> {
  const targetUrl = validateTargetUrl(options.targetUrl);
  const asOf =
    options.asOf === undefined ? undefined : validateAsOf(options.asOf);
  const timeoutMs = options.timeoutMs ?? 5000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2147483647
  )
    throw new Error('timeoutMs must be a positive integer <= 2147483647');
  const suitePath = path.resolve(options.suitePath);
  const projection = selectAcceptanceFlows(
    await readAcceptanceSuite(suitePath),
    options,
  );
  const selectedFlowCount = projection.flows.length;
  const summary = {
    suitePath,
    targetUrl,
    selectedFlowCount,
    ...(options.gate ? { gate: options.gate } : {}),
  };
  if (!selectedFlowCount)
    return {
      ...summary,
      passed: true,
      totalDurationMs: 0,
      steps: [],
      emptyReason:
        'No incremental flows; baseline and current acceptance requirements are identical.',
    };

  const planned = new Map(
    projection.flows.flatMap((flow, flowIndex) =>
      flow.steps.map(
        (step, stepIndex) =>
          [
            brunoRequestPath(flowIndex, stepIndex, step.ref),
            {
              flow,
              step,
              inspect:
                step.responseSchema &&
                createDriftInspector(step.responseSchema),
            },
          ] as const,
      ),
    ),
  );
  await options.preflight?.();
  const run = await runBruno(projection, {
    targetUrl,
    ...(asOf === undefined ? {} : { asOf }),
    timeoutMs,
  });
  const steps = run.results.map((result) => {
    const id = result.test.filename.replaceAll('\\', '/');
    const item = planned.get(id);
    if (!item)
      throw new Error(`Unexpected or duplicate request in Bruno report: ${id}`);
    planned.delete(id);
    return normalizeStep(
      result,
      item.step,
      id,
      item.flow.id,
      { ...options, targetUrl },
      item.inspect,
    );
  });
  if (planned.size)
    throw new Error('Incomplete Bruno report: missing request results');
  if (!run.passed && steps.every((step) => step.passed))
    throw new Error(
      'Bruno reported collection failure without a failed request',
    );
  return {
    ...summary,
    steps,
    passed: run.passed && steps.every((step) => step.passed),
    totalDurationMs: steps.reduce((sum, step) => sum + step.durationMs, 0),
  };
}
