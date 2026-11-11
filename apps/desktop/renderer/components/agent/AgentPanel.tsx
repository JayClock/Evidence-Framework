import type { DependencyFrontier } from '@evidence-poc/evidence-modeling-orchestrator';

import type { AgentSessionController } from '../../state/useAgentSession';

interface AgentPanelProps {
  controller: AgentSessionController;
  frontier: DependencyFrontier | null;
  frontierLoading: boolean;
  frontierError: string | null;
  onRefreshFrontier: () => void;
  onFocusNode: (nodeId: string) => void;
}

const statusGlyph = (status: 'running' | 'completed' | 'failed'): string =>
  status === 'running' ? '●' : status === 'failed' ? '✕' : '✓';

const statusClass = (status: 'running' | 'completed' | 'failed'): string =>
  status === 'running'
    ? 'text-evidence-accent'
    : status === 'failed'
      ? 'text-[#b42318]'
      : 'text-evidence-participant';

/**
 * Frontier plus activity stream.
 *
 * The frontier is what the trace already says — open questions, dangling
 * references, whether the round was closed — so the modeler can see why the
 * agent asks what it asks. The activity stream is the tool-call history, which
 * is also the honest record of what the agent actually did.
 */
export const AgentPanel = ({
  controller,
  frontier,
  frontierLoading,
  frontierError,
  onRefreshFrontier,
  onFocusNode,
}: AgentPanelProps) => {
  const { state } = controller;

  return (
    <aside className="flex h-full min-h-0 w-[268px] shrink-0 flex-col border-r border-evidence-line bg-white/70">
      <div className="flex items-center justify-between border-b border-evidence-line px-3 py-2">
        <span className="text-[10px] tracking-wide text-evidence-muted uppercase">
          AI 访谈与操控
        </span>
        <button
          type="button"
          onClick={onRefreshFrontier}
          className="rounded border border-evidence-line px-1.5 py-0.5 text-[10px] text-evidence-muted hover:bg-[#f1f3f6]"
        >
          刷新前沿
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {frontierLoading ? (
          <p className="text-[11px] text-evidence-muted">正在读取追溯日志…</p>
        ) : frontierError !== null ? (
          <p className="text-[11px] text-[#b42318]">{frontierError}</p>
        ) : frontier === null ? (
          <p className="text-[11px] text-evidence-muted">
            尚无访谈记录。在下方输入经营事实开始第一轮。
          </p>
        ) : (
          <section aria-label="依赖前沿" className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] tracking-wide text-evidence-muted uppercase">
                依赖前沿
              </span>
              {frontier.closed ? (
                <span className="rounded bg-evidence-participant/10 px-1.5 py-0.5 text-[10px] text-evidence-participant">
                  已记录结束确认
                </span>
              ) : null}
            </div>

            <p className="mb-1 text-[11px] font-medium text-evidence-ink">
              {frontier.judgment}
            </p>
            <p className="mb-2 text-[11px] leading-relaxed whitespace-pre-wrap text-[#4b5563]">
              {frontier.story}
            </p>

            {frontier.keyData.length > 0 ? (
              <p className="mb-2 text-[10px] text-evidence-muted">
                关键数据：
                <span className="text-[#414751]">
                  {frontier.keyData.join('、')}
                </span>
              </p>
            ) : null}

            {frontier.openQuestions.length > 0 ? (
              <ol className="mb-2 list-decimal space-y-1 pr-1 pl-4 text-[11px] text-[#414751]">
                {frontier.openQuestions.map((question) => (
                  <li key={question.questionId}>{question.question}</li>
                ))}
              </ol>
            ) : (
              <p className="mb-2 text-[11px] text-evidence-muted">
                本轮问题已全部绑定到模型属性。
              </p>
            )}

            {frontier.gaps.length > 0 ? (
              <ul className="space-y-1">
                {frontier.gaps.map((gap) => (
                  <li key={gap.message} className="text-[10px] text-[#b42318]">
                    {gap.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        )}

        <section aria-label="工具调用记录">
          <span className="text-[10px] tracking-wide text-evidence-muted uppercase">
            工具调用
          </span>
          {state.activities.length === 0 ? (
            <p className="mt-1 text-[11px] text-evidence-muted">
              还没有工具调用。
            </p>
          ) : (
            <ul className="mt-1 space-y-1">
              {state.activities.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-start gap-1.5 text-[11px]"
                  data-activity-tool={activity.toolName}
                >
                  <span className={statusClass(activity.status)}>
                    {statusGlyph(activity.status)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[#414751]">
                    {activity.toolName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {state.transcript !== '' ? (
          <section aria-label="AI 回复" className="mt-3">
            <span className="text-[10px] tracking-wide text-evidence-muted uppercase">
              AI 回复
            </span>
            <pre className="mt-1 max-h-56 overflow-y-auto text-[11px] leading-relaxed whitespace-pre-wrap text-[#414751]">
              {state.transcript}
            </pre>
          </section>
        ) : null}

        {state.error !== null ? (
          <div className="mt-3 rounded border border-[#b42318]/30 bg-[#b42318]/5 px-2 py-1.5">
            <p className="text-[11px] text-[#b42318]">{state.error}</p>
            <button
              type="button"
              onClick={controller.dismissError}
              className="mt-1 text-[10px] text-[#b42318] underline decoration-dotted"
            >
              知道了
            </button>
          </div>
        ) : null}

        {frontier !== null ? (
          <button
            type="button"
            onClick={() => {
              if (frontier.evidenceRef !== null) {
                onFocusNode(frontier.evidenceRef);
              }
            }}
            className="mt-3 rounded border border-evidence-line px-2 py-1 text-[10px] text-evidence-muted hover:bg-[#f1f3f6]"
          >
            定位本轮聚焦凭证
          </button>
        ) : null}
      </div>
    </aside>
  );
};
