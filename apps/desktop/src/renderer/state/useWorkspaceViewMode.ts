import { useCallback, useEffect, useState } from 'react';

import type { GraphViewMode } from '@evidence-poc/desktop-ui-kit';

export type WorkspaceViewMode = GraphViewMode | 'table' | 'story';

/** The ledger replaces the canvas without forgetting its last editing layout. */
export const useWorkspaceViewMode = () => {
  const [{ mode, lastGraphMode }, setView] = useState<{
    mode: WorkspaceViewMode;
    lastGraphMode: GraphViewMode;
  }>({ mode: 'journey', lastGraphMode: 'journey' });

  const setMode = useCallback((next: GraphViewMode | 'story') => {
    setView((current) =>
      current.mode === next
        ? current
        : {
            mode: next,
            lastGraphMode: next === 'story' ? current.lastGraphMode : next,
          },
    );
  }, []);

  const toggleLedger = useCallback(() => {
    setView((current) => ({
      ...current,
      mode: current.mode === 'table' ? current.lastGraphMode : 'table',
    }));
  }, []);

  const returnToGraph = useCallback(() => {
    setView((current) =>
      current.mode === current.lastGraphMode
        ? current
        : { ...current, mode: current.lastGraphMode },
    );
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }

      // Read the physical key: macOS produces `™` for Alt+2.
      const target =
        event.code === 'Digit1'
          ? 'journey'
          : event.code === 'Digit2'
            ? 'topology'
            : undefined;

      if (target !== undefined) {
        event.preventDefault();
        setMode(target);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setMode]);

  return {
    mode,
    graphMode: mode === 'story' ? 'journey' : lastGraphMode,
    setMode,
    toggleLedger,
    returnToGraph,
  } as const;
};
