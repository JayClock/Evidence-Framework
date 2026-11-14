import { useEffect } from 'react';

interface ShortcutHandlers {
  openReview?: () => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
  focusSearch: () => void;
  /**
   * Opens the command palette (Mod+K).
   *
   * The palette is the single owner of everything else: the copilot composer,
   * the exports and the sandbox are rows in it, so one chord reaches all of them
   * and the header does not need a button per feature.
   */
  openCommandPalette?: () => void;
  /** Writes the offline review page, the same action as the palette row. */
  exportReview?: () => void;
  /** Re-runs the AST gate and the sensors. */
  rerunSensors?: () => void;
  openDelivery?: () => void;
  /** Opens the sandbox hub (Alt+Shift+S); Alt+S now flips the split. */
  openSandbox?: () => void;
  clearSelection: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Resets the canvas to 1:1 (Mod+0). */
  resetZoom?: () => void;
  /** Fits the model into the stage (Shift+1). */
  fitCanvas?: () => void;
  /** Frames the selected object (Shift+2). */
  zoomToSelection?: () => void;
  /** Opens the split stage on the ledger (Alt+3). */
  openLedgerSplit?: () => void;
  /** Opens the split stage on the contract (Alt+4). */
  openContractSplit?: () => void;
  /** Flips the split between side-by-side and stacked (Alt+S). */
  rotateSplit?: () => void;
  /** Leaves the split stage (Alt+2 is the ledger, Alt+1 the graph). */
  closeSplit?: () => void;
  /** Collapses the left outline rail (Mod+B). */
  toggleLeftRail?: () => void;
  /** Collapses the inspector rail (Mod+I / Mod+\). */
  toggleRightRail?: () => void;
  /** Slides the problems panel in or out (Alt+X). */
  toggleProblems?: () => void;
  /** Opens the agent on the current selection (Mod+J). */
  openInlineCopilot?: () => void;
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
      // A surface that already consumed the key owns it: Escape in the ledger
      // studio closes the studio, and must not also clear the selection the
      // inspector behind it is showing.
      if (event.defaultPrevented) {
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      const typing = isEditable(event.target);
      if (
        event.altKey &&
        event.code === 'KeyR' &&
        !typing &&
        handlers.openReview
      ) {
        event.preventDefault();
        handlers.openReview();
        return;
      }

      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handlers.save();
        return;
      }

      // The palette is the way in: it is the only chord the header advertises,
      // and every other surface (copilot, exports, sandbox) is a row inside it.
      if (
        mod &&
        event.key.toLowerCase() === 'k' &&
        handlers.openCommandPalette
      ) {
        event.preventDefault();
        handlers.openCommandPalette();
        return;
      }

      if (event.altKey && event.shiftKey && !typing && event.code === 'KeyS') {
        event.preventDefault();
        handlers.openSandbox?.();
        return;
      }

      if (mod && event.shiftKey) {
        const shifted = event.key.toLowerCase();
        const shiftedAction =
          shifted === 'e'
            ? handlers.exportReview
            : shifted === 'r'
              ? handlers.rerunSensors
              : undefined;

        if (shiftedAction !== undefined) {
          event.preventDefault();
          shiftedAction();
          return;
        }
      }

      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        handlers.focusSearch();
        return;
      }

      // Alt chords stay off a text field: a modeler typing a CEL expression
      // wants the character, not the panel behind it.
      if (event.altKey && !typing) {
        const altAction =
          event.code === 'KeyD'
            ? handlers.openDelivery
            : event.code === 'KeyX'
              ? handlers.toggleProblems
              : event.code === 'KeyS'
                ? handlers.rotateSplit
                : event.code === 'Digit3'
                  ? handlers.openLedgerSplit
                  : event.code === 'Digit4'
                    ? handlers.openContractSplit
                    : undefined;

        if (altAction !== undefined) {
          event.preventDefault();
          altAction();
          return;
        }
      }

      // The agent comes to the selection rather than asking the modeler to
      // leave the canvas, so Mod+J opens the inline composer.
      if (
        mod &&
        !event.shiftKey &&
        !typing &&
        event.key.toLowerCase() === 'j' &&
        handlers.openInlineCopilot !== undefined
      ) {
        event.preventDefault();
        handlers.openInlineCopilot();
        return;
      }

      // Layout keys belong to the workspace, but a text field may want them for
      // its own formatting, so they only fire outside an input.
      if (mod && !typing) {
        const layoutKey = event.key.toLowerCase();
        // `Mod+\` is the chord the inspector's own fold prints.
        const toggle =
          layoutKey === 'b'
            ? handlers.toggleLeftRail
            : layoutKey === 'i' || event.key === '\\'
              ? handlers.toggleRightRail
              : undefined;

        if (toggle !== undefined) {
          event.preventDefault();
          toggle();
          return;
        }
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

      // The HUD advertises these two, so the keys have to exist: Mod+0 is the
      // 100% button and Shift+1 is the fit button.
      if (mod && event.key === '0' && handlers.resetZoom !== undefined) {
        event.preventDefault();
        handlers.resetZoom();
        return;
      }

      if (event.shiftKey && event.code === 'Digit1' && handlers.fitCanvas) {
        event.preventDefault();
        handlers.fitCanvas();
        return;
      }

      if (
        event.shiftKey &&
        event.code === 'Digit2' &&
        handlers.zoomToSelection
      ) {
        event.preventDefault();
        handlers.zoomToSelection();
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
