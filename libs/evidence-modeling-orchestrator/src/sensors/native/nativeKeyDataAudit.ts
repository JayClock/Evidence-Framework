import type { DomainModelDocument, KeyDataSourceKind } from '@evidence-poc/evidence-schema';
import {
  buildKeyDataLedger,
  type TraceabilityDocument,
} from '@evidence-poc/evidence-model-core';

import type { KeyDataAuditReport, KeyDataDecision } from '../sensorReport.js';

/**
 * Key data auditing.
 *
 * Every key data item is classified by how its value is established: a contract
 * term, a domain source, a negotiation source, a result fact, a request formation
 * input, a derived value, or a decision still owed. The classification is the
 * ledger's, so the badge in the attribute table and this report cannot drift.
 *
 * The report keeps one stable shape, because a saved report is compared with a
 * fresh one.
 */
export const runNativeKeyDataAudit = (
  model: DomainModelDocument,
  traceability: TraceabilityDocument,
): KeyDataAuditReport => {
  const ledger = buildKeyDataLedger(model);
  const sources = new Map<string, string[]>();

  for (const edge of traceability.edges) {
    const list = sources.get(edge.target) ?? [];
    list.push(edge.source);
    sources.set(edge.target, list);
  }

  const counts: Record<string, number> = {};

  for (const [kind, count] of Object.entries(ledger.counts)) {
    // Only buckets that actually occur are printed, so a clean ledger stays short.
    if (count > 0) {
      counts[kind] = count;
    }
  }

  const needsDecision: KeyDataDecision[] = ledger.decisionOwed.map((entry) => ({
    path: `${entry.entityRef}#${entry.attribute}`,
    ...(entry.contextRef === undefined ? {} : { contextRef: entry.contextRef }),
    meaning: entry.meaning,
    ...(entry.valueType === undefined ? {} : { valueType: entry.valueType }),
  }));

  const derived = ledger.derived
    .map((entry) => ({
      path: `${entry.entityRef}#${entry.attribute}`,
      ...(entry.ruleRef === undefined ? {} : { ruleRef: entry.ruleRef }),
      sources: [...new Set(sources.get(`${entry.entityRef}#${entry.attribute}`) ?? [])].sort(),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    checkVersion: 1,
    valid: true,
    modelId: model.manifest.id,
    keyDataCount: ledger.entries.length,
    counts: counts as Readonly<Record<KeyDataSourceKind, number>>,
    needsDecision,
    derived,
    note: 'needsDecision 是待决清单，不是错误：每项须给出提供方结论（合同参数、前序凭证属性或请求形成事实），或补派生规则。',
  };
};
