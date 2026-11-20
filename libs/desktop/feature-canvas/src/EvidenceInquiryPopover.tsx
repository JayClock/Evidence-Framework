import { useId, useRef, type ReactNode } from 'react';
import {
  Button,
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
} from '@evidence-poc/desktop-ui-kit';

export type EvidenceInquiryKind = 'trace' | 'what-if';

export interface CanvasEvidenceInquiry {
  target: { nodeId: string; kind: EvidenceInquiryKind } | null;
  pairedNodeIds: ReadonlySet<string>;
  busy: boolean;
  onOpen: (nodeId: string, kind: EvidenceInquiryKind) => void;
  onClose: (nodeId: string) => void;
  onAcceptPatch?: () => void;
  onRevertPatch?: () => void;
  content: ReactNode;
}

export const EvidenceInquiryPopover = ({
  nodeId,
  label,
  width,
  height,
  inquiry,
  children,
}: {
  nodeId: string;
  label: string;
  width: number;
  height: number;
  inquiry: CanvasEvidenceInquiry;
  children: ReactNode;
}) => {
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const active = inquiry.target?.nodeId === nodeId ? inquiry.target.kind : null;
  const action = (kind: EvidenceInquiryKind, title: string) => (
    <Button
      type="button"
      size="xs"
      variant="outline"
      aria-label={`${title}：${label}`}
      aria-haspopup="dialog"
      aria-expanded={active === kind}
      aria-controls={active === kind ? panelId : undefined}
      disabled={inquiry.busy && active !== kind}
      onClick={(event) => {
        event.stopPropagation();
        trigger.current = event.currentTarget;
        if (active === kind) inquiry.onClose(nodeId);
        else inquiry.onOpen(nodeId, kind);
      }}
    >
      {title}
    </Button>
  );
  return (
    <Popover
      open={active !== null}
      onOpenChange={(open) => !open && inquiry.onClose(nodeId)}
    >
      <PopoverAnchor asChild>
        <div className="relative" style={{ width, height }}>
          {children}
          <div
            data-canvas-control=""
            data-evidence-capture-hide=""
            className="nodrag nopan absolute right-2 bottom-1 flex gap-1"
          >
            {action('trace', '溯源')}
            {inquiry.pairedNodeIds.has(nodeId)
              ? action('what-if', 'What-If')
              : null}
          </div>
        </div>
      </PopoverAnchor>
      {active !== null ? (
        <PopoverContent
          id={panelId}
          aria-label={`${active === 'trace' ? '关键数据溯源' : 'What-If 异常履约'}：${label}`}
          side="right"
          sideOffset={12}
          collisionPadding={12}
          updatePositionStrategy="always"
          data-workbench-chrome=""
          data-evidence-inquiry=""
          data-evidence-capture-hide=""
          className="nodrag nopan nowheel flex h-[min(28rem,var(--radix-popover-content-available-height))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0"
          onOpenAutoFocus={(event) => {
            const field = document
              .getElementById(panelId)
              ?.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)');
            if (field !== undefined && field !== null) {
              event.preventDefault();
              field.focus({ preventScroll: true });
            }
          }}
          onEscapeKeyDown={(event) => {
            if (!inquiry.onRevertPatch || event.isComposing) return;
            event.preventDefault();
            inquiry.onRevertPatch();
          }}
          onKeyDown={(event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.altKey ||
              event.nativeEvent.isComposing ||
              event.keyCode === 229 ||
              !inquiry.onAcceptPatch
            )
              return;
            // Keep normal Enter behavior on buttons (close, revert, locate).
            if (
              !(
                event.metaKey ||
                event.ctrlKey ||
                event.target instanceof HTMLTextAreaElement
              )
            )
              return;
            event.preventDefault();
            inquiry.onAcceptPatch();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (document.activeElement === document.body)
              trigger.current?.focus();
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-workbench-border px-3 py-1.5">
            <span className="truncate text-xs font-semibold">
              {active === 'trace' ? '关键数据溯源' : 'What-If 异常履约'} ·{' '}
              {label}
            </span>
            <PopoverClose asChild>
              <Button type="button" variant="ghost" size="xs">
                关闭
              </Button>
            </PopoverClose>
          </div>
          <div className="min-h-0 flex-1">{inquiry.content}</div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
};
