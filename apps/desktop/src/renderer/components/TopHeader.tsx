import { useMemo } from 'react';

import type { DomainGraph } from '@evidence-poc/evidence-model-core/browser';
import type { ModelSelection } from '@evidence-poc/evidence-model-core/browser';

import { McpStatusPill } from './McpStatusPill';
import { ViewModeSegmentedControl } from './ViewModeSegmentedControl';
import type { WorkspaceViewMode } from '../state/useWorkspaceViewMode';

interface TopHeaderProps {
  projectName: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  workspaceViewMode: WorkspaceViewMode;
  graph: DomainGraph;
  selection: ModelSelection;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  /** Writes the offline review page; reports progress so the button can wait. */
  onPreviewReview?: () => void;
  onExportDiffReview?: () => void;
  onExportReview: () => void;
  exportReviewBusy: boolean;
  /** Opens the delivery hub: what the model becomes when it is deployed. */
  onOpenDelivery: () => void;
  /** Opens the sandbox: does the model still hold, does production match it. */
  onOpenSandbox: () => void;
  onWorkspaceViewModeChange: (mode: WorkspaceViewMode) => void;
  onSearch: () => void;
}

export const TopHeader = ({
  projectName,
  dirty,
  canUndo,
  canRedo,
  workspaceViewMode,
  graph,
  selection,
  onUndo,
  onRedo,
  onSave,
  onPreviewReview,
  onExportDiffReview,
  onExportReview,
  exportReviewBusy,
  onOpenDelivery,
  onOpenSandbox,
  onWorkspaceViewModeChange,
  onSearch,
}: TopHeaderProps) => {
  const breadcrumb = useMemo(() => {
    const nodeId = selection.nodeId;

    if (nodeId === null) {
      return null;
    }

    const entity = graph.getEntity(nodeId);

    if (entity === undefined) {
      return null;
    }

    const contextRef = 'contextRef' in entity ? entity.contextRef : undefined;
    const path = contextRef === undefined ? [] : graph.contextPath(contextRef);

    return {
      trail: path.map((context) => context.label),
      name: entity.label,
    };
  }, [graph, selection.nodeId]);

  return (
    <header className="evidence-drag-region col-span-2 flex h-12 shrink-0 items-center justify-between border-b border-evidence-line bg-white/85 pr-4 pl-[var(--evidence-traffic-light-space)]">
      <div className="evidence-no-drag flex min-w-0 items-center gap-2 text-[12px]">
        <span className="shrink-0 font-medium text-evidence-ink">
          {projectName}
          {dirty ? (
            <span className="ml-1 text-evidence-evidence" title="有未保存修改">
              *
            </span>
          ) : null}
        </span>
        {breadcrumb !== null ? (
          <span className="flex min-w-0 items-center gap-1 truncate text-evidence-muted">
            {breadcrumb.trail.map((label, index) => (
              <span key={`${label}-${index}`} className="truncate">
                {label} /
              </span>
            ))}
            <span className="truncate text-evidence-ink">
              {breadcrumb.name}
            </span>
          </span>
        ) : null}
      </div>

      <div className="evidence-no-drag flex items-center gap-1.5">
        <button
          type="button"
          onClick={onSearch}
          className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted hover:border-evidence-accent hover:text-evidence-ink"
          title="全局搜索（Cmd/Ctrl+K）"
        >
          搜索
        </button>

        <ViewModeSegmentedControl
          mode={workspaceViewMode}
          onChange={onWorkspaceViewModeChange}
        />

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted disabled:opacity-40"
          title="撤销（Cmd/Ctrl+Z）"
        >
          撤销
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted disabled:opacity-40"
          title="重做（Cmd/Ctrl+Shift+Z）"
        >
          重做
        </button>
        <McpStatusPill />

        {onPreviewReview ? (
          <button
            type="button"
            onClick={onPreviewReview}
            title="在底部控制台打开审查中心（Alt+R）"
            className="rounded border border-evidence-line px-2 py-1 text-[11px]"
          >
            审查中心
          </button>
        ) : null}
        <button
          type="button"
          onClick={onExportReview}
          disabled={exportReviewBusy || dirty}
          className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted hover:border-evidence-accent hover:text-evidence-ink disabled:opacity-40"
          title={
            dirty
              ? '请先保存；正式审查导出只读取磁盘快照'
              : '导出单文件离线审查页（HTML）'
          }
        >
          {exportReviewBusy ? '导出中…' : '导出审查页'}
        </button>
        {onExportDiffReview ? (
          <button
            type="button"
            disabled={exportReviewBusy || dirty}
            onClick={onExportDiffReview}
            title={
              dirty
                ? '请先保存再与基线比较'
                : '选择 *.evidence.json 基线，导出差异审查页'
            }
            className="rounded border border-evidence-line px-2 py-1 text-[11px] disabled:opacity-40"
          >
            导出差异审查
          </button>
        ) : null}

        <button
          type="button"
          onClick={onOpenDelivery}
          className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted hover:border-evidence-accent hover:text-evidence-ink"
          title="在底部控制台查看服务边界，并导出契约、拓扑与部署草图"
        >
          交付
        </button>

        <button
          type="button"
          onClick={onOpenSandbox}
          className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted hover:border-evidence-accent hover:text-evidence-ink"
          title="在底部控制台逐步回放业务场景，并把导出的 trace 与模型比对"
        >
          沙盒
        </button>

        <button
          type="button"
          onClick={onSave}
          className="rounded bg-evidence-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#274c76]"
          title="保存到磁盘（Cmd/Ctrl+S）"
        >
          保存
        </button>
      </div>
    </header>
  );
};
