import {
  Activity,
  FlaskConical,
  Network,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';

import type {
  SensorIssue,
  SensorReport,
} from '@evidence-poc/evidence-modeling-orchestrator/browser';

import type { PreviewReviewInput } from '../../../shared/review';
import type { DeliveryHubController } from '../../state/useDeliveryHub';
import { DeliveryHub } from '../delivery/DeliveryHub';
import { ReviewHubModal } from '../review/ReviewHubModal';
import { DiagnosticsDrawer } from '../sensors/DiagnosticsDrawer';
import { SimulationSandbox } from '../simulation/SimulationSandbox';
import { cn } from '../ui/utils';

export type ConsoleTab = 'diagnostics' | 'simulation' | 'delivery' | 'review';

export const CONSOLE_TABS: readonly {
  id: ConsoleTab;
  label: string;
  icon: typeof Activity;
}[] = [
  { id: 'diagnostics', label: '门禁与诊断', icon: Activity },
  { id: 'simulation', label: '场景仿真', icon: FlaskConical },
  { id: 'delivery', label: '交付契约', icon: Network },
  { id: 'review', label: '模型审查', icon: ShieldCheck },
];

export interface BottomConsoleProps {
  rootPath: string;
  activeTab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
  onClose: () => void;
  /** Latest sensor verdict; the diagnostics tab owns the empty state. */
  report: SensorReport | null;
  reportStale: boolean;
  reportLoading: boolean;
  reportError: string | null;
  activeIssueIds: readonly string[];
  onFocusIssue: (issue: SensorIssue) => void;
  onRerunDiagnostics: () => void;
  delivery: DeliveryHubController;
  /** Null until the editor has a document revision to review. */
  reviewInput: PreviewReviewInput | null;
  canLocate: (issue: SensorIssue) => boolean;
  onPromptIssue: (issue: SensorIssue) => void;
  onFocusEntity: (nodeId: string) => void;
}

/**
 * The lower half of the studio.
 *
 * Diagnostics, simulation, delivery and review used to be four blocking
 * modals. A modeler reading a finding or watching a scenario step needs the
 * canvas it describes, so each of them now docks here as a tab: the model stays
 * on screen, and the panel that explains it stays open.
 */
export const BottomConsole = ({
  rootPath,
  activeTab,
  onTabChange,
  onClose,
  report,
  reportStale,
  reportLoading,
  reportError,
  activeIssueIds,
  onFocusIssue,
  onRerunDiagnostics,
  delivery,
  reviewInput,
  canLocate,
  onPromptIssue,
  onFocusEntity,
}: BottomConsoleProps) => (
  <section
    aria-label="工作台控制台"
    className="flex h-full min-h-0 flex-col border-t border-evidence-line bg-white"
  >
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-evidence-line bg-evidence-surface/70 pl-1.5">
      <div role="tablist" aria-label="控制台视图" className="flex items-center">
        {CONSOLE_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`console-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`console-panel-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-2.5 py-1 text-[11px] transition-colors',
                active
                  ? 'border-evidence-accent bg-white text-evidence-ink'
                  : 'border-transparent text-evidence-muted hover:text-evidence-ink',
              )}
            >
              <Icon size={12} aria-hidden="true" />
              {tab.label}
              {tab.id === 'diagnostics' && report !== null ? (
                <span
                  className={cn(
                    'rounded px-1 text-[10px]',
                    report.blockCount > 0
                      ? 'bg-[#fdf3f1] text-evidence-evidence'
                      : 'bg-evidence-line/60 text-evidence-muted',
                  )}
                >
                  {report.blockCount}/{report.warnCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1 pr-1.5">
        {activeTab === 'diagnostics' ? (
          <button
            type="button"
            onClick={onRerunDiagnostics}
            title="重新运行检查器"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-evidence-muted hover:bg-evidence-line/60 hover:text-evidence-ink"
          >
            <RotateCcw size={11} aria-hidden="true" />
            重新检查
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          title="收起控制台（Cmd/Ctrl+J）"
          className="rounded p-1 text-evidence-muted hover:bg-evidence-line/60 hover:text-evidence-ink"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
    </div>

    <div
      role="tabpanel"
      id={`console-panel-${activeTab}`}
      aria-labelledby={`console-tab-${activeTab}`}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {activeTab === 'diagnostics' ? (
        report === null ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-[11px] text-evidence-muted">
            {reportError !== null ? (
              <>
                <p role="alert" className="text-[#b42318]">
                  {reportError}
                </p>
                <button
                  type="button"
                  onClick={onRerunDiagnostics}
                  className="rounded border border-evidence-line px-2 py-0.5 hover:text-evidence-ink"
                >
                  重试
                </button>
              </>
            ) : (
              <p>{reportLoading ? '正在运行检查器…' : '尚未运行检查器'}</p>
            )}
          </div>
        ) : (
          <DiagnosticsDrawer
            embedded
            report={report}
            selectedIssueIds={activeIssueIds}
            stale={reportStale}
            onClose={onClose}
            onFocusIssue={onFocusIssue}
          />
        )
      ) : null}

      {activeTab === 'simulation' ? (
        <SimulationSandbox
          embedded
          rootPath={rootPath}
          onClose={onClose}
          onFocusEntity={onFocusEntity}
        />
      ) : null}

      {activeTab === 'delivery' ? (
        <DeliveryHub
          embedded
          hub={delivery}
          onClose={onClose}
          onFocusEntity={onFocusEntity}
        />
      ) : null}

      {activeTab === 'review' && reviewInput !== null ? (
        <ReviewHubModal
          embedded
          input={reviewInput}
          onClose={onClose}
          canLocate={canLocate}
          onLocate={onFocusIssue}
          onPrompt={onPromptIssue}
        />
      ) : null}
    </div>
  </section>
);
