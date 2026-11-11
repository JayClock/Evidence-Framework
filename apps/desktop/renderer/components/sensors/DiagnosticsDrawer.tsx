import type {
  SensorIssue,
  SensorReport,
} from '@evidence-poc/evidence-modeling-orchestrator';

interface DiagnosticsDrawerProps {
  report: SensorReport;
  onClose: () => void;
  onFocusIssue: (issue: SensorIssue) => void;
}

const severityLabel = (severity: SensorIssue['severity']): string =>
  severity === 'block' ? '阻塞' : severity === 'warn' ? '警告' : '提示';

const severityClass = (severity: SensorIssue['severity']): string =>
  severity === 'block'
    ? 'text-[#b42318]'
    : severity === 'warn'
      ? 'text-[#8d6200]'
      : 'text-evidence-muted';

/**
 * Lists every finding and jumps to the object it belongs to.
 *
 * A finding without a resolvable target stays clickable but inert: showing the
 * message is honest, pretending it points somewhere is not.
 */
export const DiagnosticsDrawer = ({
  report,
  onClose,
  onFocusIssue,
}: DiagnosticsDrawerProps) => (
  <section
    aria-label="检查结果"
    className="max-h-64 shrink-0 overflow-y-auto border-t border-evidence-line bg-white/95"
  >
    <div className="sticky top-0 flex items-center justify-between border-b border-evidence-line bg-white/95 px-3 py-1.5">
      <span className="text-[10px] tracking-wide text-evidence-muted uppercase">
        检查结果 · 阻塞 {report.blockCount} · 警告 {report.warnCount} · 提示{' '}
        {report.infoCount}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="rounded border border-evidence-line px-1.5 py-0.5 text-[10px] text-evidence-muted hover:bg-[#f1f3f6]"
      >
        收起
      </button>
    </div>

    {report.issues.length === 0 ? (
      <p className="px-3 py-2 text-[11px] text-evidence-muted">
        本轮没有发现项。
      </p>
    ) : (
      <ul className="divide-y divide-evidence-line">
        {report.issues.map((issue) => (
          <li key={issue.issueId}>
            <button
              type="button"
              onClick={() => onFocusIssue(issue)}
              className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-[#f1f3f6]"
            >
              <span
                className={`shrink-0 text-[10px] ${severityClass(issue.severity)}`}
              >
                {severityLabel(issue.severity)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] text-evidence-ink">
                  {issue.message}
                </span>
                <span className="block text-[10px] text-evidence-muted">
                  {issue.source} · {issue.code}
                  {issue.targetNodeId === undefined
                    ? ''
                    : ` · ${issue.targetNodeId}`}
                </span>
                {issue.suggestion === undefined ? null : (
                  <span className="block text-[10px] text-evidence-muted">
                    {issue.suggestion}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}

    {report.keyDataSummary.decisionOwedCount > 0 ? (
      <div className="border-t border-evidence-line px-3 py-1.5">
        <p className="text-[10px] text-[#8d6200]">
          关键数据待决 {report.keyDataSummary.decisionOwedCount}{' '}
          项，阶段门禁保持关闭。
        </p>
        <ul className="mt-1 space-y-0.5">
          {report.keyDataSummary.unresolvedItems.map((item) => (
            <li key={item.path} className="text-[10px] text-evidence-muted">
              {item.path}
              {item.meaning === undefined ? '' : `：${item.meaning}`}
            </li>
          ))}
        </ul>
      </div>
    ) : null}
  </section>
);
