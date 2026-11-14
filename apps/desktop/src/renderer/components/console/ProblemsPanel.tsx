import { useMemo, useState } from 'react';
import { Activity, Crosshair, X } from 'lucide-react';

import type {
  SensorIssue,
  SensorReport,
} from '@evidence-poc/evidence-agent/browser';
import { cn } from '@evidence-poc/desktop-ui-kit';

import type { SensorSeverity } from './problemFilters';
import { filterIssues } from './problemFilters';

export interface ProblemsPanelProps {
  report: SensorReport | null;
  reportStale: boolean;
  reportLoading: boolean;
  reportError: string | null;
  /** Row the modeler picked; the canvas may already be showing its object. */
  activeIssueId: string | null;
  onFocusIssue: (issue: SensorIssue) => void;
  onRerun: () => void;
  onClose: () => void;
}

const SEVERITY_LABELS: Record<SensorSeverity, string> = {
  block: '阻塞',
  warn: '警告',
  info: '提示',
};

const SEVERITY_CLASSES: Record<SensorSeverity, string> = {
  block: 'text-[#b42318]',
  warn: 'text-[#8d6200]',
  info: 'text-evidence-muted',
};

/**
 * The gate's findings, in a strip the canvas keeps.
 *
 * It replaced a four-tab console: a finding is something you fix while looking
 * at the model, so the list docks under the canvas only while asked and never
 * takes canvas pixels the rest of the time. Filtering by severity is the first
 * thing a modeler does with forty rows, so it is a tab row rather than a menu.
 */
export const ProblemsPanel = ({
  report,
  reportStale,
  reportLoading,
  reportError,
  activeIssueId,
  onFocusIssue,
  onRerun,
  onClose,
}: ProblemsPanelProps) => {
  const [severity, setSeverity] = useState<SensorSeverity | 'all'>('all');
  const issues = useMemo(
    () => filterIssues(report?.issues ?? [], severity),
    [report, severity],
  );

  const counts: Record<SensorSeverity | 'all', number> = {
    all: report?.issues.length ?? 0,
    block: report?.blockCount ?? 0,
    warn: report?.warnCount ?? 0,
    info: report?.infoCount ?? 0,
  };

  return (
    <section
      aria-label="门禁问题面板"
      data-region="problems-panel"
      className="absolute inset-x-0 bottom-0 z-30 flex h-[38%] min-h-40 flex-col border-t border-evidence-line bg-white shadow-[0_-8px_24px_#00000012]"
    >
      <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-evidence-line bg-evidence-surface/70 px-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] tracking-wide text-evidence-muted uppercase">
            <Activity aria-hidden="true" className="size-3" />
            门禁问题
          </span>
          <div
            role="tablist"
            aria-label="问题等级"
            className="flex items-center gap-0.5"
          >
            {(['all', 'block', 'warn', 'info'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={severity === id}
                onClick={() => setSeverity(id)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] transition-colors',
                  severity === id
                    ? 'bg-evidence-accent text-white'
                    : 'text-evidence-muted hover:text-evidence-ink',
                )}
              >
                {id === 'all' ? '全部' : SEVERITY_LABELS[id]} {counts[id]}
              </button>
            ))}
          </div>
          {reportStale ? (
            <span className="text-[10px] text-[#8d6200]">结果已过期</span>
          ) : null}
        </div>

        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onRerun}
            className="rounded px-1.5 py-0.5 text-[10px] text-evidence-muted hover:bg-evidence-line/60 hover:text-evidence-ink"
          >
            重新检查
          </button>
          <button
            type="button"
            aria-label="收合问题面板"
            onClick={onClose}
            className="rounded p-1 text-evidence-muted hover:bg-evidence-line/60 hover:text-evidence-ink"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {reportError === null ? null : (
          <p role="alert" className="px-3 py-2 text-[11px] text-[#b42318]">
            {reportError}
          </p>
        )}

        {report === null ? (
          <p className="px-3 py-4 text-[11px] text-evidence-muted">
            {reportLoading ? '正在运行检查器…' : '尚未运行检查器'}
          </p>
        ) : issues.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-evidence-muted">
            {severity === 'all'
              ? '本轮没有发现项。机器检查不等于业务批准。'
              : `没有${SEVERITY_LABELS[severity]}级别的问题。`}
          </p>
        ) : (
          <ul className="divide-y divide-evidence-line/60">
            {issues.map((issue) => (
              <li
                key={issue.issueId}
                data-issue-id={issue.issueId}
                data-active={issue.issueId === activeIssueId ? 'true' : 'false'}
                className={cn(
                  'flex items-start gap-2 px-3 py-1.5 text-[11px]',
                  issue.issueId === activeIssueId && 'bg-[#eef2f7]',
                )}
              >
                <span
                  className={cn(
                    'w-8 shrink-0 text-[10px] font-medium',
                    SEVERITY_CLASSES[issue.severity],
                  )}
                >
                  {SEVERITY_LABELS[issue.severity]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-evidence-ink">{issue.message}</p>
                  <p className="truncate text-[10px] text-evidence-muted">
                    {issue.code}
                    {issue.targetNodeId === undefined
                      ? ''
                      : ` · ${issue.targetNodeId}`}
                    {issue.suggestion === undefined
                      ? ''
                      : ` · ${issue.suggestion}`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`定位到 ${issue.message}`}
                  onClick={() => onFocusIssue(issue)}
                  className="flex shrink-0 items-center gap-1 rounded border border-evidence-line px-1.5 py-0.5 text-[10px] text-evidence-muted hover:border-evidence-accent hover:text-evidence-ink"
                >
                  <Crosshair aria-hidden="true" className="size-2.5" />
                  定位
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
