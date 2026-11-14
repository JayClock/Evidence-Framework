import { Toaster as SonnerToaster, toast } from 'sonner';

export { toast } from 'sonner';

/**
 * The one notification surface.
 *
 * Export results, save failures and refresh notices used to compete for a strip
 * under the header. A toast is transient, stacks four deep and carries an
 * optional action, so an operation reports itself where the modeler is looking
 * instead of where the layout has room.
 *
 * Sonner injects its own stylesheet, so the library ships no extra CSS.
 */
export const Toaster = () => (
  <SonnerToaster
    position="bottom-right"
    offset={16}
    gap={8}
    closeButton
    duration={4000}
    className="evidence-toaster"
    toastOptions={{
      classNames: {
        toast:
          'rounded-md border border-evidence-line bg-white text-evidence-ink shadow-overlay text-[12px]',
        description: 'text-evidence-muted text-[11px]',
        actionButton:
          'rounded border border-evidence-line bg-evidence-surface px-1.5 py-0.5 text-[11px] text-evidence-ink',
        cancelButton:
          'rounded border border-evidence-line px-1.5 py-0.5 text-[11px] text-evidence-muted',
        closeButton:
          'border-evidence-line bg-white text-evidence-muted hover:text-evidence-ink',
        error: 'border-[#fecaca]',
        success: 'border-evidence-line',
      },
    }}
  />
);

export { toast as notify };
