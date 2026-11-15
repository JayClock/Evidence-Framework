import type { McpDriftAudit } from '@evidence-poc/evidence-mcp';
import {
  readProductionTrace,
  runNativeDriftAudit,
  type DriftAudit,
} from '@evidence-poc/evidence-agent';
import { modelSourceOf } from './modelSource';
export interface DriftService {
  auditDrift: (input: {
    rootPath: string;
    document: unknown;
  }) => Promise<McpDriftAudit>;
}

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

const unavailableDrift = (error: unknown): McpDriftAudit => ({
  modelId: '',
  spanCount: 0,
  commitCount: 0,
  counts: {},
  findings: [],
  passed: false,
  errors: [
    error instanceof Error
      ? error.message
      : '漂移审计无法执行：模型目录不可读。',
  ],
});

export const createDriftService = (): DriftService => ({
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

export { readProductionTrace };
