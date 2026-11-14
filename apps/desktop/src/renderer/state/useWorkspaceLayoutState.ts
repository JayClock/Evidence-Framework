import { useCallback, useEffect, useState } from 'react';

/** The four things the activity rail can put beside the canvas. */
export const RAIL_TABS = [
  'topology',
  'diagnostics',
  'simulation',
  'copilot',
] as const;

export type RailTabId = (typeof RAIL_TABS)[number];

/** Large surfaces that cover the workspace instead of sharing its width. */
export type HubSurface = 'delivery' | 'simulation' | 'review';

export interface WorkspaceLayoutState {
  /** Open drawer; null leaves the rail as the only rail-width chrome. */
  readonly activeRailTab: RailTabId | null;
  /** A pinned drawer takes layout width; an unpinned one floats over canvas. */
  readonly isRailPinned: boolean;
  readonly isProblemsPanelOpen: boolean;
  readonly activeIssueId: string | null;
  readonly isInlineCopilotOpen: boolean;
  /** Blocking hub (delivery, simulation, review), or null. */
  readonly activeHub: HubSurface | null;
}

export interface WorkspaceLayoutActions {
  setActiveRailTab: (tab: RailTabId | null) => void;
  toggleRailTab: (tab: RailTabId) => void;
  toggleRailPinned: () => void;
  toggleProblemsPanel: () => void;
  openProblemsWithIssue: (issueId: string) => void;
  closeProblemsPanel: () => void;
  openInlineCopilot: () => void;
  closeInlineCopilot: () => void;
  openHub: (surface: HubSurface) => void;
  closeHub: () => void;
}

export type WorkspaceLayoutController = WorkspaceLayoutState &
  WorkspaceLayoutActions;

/**
 * Chords the rail answers to.
 *
 * The digits belong to the rail because it is the top-level switch — where the
 * modeler is in the studio — while the three view modes (graph, ledger, split)
 * keep `Alt+1..3` and the `V` toggle, so a chord never means two things.
 */
export const RAIL_TAB_CHORDS: Record<RailTabId, string> = {
  topology: '⌘+1',
  diagnostics: '⌘+2',
  simulation: '⌘+3',
  copilot: '⌘+4',
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
  initialRailTab: RailTabId | null = null,
): WorkspaceLayoutController => {
  const [activeRailTab, setActiveRailTab] = useState<RailTabId | null>(
    initialRailTab,
  );
  const [isRailPinned, setRailPinned] = useState(false);
  const [isProblemsPanelOpen, setProblemsPanelOpen] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [isInlineCopilotOpen, setInlineCopilotOpen] = useState(false);
  const [activeHub, setActiveHub] = useState<HubSurface | null>(null);

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
  const toggleRailTab = useCallback((tab: RailTabId) => {
    if (tab === 'diagnostics') {
      setActiveRailTab(null);
      setActiveIssueId(null);
      setProblemsPanelOpen((open) => !open);
      return;
    }

    setActiveRailTab((current) => (current === tab ? null : tab));
  }, []);

  const toggleProblemsPanel = useCallback(() => {
    setProblemsPanelOpen((current) => !current);
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

  const openHub = useCallback((surface: HubSurface) => {
    setActiveHub(surface);
  }, []);

  const closeHub = useCallback(() => {
    setActiveHub(null);
  }, []);

  // A drawer that opens on a chord must not steal a digit a text field wants.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) {
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || isEditable(event.target)) {
        return;
      }

      const tab = RAIL_TABS.find(
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
    isProblemsPanelOpen,
    activeIssueId,
    isInlineCopilotOpen,
    activeHub,
    setActiveRailTab,
    toggleRailTab,
    toggleRailPinned,
    toggleProblemsPanel,
    openProblemsWithIssue,
    closeProblemsPanel,
    openInlineCopilot,
    closeInlineCopilot,
    openHub,
    closeHub,
  };
};
