/** How a sensor finding blocks work, in the language the skills already use. */
export type SensorSeverity = 'block' | 'warn' | 'info';

/** Which pinned script produced a finding. */
export type SensorSource =
  | 'check_fm'
  | 'audit_key_data'
  | 'check_interview_trace'
  | 'stage_gate';

export interface SensorIssue {
  issueId: string;
  severity: SensorSeverity;
  source: SensorSource;
  /** Stable machine-readable kind, e.g. `FM_INCONSISTENT`. */
  code: string;
  message: string;
  /** Entity or `entity#attribute` the finding belongs to, when known. */
  targetNodeId?: string;
  contextRef?: string;
  suggestion?: string;
}

/** One key data item that still owes a provider decision. */
export interface KeyDataDecision {
  path: string;
  contextRef?: string;
  meaning?: string;
  valueType?: string;
}

export interface KeyDataSummary {
  /** Items `audit_key_data.py` inventoried. */
  totalItems: number;
  /** Items already backed by a contract term, upstream evidence or result fact. */
  resolvedCount: number;
  /** Items still waiting for a human decision. */
  decisionOwedCount: number;
  unresolvedItems: readonly KeyDataDecision[];
}

export interface StageGateSummary {
  target: 'api' | 'visualization';
  passed: boolean;
  scopeRefs: readonly string[];
  errors: readonly string[];
  limitations: readonly string[];
}

export interface SensorReport {
  timestamp: string;
  /** True when static FM consistency produced no blocking issue. */
  passed: boolean;
  blockCount: number;
  warnCount: number;
  infoCount: number;
  issues: readonly SensorIssue[];
  keyDataSummary: KeyDataSummary;
  /** False while the ledger still owes a provider decision. */
  isStageGateReady: boolean;
  stageGate?: StageGateSummary;
  /** Scripts that could not run, e.g. because the pinned interpreter is missing. */
  unavailableSensors: readonly SensorSource[];
}

const issue = (
  source: SensorSource,
  severity: SensorSeverity,
  code: string,
  message: string,
  extra: Pick<SensorIssue, 'targetNodeId' | 'contextRef' | 'suggestion'> = {},
): SensorIssue => ({
  issueId: `${source}:${code}:${message}`,
  severity,
  source,
  code,
  message,
  ...extra,
});

/** Shape of `check_fm.py`'s JSON report, narrowed to what the UI reads. */
export interface FmCheckReport {
  checkVersion?: number;
  valid?: boolean;
  consistent?: boolean;
  complete?: boolean | null;
  inputChanged?: boolean;
  errors?: readonly string[];
  gaps?: readonly string[];
  scopeRefs?: readonly string[];
  executedScenarioCount?: number;
}

/** Shape of `audit_key_data.py`'s JSON report. */
export interface KeyDataAuditReport {
  checkVersion?: number;
  valid?: boolean;
  keyDataCount?: number;
  counts?: Readonly<Record<string, number>>;
  needsDecision?: readonly KeyDataDecision[];
  note?: string;
}

/** Shape of `check_stage_gate.py`'s JSON report. */
export interface StageGateReport {
  passed?: boolean;
  target?: 'api' | 'visualization';
  scopeRefs?: readonly string[];
  errors?: readonly string[];
  limitations?: readonly string[];
}

const MAX_KEY_DATA = 40;

/**
 * Turns `check_fm.py` output into blocking and warning findings.
 *
 * Static inconsistency is blocking: downstream contracts must not be derived
 * from a model that does not close. Scope gaps stay warnings until the scope is
 * asked for, mirroring the skill's own severity language.
 */
export const fmCheckIssues = (report: FmCheckReport): SensorIssue[] => {
  const issues: SensorIssue[] = [];

  for (const message of report.errors ?? []) {
    issues.push(
      issue('check_fm', 'block', 'FM_INCONSISTENT', message, {
        suggestion: '修正引用、合同边界或履约配对后重新运行一致性检查。',
      }),
    );
  }

  for (const message of report.gaps ?? []) {
    issues.push(
      issue('check_fm', 'warn', 'FM_SCOPE_GAP', message, {
        suggestion: '补齐责任闭环或补充验证场景后再交给下游。',
      }),
    );
  }

  if (report.inputChanged === true) {
    issues.push(
      issue(
        'check_fm',
        'warn',
        'FM_INPUT_CHANGED',
        '检查期间模型输入发生变化，结论已过期。',
        {
          suggestion: '重新运行一致性检查。',
        },
      ),
    );
  }

  if (report.executedScenarioCount === 0) {
    issues.push(
      issue(
        'check_fm',
        'info',
        'FM_NO_SCENARIO',
        '当前范围没有可执行的验证场景。',
      ),
    );
  }

  return issues;
};

