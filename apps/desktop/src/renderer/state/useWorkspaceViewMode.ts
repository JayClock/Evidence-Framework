import { useCallback, useEffect, useState } from 'react';

import type { WorkspaceViewMode } from '@evidence-poc/desktop-ui-kit';

export type { WorkspaceViewMode } from '@evidence-poc/desktop-ui-kit';
export { WORKSPACE_VIEW_MODES } from '@evidence-poc/desktop-ui-kit';

export interface WorkspaceViewModeController {
  mode: WorkspaceViewMode;
  setMode: (mode: WorkspaceViewMode) => void;
  /** Flips between the two single-surface modes; the split keeps its own key. */
  toggleViewMode: () => void;
}

/**
 * A text field keeps `v` for itself, and CodeMirror is a contenteditable the
 * same way an input is.
 */
const isEditable = (target: EventTarget | null): boolean => {
  if (target === null || typeof (target as Element).closest !== 'function') {
    return false;
  }

  const element = target as HTMLElement;

  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable === true ||
    element.closest('.cm-editor') !== null
  );
};

/**
 * Owns which surface the centre stage shows.
 *
 * The mode is view state, not document state: it never enters the model, the
 * undo history or a saved file, so flipping to the ledger and back costs the
 * modeler nothing. `V` flips, `Alt+1/2/3` names a mode outright; a modifier key
 * combination is allowed while typing, a bare letter is not.
 *
 * The digits are read from `event.code` because macOS turns `Alt+2` into `™`:
 * the letter a layout produces is not what the chord means.
 */
export const useWorkspaceViewMode = (
  initialMode: WorkspaceViewMode = 'graph',
): WorkspaceViewModeController => {
  const [mode, setMode] = useState<WorkspaceViewMode>(initialMode);

  const toggleViewMode = useCallback(() => {
    setMode((current) => (current === 'graph' ? 'table' : 'graph'));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A surface that already consumed the key owns it: the ledger sheet and
      // the copilot composer both sit above the workspace.
      if (event.defaultPrevented) {
        return;
      }

      // `Mod+1..4` belongs to the activity rail, so the view modes sit one
      // modifier further out and never fight it for a digit.
      if (event.altKey) {
        const target =
          event.code === 'Digit1'
            ? 'graph'
            : event.code === 'Digit2'
              ? 'table'
              : event.code === 'Digit3'
                ? 'split'
                : undefined;

        if (target !== undefined) {
          event.preventDefault();
          setMode(target);
        }

        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }

      if (isEditable(event.target)) {
        return;
      }

      if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        toggleViewMode();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleViewMode]);

  return { mode, setMode, toggleViewMode };
};
