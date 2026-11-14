import {
  entitySignature,
  isEvidenceEntity,
  isFulfillmentRequest,
  type DomainModelDocument,
  type EntityAST,
} from '@evidence-poc/evidence-schema';

import type { EvidenceCommit, ProductionTrace } from '../../telemetry/productionTrace.js';

/**
 * Where production and the model disagree.
 *
 * A drift finding is not a bug report about code: it is the question the trace
 * raises and only a modeler can answer — is the model behind the business, or is
 * the service writing something nobody agreed to. The kinds below separate the
 * two, because the remedy for each is the opposite of the other.
 */
export type ArchitectureDriftKind =
  | 'UNMODELED_EVIDENCE_COMMITTED'
  | 'UNMODELED_ATTRIBUTE_WRITTEN'
  | 'DERIVED_VALUE_SUPPLIED'
  | 'CROSS_CONTEXT_WRITE'
  | 'BREACH_WITHOUT_FOLLOW_UP';

export const DRIFT_KIND_LABELS: Readonly<Record<ArchitectureDriftKind, string>> = {
  UNMODELED_EVIDENCE_COMMITTED: '未建模凭证',
  UNMODELED_ATTRIBUTE_WRITTEN: '未建模字段',
  DERIVED_VALUE_SUPPLIED: '派生值被当成人参',
  CROSS_CONTEXT_WRITE: '跨上下文写入',
  BREACH_WITHOUT_FOLLOW_UP: '违约后无后续',
};

export interface ArchitectureDriftFinding {
  driftId: string;
  kind: ArchitectureDriftKind;
  severity: 'block' | 'warn';
  message: string;
  /** The commit the finding is about, reduced to what a reader can chase. */
  commit: {
    traceId: string;
    spanId: string;
    serviceName: string;
    operation: string;
    at: string | null;
  } | null;
  evidenceRef: string | null;
  contextRef: string | null;
  modelExpectation: {
    evidenceRef?: string;
    contextRef?: string;
    ruleRef?: string;
    reason: string;
  };
  remediation: string;
}

export interface DriftAudit {
  checkVersion: 5;
  modelId: unknown;
  spanCount: number;
  commitCount: number;
  counts: Readonly<Record<ArchitectureDriftKind, number>>;
  findings: readonly ArchitectureDriftFinding[];
  /** True when no blocking drift was found; warnings still need a decision. */
  passed: boolean;
  errors: readonly string[];
}

const emptyCounts = (): Record<ArchitectureDriftKind, number> => ({
  UNMODELED_EVIDENCE_COMMITTED: 0,
  UNMODELED_ATTRIBUTE_WRITTEN: 0,
  DERIVED_VALUE_SUPPLIED: 0,
  CROSS_CONTEXT_WRITE: 0,
  BREACH_WITHOUT_FOLLOW_UP: 0,
});

const commitOf = (
  commit: EvidenceCommit,
): ArchitectureDriftFinding['commit'] => ({
  traceId: commit.traceId,
  spanId: commit.spanId,
  serviceName: commit.serviceName,
  operation: commit.operation,
  at: commit.at,
});

const contextOf = (entity: EntityAST | undefined): string | null => {
  if (entity === undefined) {
    return null;
  }

  return 'contextRef' in entity ? (entity.contextRef ?? null) : null;
};

const attributeOf = (entity: EntityAST, name: string) =>
  (entity.attributes ?? []).find((attribute) => attribute.name === name);

const isBlocking = (kind: ArchitectureDriftKind): boolean =>
  kind === 'UNMODELED_EVIDENCE_COMMITTED' ||
  kind === 'DERIVED_VALUE_SUPPLIED';

const finding = (
  kind: ArchitectureDriftKind,
  message: string,
  fields: Pick<ArchitectureDriftFinding, 'commit' | 'evidenceRef' | 'contextRef' | 'modelExpectation' | 'remediation'> & {
    driftId?: string;
  },
): ArchitectureDriftFinding => ({
  driftId:
    fields.driftId ??
    [
      kind,
      fields.evidenceRef ?? 'unknown',
      fields.commit === null
        ? 'none'
        : `${fields.commit.traceId}/${fields.commit.spanId}`,
      message,
    ].join(':'),
  kind,
  severity: isBlocking(kind) ? 'block' : 'warn',
  message,
  commit: fields.commit,
  evidenceRef: fields.evidenceRef,
  contextRef: fields.contextRef,
  modelExpectation: fields.modelExpectation,
  remediation: fields.remediation,
});