/**
 * Turns `audit_key_data.py` output into the ledger summary.
 *
 * Items that still owe a provider decision are warnings, not static errors —
 * the script itself calls them a decision list — but they keep the stage gate
 * closed, which is what stops a model with orphan amounts from reaching API
 * design.
 */
export const keyDataSummaryOf = (
  report: KeyDataAuditReport,
): { summary: KeyDataSummary; issues: SensorIssue[] } => {
  const unresolved = report.needsDecision ?? [];
  const totalItems = report.keyDataCount ?? 0;
  const summary: KeyDataSummary = {
    totalItems,
    resolvedCount: Math.max(0, totalItems - unresolved.length),
    decisionOwedCount: unresolved.length,
    unresolvedItems: unresolved.slice(0, MAX_KEY_DATA),
  };

  const issues =
    unresolved.length === 0
      ? [
          issue(
            'audit_key_data',
            'info',
            'KEY_DATA_RESOLVED',
            `${totalItems} 项关键数据都有提供方结论。`,
          ),
        ]
      : unresolved.slice(0, MAX_KEY_DATA).map((item) =>
          issue(
            'audit_key_data',
            'warn',
            'KEY_DATA_DECISION_OWED',
            `${item.path} 尚未给出提供方结论${item.meaning === undefined ? '' : `：${item.meaning}`}`,
            {
              targetNodeId: item.path,
              ...(item.contextRef === undefined
                ? {}
                : { contextRef: item.contextRef }),
              suggestion:
                '按“输入凭证／合同参数 → 规则 → 结果”补齐提供方，或补派生规则。',
            },
          ),
        );

  return { summary, issues };
};

export const stageGateSummaryOf = (
  report: StageGateReport,
): StageGateSummary => ({
  target: report.target ?? 'api',
  passed: report.passed === true,
  scopeRefs: report.scopeRefs ?? [],
  errors: report.errors ?? [],
  limitations: report.limitations ?? [],
});

const countBy = (
  issues: readonly SensorIssue[],
  severity: SensorSeverity,
): number => issues.filter((item) => item.severity === severity).length;

/** Recomputes counters after callers append findings of their own. */
export const finalizeSensorReport = ({
  issues,
  keyDataSummary,
  stageGate,
  unavailableSensors = [],
  now = () => new Date(),
}: {
  issues: readonly SensorIssue[];
  keyDataSummary: KeyDataSummary;
  stageGate?: StageGateSummary;
  unavailableSensors?: readonly SensorSource[];
  now?: () => Date;
}): SensorReport => {
  const unique = [
    ...new Map(issues.map((item) => [item.issueId, item])).values(),
  ];
  const blockCount = countBy(unique, 'block');

  return {
    timestamp: now().toISOString(),
    passed: blockCount === 0,
    blockCount,
    warnCount: countBy(unique, 'warn'),
    infoCount: countBy(unique, 'info'),
    issues: unique,
    keyDataSummary,
    isStageGateReady:
      stageGate?.passed === true &&
      keyDataSummary.decisionOwedCount === 0 &&
      blockCount === 0,
    ...(stageGate === undefined ? {} : { stageGate }),
    unavailableSensors,
  };
};

const emptyKeyData: KeyDataSummary = {
  totalItems: 0,
  resolvedCount: 0,
  decisionOwedCount: 0,
  unresolvedItems: [],
};

/** Builds the single report the desktop status bar and tools both read. */
export const buildSensorReport = ({
  fmCheck,
  keyData,
  stageGate,
  unavailableSensors = [],
  now = () => new Date(),
}: {
  fmCheck?: FmCheckReport;
  keyData?: KeyDataAuditReport;
  stageGate?: StageGateSummary;
  unavailableSensors?: readonly SensorSource[];
  now?: () => Date;
}): SensorReport => {
  const ledger = keyData === undefined ? undefined : keyDataSummaryOf(keyData);
  const issues: SensorIssue[] = [
    ...(fmCheck === undefined ? [] : fmCheckIssues(fmCheck)),
    ...(ledger === undefined ? [] : ledger.issues),
    ...unavailableSensors.map((source) =>
      issue(
        source,
        'block',
        'SENSOR_UNAVAILABLE',
        `无法执行 ${source}，结论不可用。`,
        {
          suggestion: '运行 ./init.sh 修复锁定的运行环境。',
        },
      ),
    ),
  ];

  return finalizeSensorReport({
    issues,
    keyDataSummary: ledger?.summary ?? emptyKeyData,
    ...(stageGate === undefined ? {} : { stageGate }),
    unavailableSensors,
    now,
  });
};
