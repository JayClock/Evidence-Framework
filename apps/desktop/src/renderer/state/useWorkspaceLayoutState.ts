import { useCallback, useEffect, useState } from 'react';

/** Drawer destinations; ledger and diagnostics have their own surfaces. */
export type RailTabId = 'copilot' | 'workshop';

const ACTIVITY_RAIL_TABS = [
  'ledger',
  'diagnostics',
  'copilot',
  'directory',
] as const;
export type ActivityRailTabId = (typeof ACTIVITY_RAIL_TABS)[number];

export interface WorkspaceLayoutState {
  /** Open drawer; null leaves the rail as the only rail-width chrome. */
  readonly activeRailTab: RailTabId | null;
  /** A pinned drawer takes layout width; an unpinned one floats over canvas. */
  readonly isRailPinned: boolean;
  readonly isDirectoryOpen: boolean;
  readonly isProblemsPanelOpen: boolean;
  readonly activeIssueId: string | null;
  readonly isInlineCopilotOpen: boolean;
  readonly isDeliveryOpen: boolean;
}

export interface WorkspaceLayoutActions {
  setActiveRailTab: (tab: RailTabId | null) => void;
  toggleRailTab: (tab: ActivityRailTabId) => void;
  toggleRailPinned: () => void;
  toggleProblemsPanel: () => void;
  openProblemsPanel: () => void;
  openProblemsWithIssue: (issueId: string) => void;
  closeProblemsPanel: () => void;
  openInlineCopilot: () => void;
  closeInlineCopilot: () => void;
  openDelivery: () => void;
  closeDelivery: () => void;
}

export type WorkspaceLayoutController = WorkspaceLayoutState &
  WorkspaceLayoutActions;

/** Chords for the sidebar controls, in rail order. */
export const RAIL_TAB_CHORDS: Record<ActivityRailTabId, string> = {
  ledger: '⌘+1',
  diagnostics: '⌘+2',
  copilot: '⌘+3',
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
): WorkspaceLayoutController => {
  const [activeRailTab, setActiveRailTab] = useState<RailTabId | null>(null);
  const [isRailPinned, setRailPinned] = useState(false);
  const [isDirectoryOpen, setDirectoryOpen] = useState(true);
  const [isProblemsPanelOpen, setProblemsPanelOpen] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [isInlineCopilotOpen, setInlineCopilotOpen] = useState(false);
  const [isDeliveryOpen, setDeliveryOpen] = useState(false);

  const toggleRailPinned = useCallback(() => {
    setRailPinned((current) => !current);
  }, []);

  /**
   * One rail button, one surface.
   *
   * Diagnostics is the exception on purpose: its list is a strip under the
   * canvas rather than a drawer beside it, because a finding is read *while*
   * looking at the object it names. The rail still owns the button, so the
   * chord and the highlight behave like every other tab.
   */
  const toggleRailTab = useCallback(
    (tab: ActivityRailTabId) => {
      if (tab === 'ledger') {
        toggleLedger();
        return;
      }

      if (tab === 'directory') {
        setDirectoryOpen((open) => !open);
        return;
      }

      if (tab === 'diagnostics') {
        setActiveIssueId(null);
        setProblemsPanelOpen((open) => !open);
        return;
      }

      setActiveRailTab((current) => (current === tab ? null : tab));
    },
    [toggleLedger],
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

  const openInlineCopilot = useCallback(() => {
    setInlineCopilotOpen(true);
  }, []);

  const closeInlineCopilot = useCallback(() => {
    setInlineCopilotOpen(false);
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
        (candidate, index) => event.key === String(index + 1),
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
    activeRailTab,
    isRailPinned,
    isDirectoryOpen,
    isProblemsPanelOpen,
    activeIssueId,
    isInlineCopilotOpen,
    isDeliveryOpen,
    setActiveRailTab,
    toggleRailTab,
    toggleRailPinned,
    toggleProblemsPanel,
    openProblemsPanel,
    openProblemsWithIssue,
    closeProblemsPanel,
    openInlineCopilot,
    closeInlineCopilot,
    openDelivery,
    closeDelivery,
  };
};
