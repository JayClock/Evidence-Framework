import type {
  McpDriftAudit,
  McpReplayFrame,
  McpScenarioReplay,
} from '@evidence-poc/evidence-mcp';
import {
  loadModelSources,
  readProductionTrace,
  runNativeDriftAudit,
  type DriftAudit,
} from '@evidence-poc/evidence-agent';
import { replayValidationSuite } from '@evidence-poc/evidence-model-core';

import { modelSourceOf } from './modelSource';

/**
 * The two MCP reads that answer "does the model still hold, and does production
 * still match it".
 *
 * Both read the saved sources, exactly like the sensors and the delivery hub, so
 * an agent reasoning about a drift is reasoning about what was deployed rather
 * than about unsaved canvas edits.
 */

export interface SimulationService {
  replay: (input: {
    rootPath: string;
    scenarioId?: string;
  }) => Promise<McpScenarioReplay>;
  auditDrift: (input: {
    rootPath: string;
    document: unknown;
  }) => Promise<McpDriftAudit>;
}

/** What the model-core replay reports, reduced to what an agent reads. */
const framesOf = (
  replay: Awaited<ReturnType<typeof replayValidationSuite>>['replays'][number],
): readonly McpReplayFrame[] =>
  replay.steps.map((step) => ({
    sequence: step.sequence,
    actingRoleRef: step.actingRoleRef,
    instanceRef: step.instanceRef,
    entityRef: step.entityRef,
    at: step.at,
    derivations: step.derivations.map((item) => ({
      ruleRef: item.ruleRef,
      target: item.target,
      result: item.result,
    })),
    checkpoints: step.checkpoints.map((item) => ({
      ruleRef: item.ruleRef,
      actual: item.actual,
      passed: item.passed,
    })),
    fulfillmentStates: step.fulfillmentStates.map((item) => ({
      requestInstanceRef: item.requestInstanceRef,
      status: item.status,
    })),
  }));

const driftOf = (audit: DriftAudit): McpDriftAudit => ({
  modelId: String(audit.modelId),
  spanCount: audit.spanCount,
  commitCount: audit.commitCount,
  counts: audit.counts,
  findings: audit.findings.map((item) => ({
    kind: item.kind,
    severity: item.severity,
    message: item.message,
    evidenceRef: item.evidenceRef,
    contextRef: item.contextRef,
    remediation: item.remediation,
  })),
  passed: audit.passed,
  errors: audit.errors,
});

const unavailableReplay = (error: unknown): McpScenarioReplay => ({
  modelId: '',
  passed: false,
  scenarios: [],
  frames: [],
  errors: [
    error instanceof Error
      ? error.message
      : '回放无法执行：模型目录不可读。',
  ],
});

const unavailableDrift = (error: unknown): McpDriftAudit => ({
  modelId: '',
  spanCount: 0,
  commitCount: 0,
  counts: {},
  findings: [],
  passed: false,
  errors: [
    error instanceof Error ? error.message : '漂移审计无法执行：模型目录不可读。',
  ],
});

export const createSimulationService = (): SimulationService => ({
  replay: async ({ rootPath, scenarioId }) => {
    try {
      const sources = await loadModelSources(modelSourceOf(rootPath));
      const report = replayValidationSuite(
        sources.model,
        sources.suite,
        scenarioId === undefined ? undefined : [scenarioId],
      );
      const requested = report.replays.find(
        (item) => item.scenarioId === scenarioId,
      );
      const errors = [
        ...sources.sourceIssues,
        ...report.errors,
        ...(report.replays.length === 0 && report.errors.length === 0
          ? ['模型里没有可回放的场景：这次回放不能作为结论。']
          : []),
      ];

      return {
        modelId: String(report.modelId),
        passed: report.passed && errors.length === 0,
        scenarios: report.replays.map((item) => ({
          scenarioId: item.scenarioId,
          label: item.label,
          stepCount: item.steps.length,
          checkpointCount: item.checkpointCount,
          passed: item.passed,
          errors: item.errors,
        })),
        frames: requested === undefined ? [] : framesOf(requested),
        errors,
      };
    } catch (error) {
      return unavailableReplay(error);
    }
  },

  auditDrift: async ({ rootPath, document }) => {
    try {
      return driftOf(
        await runNativeDriftAudit({
          modelRoot: modelSourceOf(rootPath),
          document,
        }),
      );
    } catch (error) {
      return unavailableDrift(error);
    }
  },
});

/** Re-exported so the request handler can read a trace without the audit. */
export { readProductionTrace };
