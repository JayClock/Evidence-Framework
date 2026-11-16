import {
  compareContracts,
  type ContractComparison,
} from '@evidence-poc/evidence-acceptance';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import {
  buildDelivery,
  type EvidenceApiSnapshot,
} from '@evidence-poc/evidence-api';
import type { ApiCoverageSummary, SensorIssue } from '../sensorReport.js';

export interface ApiSensorInput {
  currentDocument: DomainModelDocument;
  baseDocument?: DomainModelDocument;
  mode?: 'draft' | 'release';
}

export interface ApiSensorOutcome {
  issues: readonly SensorIssue[];
  summary: ApiCoverageSummary;
  snapshot: EvidenceApiSnapshot;
  diff: ContractComparison | null;
}

/** Read-only analysis. Reprojection never acknowledges or repairs a contract. */
export const checkNativeApiSensor = async ({
  currentDocument,
  baseDocument,
  mode = 'draft',
}: ApiSensorInput): Promise<ApiSensorOutcome> => {
  const snapshot = buildDelivery(currentDocument);
  const baseline =
    baseDocument === undefined ? undefined : buildDelivery(baseDocument);
  const diff =
    baseline === undefined ? null : await compareContracts(baseline, snapshot);
  const covered = new Set(snapshot.routes.map((route) => route.entityRef));
  // Roles and participants are not automatically public CRUD resources.
  const expected = currentDocument.entities.filter(
    (entity) => entity.category === 'evidence',
  );
  const uncovered = expected.filter((entity) => !covered.has(entity.id));
  const issues: SensorIssue[] = uncovered.map((entity) => ({
    issueId: `audit_api:API_COVERAGE_GAP:${entity.id}`,
    source: 'audit_api',
    severity: 'warn',
    code: 'API_COVERAGE_GAP',
    message: `${entity.label} 尚无模型路由覆盖。`,
    targetNodeId: entity.id,
    ...(entity.contextRef === undefined
      ? {}
      : { contextRef: entity.contextRef }),
    suggestion: '检查履约结构与责任角色；重新投影不会自动补造业务接口。',
  }));
  for (const diagnostic of snapshot.diagnostics) {
    issues.push({
      issueId: `audit_api:${diagnostic.code}:${diagnostic.targetRef ?? ''}:${diagnostic.message}`,
      source: 'audit_api',
      severity: diagnostic.severity === 'error' ? 'block' : 'warn',
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.targetRef === undefined
        ? {}
        : { targetNodeId: diagnostic.targetRef }),
    });
  }
  for (const [index, change] of (diff?.changes ?? []).entries()) {
    if (change.level < 2) continue;
    const route = [...snapshot.routes, ...(baseline?.routes ?? [])].find(
      (item) => item.path === change.path && item.method === change.operation,
    );
    issues.push({
      issueId: `audit_api:API_BREAKING_CHANGE:${change.id}:${index}`,
      source: 'audit_api',
      severity: mode === 'release' ? 'block' : 'warn',
      code: 'API_BREAKING_CHANGE',
      message: `${change.operation ?? ''} ${change.path ?? ''}: ${change.text}`,
      ...(route === undefined ? {} : { targetNodeId: route.entityRef }),
    });
  }
  if (issues.length === 0)
    issues.push({
      issueId: 'audit_api:API_ALIGNED',
      source: 'audit_api',
      severity: 'info',
      code: 'API_ALIGNED',
      message: '当前模型投影无 API 缺口；不代表已通过发布审查。',
    });
  return {
    snapshot,
    diff,
    issues,
    summary: {
      totalRoutes: snapshot.routes.length,
      coverageRatio:
        expected.length === 0
          ? 1
          : (expected.length - uncovered.length) / expected.length,
      uncoveredEntities: uncovered.map((entity) => entity.id).sort(),
      breakingChangeCount:
        diff?.changes.filter((change) => change.level >= 2).length ?? 0,
      hasBaseline: baseDocument !== undefined,
      modelDigest: snapshot.digests.model,
    },
  };
};
