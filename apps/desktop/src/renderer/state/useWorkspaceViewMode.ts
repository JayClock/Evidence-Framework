import { useCallback, useEffect, useState } from 'react';

/** The three ways one model can occupy the centre of the studio. */
export type WorkspaceViewMode = 'graph' | 'table' | 'split';

export const WORKSPACE_VIEW_MODES: readonly WorkspaceViewMode[] = [
  'graph',
  'table',
  'split',
];

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
 * modeler nothing. `V` flips, `Mod+1/2/3` names a mode outright; a modifier key
 * combination is allowed while typing, a bare letter is not.
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
      // A surface that already consumed the key owns it: the ledger studio and
      // the copilot composer both sit above the workspace.
      if (event.defaultPrevented || event.altKey) {
        return;
      }

      const mod = event.metaKey || event.ctrlKey;

      if (mod) {
        if (event.shiftKey) {
          return;
        }

        const target =
          event.key === '1'
            ? 'graph'
            : event.key === '2'
              ? 'table'
              : event.key === '3'
                ? 'split'
                : undefined;

        if (target !== undefined) {
          event.preventDefault();
          setMode(target);
        }

        return;
      }

      if (event.shiftKey || isEditable(event.target)) {
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
