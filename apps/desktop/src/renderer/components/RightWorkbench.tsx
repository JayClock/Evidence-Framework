import { useEffect, useRef, useState } from 'react';

import type {
  DomainGraph,
  ModelSelection,
  ModelSession,
} from '@evidence-poc/evidence-model-core/browser';

import type { AgentSessionController } from '../state/useAgentSession';
import type { PatchReviewController } from '../state/usePatchReview';
import { AgentCopilot, type PromptFocus } from './agent/AgentCopilot';
import { RightInspector } from '@evidence-poc/desktop-feature-inspector';
import { cn } from '@evidence-poc/desktop-ui-kit';

export type WorkbenchTab = 'inspect' | 'agent';

const TABS: readonly { id: WorkbenchTab; label: string }[] = [
  { id: 'inspect', label: '属性' },
  { id: 'agent', label: '协同' },
];

export interface RightWorkbenchProps {
  graph: DomainGraph;
  session: ModelSession;
  selection: ModelSelection;
  agent: AgentSessionController;
  /** Pending agent patch, flagged on the tab and reviewed in the copilot. */
  patchReview?: PatchReviewController | null;
  focus?: PromptFocus | null;
  onClearFocus?: () => void;
  onFocusEntity?: (entityId: string) => void;
  focusToken?: number;
  prefill?: { token: number; text: string } | null;
  onPrefillConsumed?: () => void;
}

/**
 * The right rail.
 *
 * Inspection and the agent answer the same question — what is this object, and
 * what did the last round change about it — so they share one rail instead of
 * taking a column each. The canvas keeps the width either way.
 *
 * A pending patch marks the agent tab rather than stealing it: an agent driven
 * from an MCP client must not yank the modeler out of an inspector mid-edit.
 */
export const RightWorkbench = ({
  graph,
  session,
  selection,
  agent,
  patchReview = null,
  focus = null,
  onClearFocus,
  onFocusEntity,
  focusToken,
  prefill = null,
  onPrefillConsumed,
}: RightWorkbenchProps) => {
  const [tab, setTab] = useState<WorkbenchTab>('inspect');

  // ⌘K and a finding both ask the copilot for the caret, so the rail opens
  // before the composer can receive it.
  const previousFocusToken = useRef<number | undefined>(focusToken);
  useEffect(() => {
    if (focusToken === undefined) return;
    if (focusToken === previousFocusToken.current) return;

    previousFocusToken.current = focusToken;
    setTab('agent');
  }, [focusToken]);

  const previousPrefill = useRef<number | null>(prefill?.token ?? null);
  useEffect(() => {
    if (prefill === null) return;
    if (prefill.token === previousPrefill.current) return;

    previousPrefill.current = prefill.token;
    setTab('agent');
  }, [prefill]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white/70">
      <div
        role="tablist"
        aria-label="右侧工作栏视图"
        className="flex h-8 shrink-0 items-center gap-1 border-b border-evidence-line px-1.5"
      >
        {TABS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={tab === candidate.id}
            onClick={() => {
              setTab(candidate.id);
            }}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors',
              tab === candidate.id
                ? 'bg-evidence-accent text-white'
                : 'text-evidence-muted hover:text-evidence-ink',
            )}
          >
            {candidate.label}
            {candidate.id === 'agent' && patchReview?.review != null ? (
              <span
                aria-label="有待审查的 AI 补丁"
                className="inline-block h-1.5 w-1.5 rounded-full bg-evidence-evidence"
              />
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'inspect' ? (
          <RightInspector
            graph={graph}
            session={session}
            selection={selection}
          />
        ) : (
          <AgentCopilot
            controller={agent}
            patchReview={patchReview}
            focus={focus}
            onClearFocus={onClearFocus}
            onFocusEntity={onFocusEntity}
            focusToken={focusToken}
            prefill={prefill}
            onPrefillConsumed={onPrefillConsumed}
          />
        )}
      </div>
    </div>
  );
};
