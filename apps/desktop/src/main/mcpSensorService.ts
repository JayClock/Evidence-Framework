import { createPythonEnvResolver } from '@evidence-poc/evidence-agent-core';
import {
  createSensorsEngine,
  type KeyDataAuditReport,
  type SensorsEngine,
} from '@evidence-poc/evidence-modeling-orchestrator';
import type {
  McpKeyDataAudit,
  McpStageGateResult,
} from '@evidence-poc/evidence-mcp';

import { modelSourceOf, tracePathOf } from './modelSource';

/** Builds one sensors engine per project root and caches it. */
export interface McpSensorServiceOptions {
  createEngine?: (
    rootPath: string,
  ) => Pick<SensorsEngine, 'runFullSensors' | 'checkStageGate'>;
}

const toAudit = (report: KeyDataAuditReport | undefined): McpKeyDataAudit => ({
  producedBy: report === undefined ? 'unavailable' : 'pinned-python',
  keyDataCount: report?.keyDataCount ?? 0,
  counts: report?.counts ?? {},
  needsDecision: report?.needsDecision ?? [],
  derived: [],
  note:
    report?.note ??
    '未找到锁定的 Python 解释器，关键数据台账不可用；请运行 ./init.sh。',
});

/**
 * The two MCP calls that must run the pinned Python checkers.
 *
 * They are honestly reported as unavailable when the pinned interpreter is
 * missing, instead of returning an empty ledger that reads like a clean model.
 */
export const createMcpSensorService = ({
  createEngine,
}: McpSensorServiceOptions = {}) => {
  const engines = new Map<
    string,
    Pick<SensorsEngine, 'runFullSensors' | 'checkStageGate'>
  >();

  const engineFor = (rootPath: string) => {
    const existing = engines.get(rootPath);

    if (existing !== undefined) {
      return existing;
    }

    const created =
      createEngine?.(rootPath) ??
      createSensorsEngine({
        resolver: createPythonEnvResolver({ projectRoot: rootPath }),
      });

    engines.set(rootPath, created);

    return created;
  };

  return {
    readKeyDataAudit: async (rootPath: string): Promise<McpKeyDataAudit> => {
      try {
        const outcome = await engineFor(rootPath).runFullSensors({
          modelRoot: modelSourceOf(rootPath),
          tracePath: tracePathOf(rootPath),
        });

        return toAudit(outcome.keyData);
      } catch {
        return toAudit(undefined);
      }
    },
    checkStageGate: async ({
      rootPath,
      target,
    }: {
      rootPath: string;
      target: 'api' | 'visualization';
    }): Promise<McpStageGateResult> => {
      try {
        const gate = await engineFor(rootPath).checkStageGate({
          target,
          modelRoot: modelSourceOf(rootPath),
          tracePath: tracePathOf(rootPath),
        });

        return {
          passed: gate.passed,
          exitCode: gate.passed ? 0 : 1,
          driftDetected: false,
          blockingReasons: gate.errors,
        };
      } catch (error) {
        return {
          passed: false,
          exitCode: 1,
          driftDetected: false,
          blockingReasons: [
            error instanceof Error
              ? error.message
              : '阶段门禁无法执行；请确认已运行 ./init.sh。',
          ],
        };
      }
    },
  };
};
