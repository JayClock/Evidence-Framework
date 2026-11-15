import { DRIFT_KIND_LABELS } from '@evidence-poc/evidence-agent/browser';
import { useDriftAudit } from '../../state/useDriftAudit';
const SEVERITY_LABELS: Record<string, string> = { block: '阻塞', warn: '警告' };
export interface DriftRadarProps {
  rootPath: string;
  onClose: () => void;
  embedded?: boolean;
}
export const DriftRadar = ({
  rootPath,
  onClose,
  embedded = false,
}: DriftRadarProps) => {
  const drift = useDriftAudit(rootPath);
  return (
    <div
      role={embedded ? 'region' : 'dialog'}
      aria-label="生产漂移"
      className="flex h-full min-h-0 flex-1 flex-col bg-white"
    >
      <header className="flex justify-between p-3">
        <h2>生产漂移</h2>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-evidence-line px-4 py-2">
          <button
            type="button"
            onClick={() => void drift.pickAndAudit()}
            disabled={drift.loading}
            className="rounded bg-evidence-accent px-2.5 py-1 text-[11px] text-white disabled:opacity-40"
          >
            {drift.loading ? '比对中…' : '选择 trace 文件'}
          </button>
          <span className="truncate text-[11px] text-evidence-muted">
            {drift.tracePath ?? '还没有比对过任何 trace'}
          </span>
          {drift.audit === null ? null : (
            <span
              className={[
                'ml-auto rounded px-1.5 py-0.5 text-[10px]',
                drift.audit.passed
                  ? 'bg-evidence-surface text-evidence-muted'
                  : 'bg-[#fdf3f1] text-evidence-evidence',
              ].join(' ')}
            >
              {drift.audit.passed ? '没有阻塞漂移' : '存在阻塞漂移'}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {drift.error === null ? null : (
            <p role="alert" className="mb-2 text-[11px] text-evidence-evidence">
              {drift.error}
            </p>
          )}

          {drift.audit === null ? (
            <p className="text-[11px] text-evidence-muted">
              选一份 OTLP/JSON
              导出，就能看到生产提交了哪些凭证、哪些字段和模型对不上。
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] text-evidence-muted">
                读了 {drift.audit.spanCount} 个 span，其中{' '}
                {drift.audit.commitCount} 个是业务凭证。
              </p>

              {drift.audit.errors.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {drift.audit.errors.map((message) => (
                    <li
                      key={message}
                      className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted"
                    >
                      {message}
                    </li>
                  ))}
                </ul>
              ) : null}

              {drift.audit.findings.length === 0 ? (
                <p className="text-[11px] text-evidence-muted">
                  生产提交的内容都在模型声明之内。
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {drift.audit.findings.map((finding, index) => (
                    <li
                      key={`${finding.kind}:${finding.evidenceRef ?? index}`}
                      className={[
                        'rounded border px-3 py-2',
                        finding.severity === 'block'
                          ? 'border-evidence-evidence'
                          : 'border-evidence-line',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={[
                            'rounded px-1.5 py-0.5 text-[10px]',
                            finding.severity === 'block'
                              ? 'bg-[#fdf3f1] text-evidence-evidence'
                              : 'bg-evidence-surface text-evidence-muted',
                          ].join(' ')}
                        >
                          {SEVERITY_LABELS[finding.severity] ??
                            finding.severity}
                        </span>
                        <span className="text-[11px] font-medium text-evidence-ink">
                          {DRIFT_KIND_LABELS[
                            finding.kind as keyof typeof DRIFT_KIND_LABELS
                          ] ?? finding.kind}
                        </span>
                        {finding.evidenceRef === null ? null : (
                          <span className="text-[10px] text-evidence-muted">
                            {finding.evidenceRef}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-evidence-ink">
                        {finding.message}
                      </p>
                      <p className="mt-1 text-[11px] text-evidence-muted">
                        {finding.remediation}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
