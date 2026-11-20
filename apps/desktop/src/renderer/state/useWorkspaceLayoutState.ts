import { useCallback, useEffect, useState } from 'react';

const ACTIVITY_RAIL_TABS = ['ledger', 'diagnostics', 'directory'] as const;
export type ActivityRailTabId = (typeof ACTIVITY_RAIL_TABS)[number];

export interface WorkspaceLayoutState {
  readonly isDirectoryOpen: boolean;
  readonly isProblemsPanelOpen: boolean;
  readonly activeIssueId: string | null;
  readonly isDeliveryOpen: boolean;
}

export interface WorkspaceLayoutActions {
  toggleRailTab: (tab: ActivityRailTabId) => void;
  toggleProblemsPanel: () => void;
  openProblemsPanel: () => void;
  openProblemsWithIssue: (issueId: string) => void;
  closeProblemsPanel: () => void;
  openDelivery: () => void;
  closeDelivery: () => void;
}

export type WorkspaceLayoutController = WorkspaceLayoutState &
  WorkspaceLayoutActions;

/** Chords for the sidebar controls, in rail order. */
export const RAIL_TAB_CHORDS: Record<ActivityRailTabId, string> = {
  ledger: '⌘+1',
  diagnostics: '⌘+2',
  directory: '⌘+4',
};

const isEditable = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;

  if (element === null || typeof element.closest !== 'function') {
    return false;
  }

  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable === true ||
    element.closest('.cm-editor') !== null
  );
};

/**
 * One owner for the workspace's chrome.
 *
 * Every drawer, sheet and overlay used to be its own `useState` inside
 * `EditorScreen`, so opening one panel re-rendered the whole studio and any
 * cross-panel move (open a finding, then its problems list) needed side effects
 * in two components. The state lives here instead: a single object describes
 * what is on screen, and the screen becomes a projection of it.
 */
export const useWorkspaceLayoutState = (
  toggleLedger: () => void,
  ledger?: { active: boolean; returnToGraph: () => void },
): WorkspaceLayoutController => {
  const leaveLedger = ledger?.active ? ledger.returnToGraph : undefined;
  const [isDirectoryOpen, setDirectoryOpen] = useState(true);
  const [isProblemsPanelOpen, setProblemsPanelOpen] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [isDeliveryOpen, setDeliveryOpen] = useState(false);

  /** Route clicks and shortcuts to the same workspace surfaces. */
  const toggleRailTab = useCallback(
    (tab: ActivityRailTabId) => {
      if (tab === 'ledger') {
        toggleLedger();
        return;
      }

      if (tab === 'directory') {
        if (leaveLedger !== undefined) {
          leaveLedger();
          setDirectoryOpen(true);
        } else {
          setDirectoryOpen((open) => !open);
        }
        return;
      }

      setActiveIssueId(null);
      setProblemsPanelOpen((open) => !open);
    },
    [leaveLedger, toggleLedger],
  );

  const toggleProblemsPanel = useCallback(() => {
    setProblemsPanelOpen((current) => !current);
  }, []);

  const openProblemsPanel = useCallback(() => {
    setProblemsPanelOpen(true);
  }, []);

  const openProblemsWithIssue = useCallback((issueId: string) => {
    setProblemsPanelOpen(true);
    setActiveIssueId(issueId);
  }, []);

  const closeProblemsPanel = useCallback(() => {
    setProblemsPanelOpen(false);
    setActiveIssueId(null);
  }, []);

  const openDelivery = useCallback(() => {
    setDeliveryOpen(true);
  }, []);

  const closeDelivery = useCallback(() => {
    setDeliveryOpen(false);
  }, []);

  // Sidebar shortcuts must not steal a digit a text field wants.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) {
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || isEditable(event.target)) {
        return;
      }

      const tab = ACTIVITY_RAIL_TABS.find(
        (candidate) => RAIL_TAB_CHORDS[candidate] === `⌘+${event.key}`,
      );

      if (tab === undefined) {
        return;
      }

      event.preventDefault();
      toggleRailTab(tab);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleRailTab]);

  return {
    isDirectoryOpen,
    isProblemsPanelOpen,
    activeIssueId,
    isDeliveryOpen,
    toggleRailTab,
    toggleProblemsPanel,
    openProblemsPanel,
    openProblemsWithIssue,
    closeProblemsPanel,
    openDelivery,
    closeDelivery,
  };
};
