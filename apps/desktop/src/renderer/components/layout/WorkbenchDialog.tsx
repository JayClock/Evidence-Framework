import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@evidence-poc/desktop-ui-kit';

const widths = {
  settings: 'max-w-[580px]',
  ingestion: 'max-w-[620px]',
};

/** Workbench.pen form dialogs share chrome without changing other overlays. */
export const WorkbenchDialog = ({
  size,
  title,
  description,
  busy,
  onClose,
  children,
}: {
  size: keyof typeof widths;
  title: string;
  description: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) => {
  const invoker = useRef<HTMLElement | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        data-workbench-dialog=""
        className={`flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col gap-5 border-workbench-border p-6 ${widths[size]}`}
        showClose={false}
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          // The app also opens these dialogs from shortcuts and shared state,
          // so there is no Radix DialogTrigger to restore focus to.
          const active = document.activeElement;
          invoker.current = active instanceof HTMLElement ? active : null;
          const content = event.target;
          const firstField =
            content instanceof HTMLElement
              ? content.querySelector<HTMLElement>('[data-dialog-autofocus]')
              : null;
          if (firstField) {
            event.preventDefault();
            firstField.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (invoker.current?.isConnected) invoker.current.focus();
        }}
      >
        <DialogHeader className="shrink-0 gap-1 p-0">
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-base font-bold">{title}</DialogTitle>
            <DialogClose asChild>
              <Button
                aria-label="关闭"
                disabled={busy}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription className="text-xs text-workbench-muted">
            {description}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
};
