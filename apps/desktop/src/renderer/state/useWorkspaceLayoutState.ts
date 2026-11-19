import { useCallback, useEffect, useState } from 'react';

export type RightPane = 'inspector' | 'copilot';

const ACTIVITY_RAIL_TABS = [
  'ledger',
  'diagnostics',
  'copilot',
  'directory',
] as const;
export type ActivityRailTabId = (typeof ACTIVITY_RAIL_TABS)[number];

export interface WorkspaceLayoutState {
  readonly isWorkshopOpen: boolean;
  readonly rightPane: RightPane;
  /** A pinned workshop takes layout width; an unpinned one floats over canvas. */
  readonly isWorkshopPinned: boolean;
  readonly isDirectoryOpen: boolean;
  readonly isProblemsPanelOpen: boolean;
  readonly activeIssueId: string | null;
  readonly isInlineCopilotOpen: boolean;
  readonly isDeliveryOpen: boolean;
}

export interface WorkspaceLayoutActions {
  openWorkshop: () => void;
  closeWorkshop: () => void;
  toggleWorkshopPinned: () => void;
  openCopilot: () => void;
  showInspector: () => void;
  toggleRailTab: (tab: ActivityRailTabId) => void;
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
  expandRightRail: () => boolean,
  ledger?: { active: boolean; returnToGraph: () => void },
): WorkspaceLayoutController => {
  const leaveLedger = ledger?.active ? ledger.returnToGraph : undefined;
  const [isWorkshopOpen, setWorkshopOpen] = useState(false);
  const [rightPane, setRightPane] = useState<RightPane>('inspector');
  const [isWorkshopPinned, setWorkshopPinned] = useState(false);
  const [isDirectoryOpen, setDirectoryOpen] = useState(true);
  const [isProblemsPanelOpen, setProblemsPanelOpen] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [isInlineCopilotOpen, setInlineCopilotOpen] = useState(false);
  const [isDeliveryOpen, setDeliveryOpen] = useState(false);

  const openWorkshop = useCallback(() => {
    leaveLedger?.();
    setWorkshopOpen(true);
  }, [leaveLedger]);
  const closeWorkshop = useCallback(() => setWorkshopOpen(false), []);
  const toggleWorkshopPinned = useCallback(() => {
    setWorkshopPinned((current) => !current);
  }, []);

  const openCopilot = useCallback(() => {
    leaveLedger?.();
    expandRightRail();
    setRightPane('copilot');
  }, [expandRightRail, leaveLedger]);
  const showInspector = useCallback(() => setRightPane('inspector'), []);

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

      if (tab === 'diagnostics') {
        setActiveIssueId(null);
        setProblemsPanelOpen((open) => !open);
        return;
      }

      if (leaveLedger !== undefined) {
        openCopilot();
        return;
      }
      const reopened = expandRightRail();
      setRightPane((current) =>
        reopened || current === 'inspector' ? 'copilot' : 'inspector',
      );
    },
    [expandRightRail, leaveLedger, openCopilot, toggleLedger],
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
    isWorkshopOpen,
    rightPane,
    isWorkshopPinned,
    isDirectoryOpen,
    isProblemsPanelOpen,
    activeIssueId,
    isInlineCopilotOpen,
    isDeliveryOpen,
    openWorkshop,
    closeWorkshop,
    toggleWorkshopPinned,
    openCopilot,
    showInspector,
    toggleRailTab,
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
