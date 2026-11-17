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
} from '@evidence-poc/desktop-ui-kit';

import { McpStatusPill } from './McpStatusPill';

interface TopHeaderProps {
  projectName: string;
  dirty: boolean;
  graph: DomainGraph;
  selection: ModelSelection;
  onSave: () => void;
  /** Opens the command hub for editor actions and navigation. */
  onOpenCommandPalette: () => void;
}

/**
 * The window's title row.
 *
 * Shows the project, selection breadcrumb and document state alongside save,
 * MCP status and the command hub. Search, history, delivery and other editor
 * actions are available through the command hub rather than separate buttons.
 */
export const TopHeader = ({
  projectName,
  dirty,
  graph,
  selection,
  onSave,
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

        <McpStatusPill />

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
