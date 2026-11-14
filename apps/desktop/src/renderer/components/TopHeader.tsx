import { useMemo } from 'react';

import { Command as CommandIcon } from 'lucide-react';

import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import type { ModelSelection } from '@evidence-poc/evidence-model-core';
import {
  Button,
  KbdChord,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  ViewModeSegmentedControl,
  type WorkspaceViewMode,
} from '@evidence-poc/desktop-ui-kit';

import { McpStatusPill } from './McpStatusPill';

interface TopHeaderProps {
  projectName: string;
  dirty: boolean;
  workspaceViewMode: WorkspaceViewMode;
  graph: DomainGraph;
  selection: ModelSelection;
  onSave: () => void;
  onExportDiffReview?: () => void;
  onExportReview: () => void;
  exportReviewBusy: boolean;
  onWorkspaceViewModeChange: (mode: WorkspaceViewMode) => void;
  /** Opens the command hub, which now owns every action this row dropped. */
  onOpenCommandPalette: () => void;
}

/**
 * The window's title row.
 *
 * It used to be a toolbar: search, undo, redo, review, two exports, delivery,
 * sandbox and save all competed for the same strip, and each new capability made
 * the breadcrumb narrower. Those actions now live in the command hub behind one
 * chord, so the row keeps only what a modeler reads at a glance — where they
 * are, what state the document is in, and the three controls they press without
 * thinking about it.
 */
export const TopHeader = ({
  projectName,
  dirty,
  workspaceViewMode,
  graph,
  selection,
  onSave,
  onExportDiffReview,
  onExportReview,
  exportReviewBusy,
  onWorkspaceViewModeChange,
  onOpenCommandPalette,
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
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenCommandPalette}
                aria-label="打开快速命令"
                className="flex h-7 items-center gap-1.5 rounded-md border border-evidence-line bg-evidence-surface pr-1 pl-2 text-[11px] text-evidence-muted transition-colors hover:border-evidence-accent hover:text-evidence-ink"
              >
                <CommandIcon aria-hidden="true" className="size-3.5" />
                <span>快速命令</span>
                <KbdChord chord="⌘+K" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">搜索命令与业务对象</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <ViewModeSegmentedControl
          mode={workspaceViewMode}
          onChange={onWorkspaceViewModeChange}
        />

        <McpStatusPill />

        {/*
          These two keep their own buttons: they are disabled while the model is
          dirty, and a disabled control cannot raise a tooltip, so the reason has
          to live in the native `title` the pointer still reads.
        */}
        <Button
          variant="outline"
          onClick={onExportReview}
          disabled={exportReviewBusy || dirty}
          title={
            dirty
              ? '请先保存；正式审查导出只读取磁盘快照'
              : '导出单文件离线审查页（HTML）'
          }
        >
          {exportReviewBusy ? '导出中…' : '导出审查页'}
        </Button>
        {onExportDiffReview ? (
          <Button
            variant="outline"
            disabled={exportReviewBusy || dirty}
            onClick={onExportDiffReview}
            title={
              dirty
                ? '请先保存再与基线比较'
                : '选择 *.evidence.json 基线，导出差异审查页'
            }
          >
            导出差异审查
          </Button>
        ) : null}

        <Button
          variant="default"
          onClick={onSave}
          title="保存到磁盘（Cmd/Ctrl+S）"
        >
          保存
        </Button>
      </div>
    </header>
  );
};
