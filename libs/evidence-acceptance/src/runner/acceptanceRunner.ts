import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import type { Step, StepResult, Workflow } from '@stepci/runner';
import {
  selectStepCiFlows,
  type StepCiSuiteSelection,
} from './stepCiSuiteSelection.js';
import {
  createDriftInspector,
  type DriftIssue,
  type DriftReport,
} from './driftInspector.js';
export type { AcceptanceGate } from './suiteSelection.js';
export type { DriftIssue } from './driftInspector.js';

export interface AcceptanceRunOptions
  extends Omit<StepCiSuiteSelection, 'baseline'> {
  /** Native Step CI YAML rendered from the baseline model, never a private IR. */
  readonly baselineYaml?: string;
  readonly detectDrift?: boolean;
  readonly strictDrift?: boolean;
  readonly suitePath: string;
  readonly targetUrl: string;
  /** Overrides request clocks only; compiled business assertions remain unchanged. */
  readonly asOf?: string;
  readonly timeoutMs?: number;
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

function assertionsOf(checks: unknown, prefix = ''): AssertionResult[] {
  if (checks === null || typeof checks !== 'object') return [];
  const object = checks as Record<string, unknown>;
  if (typeof object.passed === 'boolean')
    return [
      {
        path: prefix,
        expected: object.expected,
        actual: object.given,
        passed: object.passed,
      },
    ];
  return Object.entries(object).flatMap(([key, value]) =>
    assertionsOf(value, prefix ? `${prefix}.${key}` : key),
  );
}

function normalizeStep(
  step: StepResult,
  flow: string,
  index: number,
  source: Step | undefined,
  targetUrl: string,
  inspect?: (payload: unknown) => DriftReport,
  strictDrift = false,
): StepExecutionResult {
  let drift: DriftReport | undefined;
  if (inspect && step.response && !step.skipped) {
    const body: unknown = step.response.body;
    try {
      drift = inspect(
        Buffer.isBuffer(body) || typeof body === 'string'
          ? JSON.parse(body.toString())
          : body,
      );
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
  }
  const assertions = assertionsOf(step.checks);
  return {
    id: step.id ?? `${step.testId}:${index + 1}`,
    flow,
    name: step.name ?? step.id ?? `step ${index + 1}`,
    method: String(step.request?.method ?? source?.http?.method ?? ''),
    url: String(
      step.request?.url ??
        source?.http?.url?.replace('${{env.host}}', targetUrl) ??
        '',
    ),
    ...(typeof step.response?.status === 'number'
      ? { status: step.response.status }
      : {}),
    ...(source?.http?.check?.status === undefined
      ? {}
      : { expectedStatus: source.http.check.status }),
    passed:
      step.passed &&
      !step.errored &&
      !step.skipped &&
      !(strictDrift && drift?.hasDrift),
    skipped: step.skipped,
    errored: step.errored,
    durationMs: step.duration,
    assertions,
    ...(drift ? { driftIssues: drift.issues } : {}),
    ...(step.errorMessage ? { failureDetails: step.errorMessage } : {}),
  };
}

/** Thin adapter over the official Runner. No HTTP execution or assertion engine here. */
export async function runAcceptanceSuite(
  options: AcceptanceRunOptions,
): Promise<AcceptanceRunReport> {
  const targetUrl = validateTargetUrl(options.targetUrl);
  const asOf =
    options.asOf === undefined ? undefined : validateAsOf(options.asOf);
  if (
    options.timeoutMs !== undefined &&
    (!Number.isSafeInteger(options.timeoutMs) ||
      options.timeoutMs <= 0 ||
      options.timeoutMs > 2147483647)
  )
    throw new Error('timeoutMs must be a positive integer');
  const suitePath = path.resolve(options.suitePath);
  const current = parseWorkflow(await readFile(suitePath, 'utf8'), suitePath);
  const workflow = selectStepCiFlows(current, {
    ...options,
    ...(options.baselineYaml === undefined
      ? {}
      : { baseline: parseWorkflow(options.baselineYaml, 'baseline') }),
  });
  const selectedFlowCount = Object.keys(workflow.tests).length;
  if (!selectedFlowCount)
    return {
      suitePath,
      targetUrl,
      passed: true,
      totalDurationMs: 0,
      steps: [],
      gate: 'dod',
      selectedFlowCount: 0,
      emptyReason:
        'No incremental flows; baseline and current acceptance requirements are identical.',
    };
  // These are exported HTTP suites, not a second general-purpose Step CI frontend.
  // Reject unsupported constructs rather than accidentally reporting an empty green run.
  if (workflow.include || workflow.config?.loadTest)
    throw new Error('Acceptance suites must be self-contained HTTP workflows');
  const tests = [
    workflow.before,
    ...Object.values(workflow.tests),
    workflow.after,
  ].filter((test) => test !== undefined);
  const inspectors = new Map<Step, (payload: unknown) => DriftReport>();
  for (const test of tests) {
    if (!Array.isArray(test.steps) || test.steps.length === 0)
      throw new Error('Acceptance flows require at least one HTTP step');
    for (const step of test.steps) {
      if (!step.http || typeof step.http.url !== 'string')
        throw new Error('Acceptance suites support HTTP steps only');
      if (
        (options.detectDrift || options.strictDrift) &&
        step.http.check?.schema !== undefined
      ) {
        inspectors.set(
          step,
          createDriftInspector(
            step.http.check.schema as Record<string, unknown>,
          ),
        );
        // Drift is advisory unless strict. Other official Runner assertions stay authoritative.
        delete step.http.check.schema;
      }
      if (asOf !== undefined) {
        step.http.headers = Object.fromEntries(
          Object.entries(step.http.headers ?? {}).filter(
            ([key]) => key.toLowerCase() !== 'x-evidence-asof',
          ),
        );
        step.http.headers['x-evidence-asof'] = asOf;
      }
      step.http.timeout =
        options.timeoutMs === undefined
          ? (step.http.timeout ?? '5s')
          : `${options.timeoutMs}ms`;
    }
  }
  // Lazy loading keeps the heavy Node-only Runner out of projection/browser consumers.
  const { runFromYAML } = await import('@stepci/runner');
  const result = await runFromYAML(
    stringify(workflow, { defaultStringType: 'QUOTE_DOUBLE' }),
    {
      path: suitePath,
      env: { host: targetUrl, ...(asOf === undefined ? {} : { asOf }) },
    },
  );
  const steps = result.result.tests.flatMap((test) =>
    test.steps.map((step, index) =>
      normalizeStep(
        step,
        test.name ?? test.id,
        index,
        (test.id === 'before'
          ? workflow.before
          : test.id === 'after'
            ? workflow.after
            : workflow.tests[test.id]
        )?.steps[index],
        targetUrl,
        inspectors.get(
          (test.id === 'before'
            ? workflow.before
            : test.id === 'after'
              ? workflow.after
              : workflow.tests[test.id]
          )?.steps[index] as Step,
        ),
        options.strictDrift,
      ),
    ),
  );
  return {
    suitePath,
    targetUrl,
    passed:
      result.result.passed &&
      steps.length > 0 &&
      steps.every((step) => step.passed),
    totalDurationMs: result.result.duration,
    steps,
    selectedFlowCount,
    ...(options.gate ? { gate: options.gate } : {}),
  };
}

function parseWorkflow(yaml: string, label: string): Workflow {
  const workflow = parse(yaml) as Workflow;
  if (
    !workflow ||
    workflow.version !== '1.1' ||
    !workflow.tests ||
    typeof workflow.tests !== 'object' ||
    Array.isArray(workflow.tests) ||
    !Object.keys(workflow.tests).length
  )
    throw new Error(
      `Invalid Step CI suite: ${label} (expected nonempty version 1.1 tests)`,
    );
  if (workflow.include || workflow.config?.loadTest)
    throw new Error('Acceptance suites must be self-contained HTTP workflows');
  for (const test of [
    workflow.before,
    ...Object.values(workflow.tests),
    workflow.after,
  ].filter((test) => test !== undefined)) {
    if (
      !test ||
      !Array.isArray(test.steps) ||
      !test.steps.length ||
      test.steps.some(
        (step) => !step?.http || typeof step.http.url !== 'string',
      )
    )
      throw new Error(
        'Acceptance flows require at least one HTTP step (HTTP steps only)',
      );
  }
  return workflow;
}
