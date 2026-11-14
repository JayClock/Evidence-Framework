import { useState } from 'react';

import type {
  DomainGraph,
  ModelSelection,
  ModelSession,
} from '@evidence-poc/evidence-model-core/browser';

import type { AgentSessionController } from '../state/useAgentSession';
import { AgentPanel } from './agent/AgentPanel';
import { RightInspector } from './RightInspector';
import { cn } from './ui/utils';

export type WorkbenchTab = 'inspect' | 'agent';

const TABS: readonly { id: WorkbenchTab; label: string }[] = [
  { id: 'inspect', label: '属性' },
  { id: 'agent', label: '协同' },
];

interface RightWorkbenchProps {
  graph: DomainGraph;
  session: ModelSession;
  selection: ModelSelection;
  agent: AgentSessionController;
}

/**
 * The right rail.
 *
 * Inspection and the agent history answer the same question — what is this
 * object, and what did the last round change about it — so they share one rail
 * instead of taking a column each. The canvas keeps the width either way.
 */
export const RightWorkbench = ({
  graph,
  session,
  selection,
  agent,
}: RightWorkbenchProps) => {
  const [tab, setTab] = useState<WorkbenchTab>('inspect');

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
            onClick={() => setTab(candidate.id)}
            className={cn(
              'rounded px-2 py-0.5 text-[11px] transition-colors',
              tab === candidate.id
                ? 'bg-evidence-accent text-white'
                : 'text-evidence-muted hover:text-evidence-ink',
            )}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'inspect' ? (
          <RightInspector graph={graph} session={session} selection={selection} />
        ) : (
          <AgentPanel controller={agent} />
        )}
      </div>
    </div>
  );
};
