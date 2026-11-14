import type { AgentSessionController } from '../../state/useAgentSession';

interface AgentPanelProps {
  controller: AgentSessionController;
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
 * The activity stream beside the canvas.
 *
 * It is the tool-call history, which is also the honest record of what the agent
 * actually did — no separate interview log has to be kept for the modeler to see
 * where the conversation went.
 */
export const AgentPanel = ({ controller }: AgentPanelProps) => {
  const { state } = controller;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-white/70">
      <div className="flex items-center justify-between border-b border-evidence-line px-3 py-2">
        <span className="text-[10px] tracking-wide text-evidence-muted uppercase">
          AI 访谈与操控
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
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
      </div>
    </aside>
  );
};
