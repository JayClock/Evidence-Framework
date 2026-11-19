import { useMemo, useState } from 'react';
import { Crosshair, RefreshCw, X, Zap } from 'lucide-react';

import type {
  SensorIssue,
  SensorReport,
} from '@evidence-poc/evidence-agent/browser';
import { Button, cn } from '@evidence-poc/desktop-ui-kit';

import { filterIssues, type SensorSeverity } from './problemFilters';

export interface ProblemsPanelProps {
  report: SensorReport | null;
  reportStale: boolean;
  reportLoading: boolean;
  reportError: string | null;
  activeIssueId: string | null;
  docked?: boolean;
  canFocusIssue: (issue: SensorIssue) => boolean;
  onFocusIssue: (issue: SensorIssue) => void;
  onRerun: () => void;
  onClose: () => void;
}

const LEVELS = ['all', 'block', 'warn', 'info'] as const;
const LABELS = {
  all: '全部',
  block: '阻断',
  warn: '警告',
  info: '信息',
} as const;
const TONES = {
  block: 'bg-red-50 text-red-800',
  warn: 'bg-amber-100 text-amber-900',
  info: 'bg-workbench-subtle text-workbench-label',
};

export const ProblemsPanel = ({
  report,
  reportStale,
  reportLoading,
  reportError,
  activeIssueId,
  docked = false,
  canFocusIssue,
  onFocusIssue,
  onRerun,
  onClose,
}: ProblemsPanelProps) => {
  const [severity, setSeverity] = useState<SensorSeverity | 'all'>('all');
  const issues = useMemo(
    () => filterIssues(report?.issues ?? [], severity),
    [report, severity],
  );
  const counts = {
    all: report?.issues.length ?? 0,
    block: report?.blockCount ?? 0,
    warn: report?.warnCount ?? 0,
    info: report?.infoCount ?? 0,
  };
  const status = reportLoading
    ? '正在运行检查器…'
    : reportError !== null
      ? null
      : report === null
        ? '尚未运行检查器'
        : reportStale
          ? '结果已过期'
          : issues.length !== 0
            ? null
            : severity === 'all'
              ? '本轮没有发现项。机器检查不等于业务批准。'
              : `没有${LABELS[severity]}级别的问题。`;

  return (
    <section
      aria-label="门禁问题面板"
      data-region="problems-panel"
      data-evidence-capture-hide=""
      data-workbench-chrome=""
      className={cn(
        'absolute z-30 flex h-[200px] max-h-[55%] min-w-0 flex-col overflow-hidden border-workbench-border bg-white shadow-overlay',
        docked
          ? 'inset-x-0 bottom-0 border-t'
          : 'inset-x-5 bottom-4 rounded-lg border',
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-workbench-border bg-[#fafafa] px-3 py-1.5">
        <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-evidence-ink">
          <Zap
            aria-hidden="true"
            className="size-3.5 shrink-0 text-evidence-accent"
          />
          门禁与诊断{report === null ? '' : `（${counts.all} 项发现）`}
        </h2>
        <div className="flex shrink-0 items-center gap-1 [&_svg]:size-3.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onRerun}
            disabled={reportLoading}
            title="重新扫描（Cmd/Ctrl+Shift+R）"
          >
            <RefreshCw aria-hidden="true" />
            重新扫描
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="收合问题面板"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>
      {report === null ? null : (
        <div
          role="group"
          aria-label="问题等级"
          className="flex shrink-0 flex-wrap items-center gap-1 border-b border-workbench-subtle px-3 py-1"
        >
          {LEVELS.map((level) => (
            <Button
              key={level}
              type="button"
              variant="ghost"
              size="xs"
              aria-pressed={severity === level}
              onClick={() => setSeverity(level)}
              className="aria-pressed:bg-workbench-subtle aria-pressed:font-semibold"
            >
              {LABELS[level]} {counts[level]}
            </Button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {reportError === null ? null : (
          <p role="alert" className="px-3 py-2 text-[11px] text-red-800">
            {reportError}
          </p>
        )}
        {status === null ? null : (
          <p
            role="status"
            className={cn(
              'px-3 py-2 text-[11px]',
              reportStale && report !== null
                ? 'text-amber-900'
                : 'text-workbench-muted',
            )}
          >
            {status}
          </p>
        )}
        {issues.length === 0 ? null : (
          <ul className="divide-y divide-workbench-subtle">
            {issues.map((issue) => (
              <li
                key={issue.issueId}
                data-issue-id={issue.issueId}
                data-active={issue.issueId === activeIssueId ? 'true' : 'false'}
                className={cn(
                  'flex items-start gap-2 px-3 py-2 text-[11px]',
                  issue.issueId === activeIssueId && 'bg-evidence-active',
                )}
              >
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                    TONES[issue.severity],
                  )}
                >
                  {LABELS[issue.severity]}
                </span>
                <div className="min-w-0 flex-1 wrap-anywhere">
                  <p className="text-workbench-body">{issue.message}</p>
                  <p className="mt-0.5 text-[10px] text-workbench-muted">
                    {issue.code}
                    {issue.targetNodeId ? ` · ${issue.targetNodeId}` : ''}
                    {issue.suggestion ? ` · ${issue.suggestion}` : ''}
                  </p>
                </div>
                {canFocusIssue(issue) ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="[&_svg]:size-3"
                    aria-label={`定位到 ${issue.message}`}
                    onClick={() => onFocusIssue(issue)}
                  >
                    <Crosshair aria-hidden="true" />
                    定位
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
