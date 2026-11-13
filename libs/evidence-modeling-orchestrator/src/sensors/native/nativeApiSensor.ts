import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import {
  buildDelivery,
  diffModelToApi,
  type ApiModelDiffResult,
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
  diff: ApiModelDiffResult | null;
}

/** Read-only analysis. Reprojection never acknowledges or repairs a contract. */
export const checkNativeApiSensor = ({
  currentDocument,
  baseDocument,
  mode = 'draft',
}: ApiSensorInput): ApiSensorOutcome => {
  const snapshot = buildDelivery(currentDocument);
  const diff =
    baseDocument === undefined
      ? null
      : diffModelToApi(baseDocument, currentDocument);
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
    });
  }
  for (const route of diff?.routes ?? []) {
    for (const [index, breaking] of route.breakingChanges.entries()) {
      issues.push({
        issueId: `audit_api:API_BREAKING_CHANGE:${route.id}:${breaking.kind}:${index}`,
        source: 'audit_api',
        severity: mode === 'release' ? 'block' : 'warn',
        code: 'API_BREAKING_CHANGE',
        message: `${breaking.method} ${breaking.path}: ${breaking.description}`,
        targetNodeId: route.entityRef,
        suggestion: breaking.remediationHint,
      });
    }
    for (const field of route.fieldDiffs.filter(
      (field) => field.shifted === 'to_derived',
    )) {
      issues.push({
        issueId: `audit_api:API_DERIVATION_DRIFT:${route.id}:${field.name}`,
        source: 'audit_api',
        severity: 'info',
        code: 'API_DERIVATION_DRIFT',
        message: `${field.name} 已转为服务端派生字段。`,
        targetNodeId: `${route.entityRef}#${field.name}`,
      });
    }
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
      breakingChangeCount: diff?.summary.breakingChangeCount ?? 0,
      hasBaseline: baseDocument !== undefined,
      modelDigest: snapshot.digests.model,
    },
  };
};