/**
 * What the model says should follow a breach of this request.
 *
 * A breach rule declares the condition, and the compensation is a separate,
 * explicit decision. Asking for both keeps the audit from calling a model
 * complete just because it can detect the breach.
 */
const breachOf = (
  model: DomainModelDocument,
  requestRef: string,
): { ruleRef: string; confirmations: ReadonlySet<string> } | null => {
  const rule = model.rules.find(
    (candidate) =>
      candidate.kind === 'breach' &&
      Object.values(candidate.bindings).some(
        (binding) => 'ref' in binding && binding.ref === requestRef,
      ),
  );

  if (rule === undefined) {
    return null;
  }

  const confirmations = new Set<string>();

  for (const binding of Object.values(rule.bindings)) {
    if ('ref' in binding && binding.ref !== requestRef) {
      confirmations.add(binding.ref);
    }
  }

  return { ruleRef: rule.id, confirmations };
};

/**
 * Compares the commits a production trace recorded with the model's claims.
 *
 * The trace is read as facts and the model as intent. A commit for Evidence the
 * model does not have is blocking, because a business fact no contract covers is
 * exactly what an audit must not wave through; a breach with nothing modelled
 * after it is only a warning, because the compensation may legitimately live in
 * another team's trace.
 */
export const auditProductionDrift = ({
  model,
  trace,
}: {
  model: DomainModelDocument;
  trace: ProductionTrace;
}): DriftAudit => {
  const counts = emptyCounts();
  const findings: ArchitectureDriftFinding[] = [];
  const entities = new Map(model.entities.map((entity) => [entity.id, entity]));
  const contexts = new Set(
    model.entities
      .filter((entity) => entitySignature(entity).startsWith('context.'))
      .map((entity) => entity.id),
  );

  const push = (item: ArchitectureDriftFinding): void => {
    counts[item.kind] += 1;
    findings.push(item);
  };

  for (const commit of trace.commits) {
    const entity = entities.get(commit.evidenceRef);

    if (entity === undefined || !isEvidenceEntity(entity)) {
      push(
        finding(
          'UNMODELED_EVIDENCE_COMMITTED',
          `服务 ${commit.serviceName} 在 ${commit.operation} 中提交了模型里没有的凭证 ${commit.evidenceRef}。`,
          {
            commit: commitOf(commit),
            evidenceRef: commit.evidenceRef,
            contextRef: commit.contextRef,
            modelExpectation: {
              reason: '该凭证不在任何已建模凭证类型中，无法判断它的权责与追溯关系。',
            },
            remediation:
              '确认这是新业务：把它作为凭证补进对应的合同上下文（必要时先做依赖反转），否则从服务里撤掉这次写入。',
          },
        ),
      );

      continue;
    }

    const modeledContext = contextOf(entity);

    if (commit.contextRef !== null && commit.contextRef !== modeledContext) {
      push(
        finding(
          'CROSS_CONTEXT_WRITE',
          contexts.has(commit.contextRef)
            ? `服务 ${commit.serviceName} 把 ${commit.evidenceRef} 写进了 ${commit.contextRef}，模型把它归在 ${modeledContext ?? '未声明上下文'}。`
            : `服务 ${commit.serviceName} 声明写入 ${commit.contextRef}，但模型里没有这个上下文。`,
          {
            commit: commitOf(commit),
            evidenceRef: commit.evidenceRef,
            contextRef: commit.contextRef,
            modelExpectation: {
              evidenceRef: commit.evidenceRef,
              ...(modeledContext === null ? {} : { contextRef: modeledContext }),
              reason: '凭证的归属决定它属于哪份合约、哪条弹性边界。',
            },
            remediation:
              '要么由所属上下文自己提交这张凭证，要么把这条写入改成一次显式的履约调用。',
          },
        ),
      );
    }

    for (const [name, value] of Object.entries(commit.values)) {
      const attribute = attributeOf(entity, name);

      if (attribute === undefined) {
        push(
          finding(
            'UNMODELED_ATTRIBUTE_WRITTEN',
            `服务 ${commit.serviceName} 给 ${commit.evidenceRef} 写入了模型没有声明的字段 ${name}。`,
            {
              commit: commitOf(commit),
              evidenceRef: commit.evidenceRef,
              contextRef: modeledContext,
              modelExpectation: {
                evidenceRef: commit.evidenceRef,
                reason: '未声明的字段不会进入派生、台账或对外契约。',
              },
              remediation: `在 ${commit.evidenceRef} 上补声明 ${name}，或让服务停止写入它。`,
            },
          ),
        );

        continue;
      }

      if (attribute.derivedByRuleRef !== undefined) {
        if (value === undefined || value === null) {
          continue;
        }

        push(
          finding(
            'DERIVED_VALUE_SUPPLIED',
            `服务 ${commit.serviceName} 直接写入了派生字段 ${commit.evidenceRef}#${name}，模型规定它由 ${attribute.derivedByRuleRef} 算出。`,
            {
              commit: commitOf(commit),
              evidenceRef: commit.evidenceRef,
              contextRef: modeledContext,
              modelExpectation: {
                evidenceRef: commit.evidenceRef,
                ruleRef: attribute.derivedByRuleRef,
                reason: '派生值接受外部入参，等于把服务端计算交给调用方决定。',
              },
              remediation:
                '把该字段从写入路径上撤下，改由规则从已建模输入算出；不要为了迁就代码去改模型。',
            },
          ),
        );
      }
    }

    if (commit.fulfillment === null || commit.fulfillment.status !== 'breached') {
      continue;
    }

    const candidate = entities.get(commit.fulfillment.requestRef);
    const breached =
      candidate !== undefined && isFulfillmentRequest(candidate)
        ? candidate
        : undefined;
    const breach = breached === undefined ? null : breachOf(model, breached.id);

    if (breach === null || breached === undefined) {
      push(
        finding(
          'BREACH_WITHOUT_FOLLOW_UP',
          `${commit.fulfillment.requestRef} 在生产中被判定违约，模型没有为它声明违约判断与补偿履约。`,
          {
            commit: commitOf(commit),
            evidenceRef: commit.evidenceRef,
            contextRef: modeledContext,
            modelExpectation: {
              evidenceRef: breached?.id ?? commit.fulfillment.requestRef,
              reason: '违约不是回滚：没有补偿履约，退款与赔付就只能靠人工补。',
            },
            remediation: '为该请求补一条违约判断与补偿履约对，再核对服务是否真的会发起它。',
          },
        ),
      );

      continue;
    }

    const breachedContext = contextOf(breached);
    const followed = trace.commits.some(
      (candidate) =>
        candidate !== commit &&
        candidate.evidenceRef !== commit.evidenceRef &&
        !breach.confirmations.has(candidate.evidenceRef) &&
        contextOf(entities.get(candidate.evidenceRef)) === breachedContext,
    );

    if (!followed) {
      push(
        finding(
          'BREACH_WITHOUT_FOLLOW_UP',
          `${commit.fulfillment.requestRef} 违约后，trace 里没有任何同上下文的后续履约。`,
          {
            commit: commitOf(commit),
            evidenceRef: commit.evidenceRef,
            contextRef: breachedContext,
            modelExpectation: {
              evidenceRef: breached.id,
              ruleRef: breach.ruleRef,
              ...(breachedContext === null ? {} : { contextRef: breachedContext }),
              reason: '模型声明了违约判断，但没有任何凭证证明补偿真的发生了。',
            },
            remediation:
              '确认补偿履约是否在别的 trace 里：如果确实没发生，服务漏掉了补偿路径。',
          },
        ),
      );
    }
  }

  const errors = [...trace.errors];
  const passed = !findings.some((item) => item.severity === 'block');

  return {
    checkVersion: 5,
    modelId: model.manifest.id,
    spanCount: trace.spanCount,
    commitCount: trace.commits.length,
    counts,
    findings,
    passed,
    errors,
  };
};
