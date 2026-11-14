import { useState } from 'react';

import { DRIFT_KIND_LABELS } from '@evidence-poc/evidence-modeling-orchestrator/browser';

import { useDriftAudit, useSimulationReplay } from '../../state/useSimulation';

const STATUS_LABELS: Record<string, string> = {
  not_requested: '未发起',
  pending: '待履约',
  completed: '已完成',
  breached: '已违约',
};

const SEVERITY_LABELS: Record<string, string> = {
  block: '阻塞',
  warn: '警告',
};

export interface SimulationSandboxProps {
  rootPath: string;
  onClose: () => void;
  /** Selects the object a frame instantiates, so playback and board agree. */
  onFocusEntity?: (entityRef: string) => void;
  /** Docks the sandbox into the bottom console instead of covering the canvas. */
  embedded?: boolean;
}

/**
 * The sandbox and the radar in one panel.
 *
 * They are two questions about the same model — does it still hold, does
 * production still match it — and a modeler who just watched a step fail is the
 * person most likely to open the trace. One panel keeps that move one click.
 */
export const SimulationSandbox = ({
  rootPath,
  onClose,
  onFocusEntity,
  embedded = false,
}: SimulationSandboxProps) => {
  const [tab, setTab] = useState<'replay' | 'drift'>('replay');
  const replay = useSimulationReplay(rootPath, tab === 'replay');
  const drift = useDriftAudit(rootPath);

  const frames = replay.replay?.frames ?? [];
  const scenarios = replay.replay?.scenarios ?? [];

  return (
    <div
      role={embedded ? 'region' : 'dialog'}
      aria-modal={embedded ? undefined : 'true'}
      aria-label="场景沙盒"
      className={
        embedded
          ? 'flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white'
          : 'fixed inset-0 z-40 flex items-center justify-center bg-[#0b1a2a33] p-6'
      }
    >
      <div
        className={
          embedded
            ? 'flex min-h-0 w-full flex-1 flex-col overflow-hidden'
            : 'flex max-h-[86vh] w-[960px] max-w-full flex-col overflow-hidden rounded-xl border border-evidence-line bg-white shadow-[0_12px_48px_#00000024]'
        }
      >
        <header className="flex shrink-0 items-start justify-between border-b border-evidence-line px-5 py-3">
          <div>
            <p className="text-[10px] tracking-[0.14em] text-evidence-muted">
              SIMULATION SANDBOX
            </p>
            <h2 className="text-[14px] font-medium text-evidence-ink">
              场景沙盒与漂移雷达
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div
              role="tablist"
              aria-label="沙盒视图"
              className="flex overflow-hidden rounded border border-evidence-line"
            >
              {(
                [
                  ['replay', '场景回放'],
                  ['drift', '生产漂移'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={[
                    'px-2.5 py-1 text-[11px]',
                    tab === value
                      ? 'bg-evidence-accent text-white'
                      : 'text-evidence-muted hover:text-evidence-ink',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted hover:text-evidence-ink"
            >
              关闭
            </button>
          </div>
        </header>

        {tab === 'replay' ? (
          <div className="flex min-h-0 flex-1">
            <aside className="w-[240px] shrink-0 overflow-auto border-r border-evidence-line p-3">
              <p className="mb-2 text-[10px] tracking-[0.12em] text-evidence-muted">
                场景
              </p>
              {scenarios.length === 0 ? (
                <p className="text-[11px] text-evidence-muted">
                  还没有可回放的场景：先在 validation/scenarios 里写一个。
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {scenarios.map((scenario) => (
                    <li key={scenario.scenarioId}>
                      <button
                        type="button"
                        onClick={() => void replay.load(scenario.scenarioId)}
                        aria-pressed={replay.scenarioId === scenario.scenarioId}
                        className={[
                          'w-full rounded border px-2 py-1.5 text-left text-[11px]',
                          replay.scenarioId === scenario.scenarioId
                            ? 'border-evidence-accent bg-evidence-accent/10 text-evidence-ink'
                            : 'border-evidence-line text-evidence-muted hover:text-evidence-ink',
                        ].join(' ')}
                      >
                        <span className="block truncate">{scenario.label}</span>
                        <span className="text-[10px] text-evidence-muted">
                          {scenario.stepCount} 步 ·{' '}
                          {scenario.passed ? '通过' : '未通过'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-evidence-line px-4 py-2">
                <button
                  type="button"
                  onClick={replay.reset}
                  disabled={frames.length === 0}
                  className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted disabled:opacity-40"
                >
                  回到首帧
                </button>
                <button
                  type="button"
                  onClick={replay.stepBack}
                  disabled={replay.cursor <= 0}
                  className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted disabled:opacity-40"
                >
                  上一步
                </button>
                <button
                  type="button"
                  onClick={replay.stepForward}
                  disabled={frames.length === 0 || replay.atEnd}
                  className="rounded bg-evidence-accent px-2 py-1 text-[11px] text-white disabled:opacity-40"
                >
                  下一步
                </button>
                <span
                  data-testid="replay-progress"
                  className="text-[11px] text-evidence-muted"
                >
                  {frames.length === 0
                    ? '未选择场景'
                    : `第 ${replay.cursor + 1} / ${frames.length} 步`}
                </span>
                {replay.replay === null ? null : (
                  <span
                    className={[
                      'ml-auto rounded px-1.5 py-0.5 text-[10px]',
                      replay.replay.passed
                        ? 'bg-evidence-surface text-evidence-muted'
                        : 'bg-[#fdf3f1] text-evidence-evidence',
                    ].join(' ')}
                  >
                    {replay.replay.passed ? '回放通过' : '回放未通过'}
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                {replay.error === null ? null : (
                  <p
                    role="alert"
                    className="mb-2 text-[11px] text-evidence-evidence"
                  >
                    {replay.error}
                  </p>
                )}
                {replay.replay !== null && replay.replay.errors.length > 0 ? (
                  <ul className="mb-3 flex flex-col gap-1">
                    {replay.replay.errors.map((message) => (
                      <li
                        key={message}
                        className="rounded border border-evidence-evidence px-2 py-1 text-[11px] text-evidence-evidence"
                      >
                        {message}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {replay.frame === null ? (
                  <p className="text-[11px] text-evidence-muted">
                    选择一个场景后逐步推进，就能看到每一步发起了什么凭证。
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="rounded border border-evidence-line px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[12px] font-medium text-evidence-ink">
                          第 {replay.frame.sequence} 步 ·{' '}
                          {replay.frame.entityRef}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            onFocusEntity?.(replay.frame?.entityRef ?? '')
                          }
                          className="rounded border border-evidence-line px-1.5 py-0.5 text-[10px] text-evidence-muted hover:text-evidence-ink"
                        >
                          在画布定位
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-evidence-muted">
                        发起：{replay.frame.actingRoleRef} · 凭证：
                        {replay.frame.instanceRef}
                        {replay.frame.at === null
                          ? null
                          : ` · 业务时间 ${replay.frame.at}`}
                      </p>
                    </div>

                    <section aria-label="本步派生">
                      <p className="mb-1 text-[10px] tracking-[0.12em] text-evidence-muted">
                        派生
                      </p>
                      {replay.frame.derivations.length === 0 ? (
                        <p className="text-[11px] text-evidence-muted">
                          这一步没有算出新值。
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {replay.frame.derivations.map((derivation) => (
                            <li
                              key={`${derivation.ruleRef}:${derivation.target ?? ''}`}
                              className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-ink"
                            >
                              {derivation.target ?? derivation.ruleRef} ={' '}
                              {JSON.stringify(derivation.result)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section aria-label="履约状态">
                      <p className="mb-1 text-[10px] tracking-[0.12em] text-evidence-muted">
                        履约状态
                      </p>
                      {replay.frame.fulfillmentStates.length === 0 ? (
                        <p className="text-[11px] text-evidence-muted">
                          此刻还没有履约请求。
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {replay.frame.fulfillmentStates.map((state) => (
                            <li
                              key={state.requestInstanceRef}
                              data-testid={`fulfillment-${state.requestInstanceRef}`}
                              className="flex items-center justify-between rounded border border-evidence-line px-2 py-1 text-[11px]"
                            >
                              <span className="truncate text-evidence-ink">
                                {state.requestInstanceRef}
                              </span>
                              <span className="text-evidence-muted">
                                {STATUS_LABELS[state.status] ?? state.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section aria-label="断言">
                      <p className="mb-1 text-[10px] tracking-[0.12em] text-evidence-muted">
                        断言
                      </p>
                      {replay.frame.checkpoints.length === 0 ? (
                        <p className="text-[11px] text-evidence-muted">
                          这一步没有断言。
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {replay.frame.checkpoints.map((checkpoint) => (
                            <li
                              key={checkpoint.ruleRef}
                              className={[
                                'rounded border px-2 py-1 text-[11px]',
                                checkpoint.passed
                                  ? 'border-evidence-line text-evidence-ink'
                                  : 'border-evidence-evidence text-evidence-evidence',
                              ].join(' ')}
                            >
                              {checkpoint.ruleRef} →{' '}
                              {JSON.stringify(checkpoint.actual)}
                              {checkpoint.passed ? '' : '（未通过）'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
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
                <p
                  role="alert"
                  className="mb-2 text-[11px] text-evidence-evidence"
                >
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
        )}
      </div>
    </div>
  );
};
