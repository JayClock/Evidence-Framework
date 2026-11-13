import { useEffect } from 'react';

interface ShortcutHandlers {
  openReview?: () => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
  focusSearch: () => void;
  /** Moves the caret into the agent composer. */
  focusAgent: () => void;
  clearSelection: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /**
   * Settles a pending agent patch.
   *
   * Escape and Mod+Enter belong to the review while one is open, because a
   * half-read patch is the most urgent thing on screen; the editor's own
   * Escape (clearing the selection) resumes once it is settled.
   */
  acceptPatch?: () => void;
  revertPatch?: () => void;
}

const isEditable = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;

  return (
    element?.tagName === 'INPUT' ||
    element?.tagName === 'TEXTAREA' ||
    element?.tagName === 'SELECT' ||
    element?.isContentEditable === true
  );
};

/**
 * Window-level shortcuts. Text fields keep their own undo stack, so the editor
 * history only intercepts the keys when the user is not typing.
 */
export const useEditorShortcuts = (handlers: ShortcutHandlers): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const typing = isEditable(event.target);
      if (event.altKey && event.code === 'KeyR' && !typing && handlers.openReview) {
        event.preventDefault(); handlers.openReview(); return;
      }

      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handlers.save();
        return;
      }

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        handlers.focusAgent();
        return;
      }

      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        handlers.focusSearch();
        return;
      }

      if (event.key === 'Escape' && handlers.revertPatch !== undefined) {
        event.preventDefault();
        handlers.revertPatch();
        return;
      }

      if (typing) {
        return;
      }

      if (mod && event.key === 'Enter' && handlers.acceptPatch !== undefined) {
        event.preventDefault();
        handlers.acceptPatch();
        return;
      }

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();

        if (event.shiftKey) {
          handlers.redo();
        } else {
          handlers.undo();
        }
        return;
      }

      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handlers.redo();
        return;
      }

      if (event.key === 'Escape') {
        handlers.clearSelection();
        return;
      }

      if (event.key === '+' || event.key === '=') {
        handlers.zoomIn();
        return;
      }

      if (event.key === '-') {
        handlers.zoomOut();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
};
