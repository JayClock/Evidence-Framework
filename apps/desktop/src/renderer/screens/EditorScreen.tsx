import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ImperativePanelHandle } from 'react-resizable-panels';

import { computeContextScope } from '@evidence-poc/evidence-canvas-interaction';
import type {
  SensorIssue,
  SensorReport,
} from '@evidence-poc/evidence-agent/browser';
import {
  ENTITY_CATEGORY_LABELS,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

import type { EvidenceProjectSummary } from '../../shared/projects';
import { BottomStatusBar } from '../components/BottomStatusBar';
import { CentralStageContainer } from '../components/CentralStageContainer';
import {
  BottomConsole,
  type ConsoleTab,
} from '../components/console/BottomConsole';
import {
  CommandPalette,
  type CommandTarget,
} from '../components/command/CommandPalette';
import { DomainLedgerTable } from '../components/ledger/DomainLedgerTable';
import { ActivityDrawer } from '../components/layout/ActivityDrawer';
import { ActivityRail } from '../components/layout/ActivityRail';
import { TopologyDrawer } from '../components/layout/TopologyDrawer';
import { AgentCopilot } from '../components/agent/AgentCopilot';
import { DiagnosticsDrawer } from '../components/sensors/DiagnosticsDrawer';
import { SimulationSandbox } from '../components/simulation/SimulationSandbox';
import { TopHeader } from '../components/TopHeader';
import {
  CanvasViewport,
  LiveApiProvider,
  createDiagnosticIndex,
  type CanvasViewMode,
} from '@evidence-poc/desktop-feature-canvas';
import { RightInspector } from '@evidence-poc/desktop-feature-inspector';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Toaster,
  toast,
} from '@evidence-poc/desktop-ui-kit';
import { useAgentPatchBridge } from '../state/useAgentPatchBridge';
import type {
  CommandCapabilities,
  CommandHandlers,
} from '../state/commandRegistry';
import { useCommandRegistry } from '../state/useCommandRegistry';
import { useAgentSession } from '../state/useAgentSession';
import { useDeliveryHub } from '../state/useDeliveryHub';
import { useLiveModelBridge } from '../state/useLiveModelBridge';
import { useEditorSession } from '../state/useEditorSession';
import { useEditorShortcuts } from '../state/useEditorShortcuts';
import { useMcpBridge } from '../state/useMcpBridge';
import { usePatchReview } from '../state/usePatchReview';
import { useReviewExport } from '../state/useReviewExport';
import { useSensorsState } from '../state/useSensorsState';
import {
  type RailTabId,
  useWorkspaceLayoutState,
} from '../state/useWorkspaceLayoutState';
import { useWorkspaceViewMode } from '../state/useWorkspaceViewMode';

type LoadState =
  | { name: 'loading' }
  | {
      name: 'ready';
      project: EvidenceProjectSummary;
      document: DomainModelDocument;
    }
  | { name: 'error'; message: string };

export const EditorScreen = ({ rootPath }: { rootPath: string }) => {
  const [state, setState] = useState<LoadState>({ name: 'loading' });

  useEffect(() => {
    if (rootPath === '') {
      setState({
        name: 'error',
        message: '缺少项目路径：请从仪表盘重新打开项目。',
      });
      return;
    }

    let active = true;

    setState({ name: 'loading' });
    void window.evidenceAPI.projects.open(rootPath).then((result) => {
      if (!active) {
        return;
      }

      setState(
        result.success
          ? {
              name: 'ready',
              project: result.project,
              document: result.document,
            }
          : { name: 'error', message: result.error },
      );
    });

    return () => {
      active = false;
    };
  }, [rootPath]);

  if (state.name === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-evidence-surface text-[12px] text-evidence-muted">
        正在读取 .evidence/fm 源树…
      </div>
    );
  }

  if (state.name === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-evidence-surface px-10">
        <p className="max-w-xl text-center text-[12px] whitespace-pre-wrap text-[#b42318]">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <EditorWorkspace
      key={rootPath}
      project={state.project}
      initialDocument={state.document}
    />
  );
};

interface EditorWorkspaceProps {
  project: EvidenceProjectSummary;
  initialDocument: DomainModelDocument;
}

const RailDiagnostics = ({
  report,
  reportLoading,
  reportError,
  reportStale,
  activeIssueIds,
  onFocusIssue,
  onRerun,
  onClose,
}: {
  report: SensorReport | null;
  reportLoading: boolean;
  reportError: string | null;
  reportStale: boolean;
  activeIssueIds: readonly string[];
  onFocusIssue: (issue: SensorIssue) => void;
  onRerun: () => void;
  onClose: () => void;
}) => {
  if (report === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-[11px] text-evidence-muted">
        {reportError === null ? null : (
          <p role="alert" className="text-[#b42318]">
            {reportError}
          </p>
        )}
        <p>{reportLoading ? '正在运行检查器…' : '尚未运行检查器'}</p>
        <button
          type="button"
          onClick={onRerun}
          className="rounded border border-evidence-line px-2 py-0.5 hover:text-evidence-ink"
        >
          立即检查
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-evidence-line px-2 py-1">
        <span className="text-[10px] text-evidence-muted">
          {reportStale ? '检查结果已过期' : `文档修订 ${report.documentRevision}`}
        </span>
        <button
          type="button"
          onClick={onRerun}
          className="rounded border border-evidence-line px-1.5 py-0.5 text-[10px] text-evidence-muted hover:text-evidence-ink"
        >
          重新检查
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <DiagnosticsDrawer
          embedded
          report={report}
          selectedIssueIds={activeIssueIds}
          stale={reportStale}
          onClose={onClose}
          onFocusIssue={onFocusIssue}
        />
      </div>
    </div>
  );
};

const RAIL_TITLES: Record<RailTabId, string> = {
  topology: '业务结构',
  diagnostics: '门禁与诊断',
  simulation: '场景仿真',
  copilot: 'AI 协同',
};

const EditorWorkspace = ({
  project,
  initialDocument,
}: EditorWorkspaceProps) => {
  const [viewMode, setViewMode] = useState<CanvasViewMode>('simplified');
  const workspaceView = useWorkspaceViewMode();
  // Every drawer, sheet and overlay is one object, so the shell renders a
  // projection instead of coordinating four independent booleans.
  const layout = useWorkspaceLayoutState();
  const reviewExport = useReviewExport(project.rootPath);
  const { state, save, reloadFromDisk, dismissExternalChange } =
    useEditorSession(project, initialDocument, viewMode);
  const agent = useAgentSession(project.rootPath);
  const sensors = useSensorsState(project.rootPath);
  const liveModel = useLiveModelBridge(
    project.rootPath,
    state.session,
    initialDocument,
  );
  const delivery = useDeliveryHub(
    project.rootPath,
    state.session,
    initialDocument,
  );
  const [selectedScope, setSelectedScope] = useState<string | null>(null);
  const scope = useMemo(
    () => computeContextScope(state.layout, selectedScope),
    [state.layout, selectedScope],
  );
  const changeScope = useCallback(
    (contextId: string | null) => {
      const next = computeContextScope(state.layout, contextId);
      if (
        next &&
        state.selection.nodeId !== null &&
        !next.nodeIds.has(state.selection.nodeId)
      )
        state.session.clearSelection();
      setSelectedScope(next?.contextId ?? null);
    },
    [state.layout, state.selection.nodeId, state.session],
  );
  // Deletion/undo and selection from inspectors, sensors or MCP must never
  // leave the editor inspecting an invisible, non-interactive object.
  useEffect(() => {
    if (
      selectedScope !== null &&
      (scope === null ||
        (state.selection.nodeId !== null &&
          !scope.nodeIds.has(state.selection.nodeId)))
    )
      setSelectedScope(null);
  }, [selectedScope, scope, state.selection.nodeId]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('diagnostics');
  // The palette replaces a row of header buttons with one chord; every action
  // it runs is the same handler the header used to call.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openConsole = useCallback((tab: ConsoleTab) => {
    setConsoleTab(tab);
    setConsoleOpen(true);
  }, []);
  const [activeIssueIds, setActiveIssueIds] = useState<readonly string[]>([]);
  // Findings must describe the exact live revision, including undo/redo.
  const diagnosticsStale =
    liveModel.error !== null ||
    sensors.report?.documentRevision !== liveModel.revision ||
    sensors.loading ||
    sensors.error !== null;
  const diagnostics = useMemo(
    () =>
      createDiagnosticIndex(
        diagnosticsStale ? null : sensors.report,
        state.document,
      ),
    [diagnosticsStale, sensors.report, state.document],
  );
  useEffect(() => {
    if (state.savedAt !== null) void sensors.refresh();
  }, [state.savedAt, sensors.refresh]);
  const [reviewRevision, setReviewRevision] = useState(0);
  const [reviewPrompt, setReviewPrompt] = useState<{
    token: number;
    text: string;
  } | null>(null);
  useEffect(() => {
    setReviewRevision((current) => current + 1);
  }, [state.document, state.externalChangeAt]);
  const reviewInput = useMemo(
    () => ({
      rootPath: project.rootPath,
      document: state.document,
      revision: reviewRevision,
    }),
    [project.rootPath, state.document, reviewRevision],
  );

  const patchReview = usePatchReview(state.session, state.document);

  useAgentPatchBridge(state.session, patchReview.record);

  // Monotonic document revision so an external agent can tell whether the model
  // it read is still the model on screen.
  const revisionRef = useRef(0);
  useEffect(() => {
    revisionRef.current += 1;
  }, [state.document]);

  useMcpBridge({
    project,
    session: state.session,
    graph: state.graph,
    document: state.document,
    validation: state.validation,
    report: sensors.report,
    revision: revisionRef.current,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [focusRequest, setFocusRequest] = useState<{
    nodeId: string;
    token: number;
  } | null>(null);
  const [zoomCommand, setZoomCommand] = useState<{
    direction: 'in' | 'out';
    token: number;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const tokenRef = useRef(0);
  // The search box only exists while its drawer is open, so the chord has to
  // open the drawer first and land the caret on the next paint.
  const focusSearch = useCallback(() => {
    layout.setActiveRailTab('topology');
    setSearchFocusToken((token) => token + 1);
  }, [layout.setActiveRailTab]);
  useEffect(() => {
    if (layout.activeRailTab !== 'topology' || searchFocusToken === 0) return;
    searchInputRef.current?.focus();
  }, [layout.activeRailTab, searchFocusToken]);
  // ⌘K bumps this, which moves the caret into the agent composer.
  const [agentFocusToken, setAgentFocusToken] = useState(0);

  // The table and the graph share one selection, so leaving the ledger lands on
  // the object that was being read instead of the fit-to-content corner.
  const previousWorkspaceView = useRef(workspaceView.mode);
  useEffect(() => {
    const previous = previousWorkspaceView.current;
    previousWorkspaceView.current = workspaceView.mode;

    if (previous === 'graph' || workspaceView.mode === 'table') return;

    const nodeId = state.selection.nodeId;
    if (nodeId === null) return;

    tokenRef.current += 1;
    setFocusRequest({ nodeId, token: tokenRef.current });
  }, [workspaceView.mode, state.selection.nodeId]);

  // The inspector is also collapsed from the keyboard, and the imperative handle
  // is the only way to move a panel without a pointer drag.
  const rightRail = useRef<ImperativePanelHandle>(null);
  const toggleRail = useCallback(
    (rail: RefObject<ImperativePanelHandle | null>) => {
      const panel = rail.current;

      if (panel === null) return;
      if (panel.isCollapsed()) panel.expand();
      else panel.collapse();
    },
    [],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      if (scope !== null && !scope.nodeIds.has(nodeId)) setSelectedScope(null);
      state.session.select(nodeId);
      tokenRef.current += 1;
      setFocusRequest({ nodeId, token: tokenRef.current });
    },
    [state.session, scope],
  );

  /**
   * Jumps from a finding to the object it belongs to.
   *
   * `entity#attribute` targets select the attribute row; Contexts and
   * relationships pan to their actual geometry without selecting a made-up object.
   */
  const focusIssue = useCallback(
    (issue: SensorIssue) => {
      const target = issue.targetNodeId;

      if (target !== undefined) {
        const [nodeId, attributeName] = target.split('#');

        if (nodeId !== undefined && state.layout.nodeById.has(nodeId)) {
          if (scope !== null && !scope.nodeIds.has(nodeId))
            setSelectedScope(null);
          state.session.selectAttribute(nodeId, attributeName ?? null);
          tokenRef.current += 1;
          setFocusRequest({ nodeId, token: tokenRef.current });

          return;
        }
      }

      const id = target?.split('#')[0];
      const contextRef = issue.contextRef ?? id;
      const group = state.layout.contextGroups.find(
        (candidate) => candidate.contextId === contextRef,
      );
      const edge = state.layout.edges.find(
        (candidate) => candidate.relationshipId === id,
      );
      const ref = edge?.relationshipId ?? group?.contextId;
      if (ref) {
        setSelectedScope(null);
        tokenRef.current += 1;
        setFocusRequest({ nodeId: ref, token: tokenRef.current });
      }
    },
    [state.layout, state.session, scope],
  );

  // What the next question will be about: the canvas selection, reduced to what
  // the composer can name without a graph.
  const selectedEntity =
    state.selection.nodeId === null
      ? undefined
      : state.graph.getEntity(state.selection.nodeId);
  const promptFocus =
    selectedEntity === undefined
      ? null
      : {
          nodeId: selectedEntity.id,
          label: selectedEntity.label,
          kind: selectedEntity.category,
        };

  const requestZoom = useCallback((direction: 'in' | 'out') => {
    tokenRef.current += 1;
    setZoomCommand({ direction, token: tokenRef.current });
  }, []);

  const commandTargets = useMemo<readonly CommandTarget[]>(
    () =>
      state.layout.nodes.map((node) => ({
        id: node.nodeId,
        label: node.entity.label,
        category: ENTITY_CATEGORY_LABELS[node.entity.category],
        path:
          node.contextId === null
            ? []
            : state.graph
                .contextPath(node.contextId)
                .map((context) => context.label),
      })),
    [state.layout.nodes, state.graph],
  );

  const commandCapabilities = useMemo<CommandCapabilities>(
    () => ({
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      dirty: state.dirty,
      busy: reviewExport.busy,
      viewMode: workspaceView.mode,
    }),
    [
      state.canUndo,
      state.canRedo,
      state.dirty,
      reviewExport.busy,
      workspaceView.mode,
    ],
  );

  const commandHandlers = useMemo<CommandHandlers>(
    () => ({
      save: () => void save(),
      undo: () => {
        state.session.undo();
      },
      redo: () => {
        state.session.redo();
      },
      setViewMode: workspaceView.setMode,
      focusSearch,
      openReview: () => openConsole('review'),
      exportReview: () => void reviewExport.exportPage(),
      exportDiff: () => void reviewExport.exportPage(true),
      openDelivery: () => openConsole('delivery'),
      openSandbox: () => openConsole('simulation'),
      rerunSensors: () => void sensors.refresh(),
      askAgent: () => {
        layout.setActiveRailTab('copilot');
        setAgentFocusToken((token) => token + 1);
      },
      openRail: layout.setActiveRailTab,
    }),
    [
      focusSearch,
      layout.setActiveRailTab,
      openConsole,
      reviewExport.exportPage,
      save,
      sensors.refresh,
      state.session,
      workspaceView.setMode,
    ],
  );

  const commands = useCommandRegistry(commandCapabilities, commandHandlers);

  /*
   * Export outcomes arrive here whichever entry point started them — the header,
   * a chord or a palette row — so the report is bound to the controller's notice
   * rather than to the control that was pressed. A cancelled save dialog resolves
   * with no notice and therefore says nothing.
   */
  const { notice: exportNotice, dismissNotice } = reviewExport;
  useEffect(() => {
    if (exportNotice === null) return;

    if (exportNotice.tone === 'saved') {
      toast.success(exportNotice.message);
    } else {
      toast.error(exportNotice.message);
    }

    dismissNotice();
  }, [exportNotice, dismissNotice]);

  const { accept: acceptPatch, revert: revertPatch } = patchReview;

  const shortcuts = useMemo(
    () => ({
      openReview: () => openConsole('review'),
      undo: () => {
        state.session.undo();
      },
      redo: () => {
        state.session.redo();
      },
      save: () => void save(),
      focusSearch,
      openCommandPalette: () => setPaletteOpen(true),
      exportReview: () => void reviewExport.exportPage(),
      rerunSensors: () => void sensors.refresh(),
      openDelivery: () => openConsole('delivery'),
      openSandbox: () => openConsole('simulation'),
      clearSelection: () => state.session.clearSelection(),
      zoomIn: () => requestZoom('in'),
      zoomOut: () => requestZoom('out'),
      toggleLeftRail: () => {
        layout.toggleRailTab('topology');
      },
      toggleRightRail: () => {
        toggleRail(rightRail);
      },
      toggleConsole: () => {
        setConsoleOpen((open) => !open);
      },
      ...(patchReview.review === null ? {} : { acceptPatch, revertPatch }),
    }),
    [
      acceptPatch,
      patchReview.review,
      requestZoom,
      revertPatch,
      focusSearch,
      layout.toggleRailTab,
      reviewExport.exportPage,
      save,
      sensors.refresh,
      openConsole,
      state.session,
      toggleRail,
    ],
  );

  useEditorShortcuts(shortcuts);

  useEffect(() => {
    const entity =
      state.selection.nodeId === null
        ? undefined
        : state.graph.getEntity(state.selection.nodeId);

    void window.evidenceAPI.agent.publishCanvasContext({
      rootPath: project.rootPath,
      context: {
        projectRoot: project.rootPath,
        modelId: state.document.manifest.id,
        selection: state.selection,
        ...(entity === undefined
          ? {}
          : {
              selected: {
                nodeId: entity.id,
                label: entity.label,
                kind: entity.category,
                ...('contextRef' in entity && entity.contextRef !== undefined
                  ? { contextRef: entity.contextRef }
                  : {}),
              },
            }),
      },
    });
  }, [
    project.rootPath,
    state.selection,
    state.graph,
    state.document.manifest.id,
  ]);

  const canLocateIssue = useCallback(
    (issue: SensorIssue) => {
      const id = issue.targetNodeId?.split('#')[0] ?? issue.contextRef;

      return (
        !!id &&
        (state.layout.nodeById.has(id) ||
          state.layout.contextGroups.some((group) => group.contextId === id) ||
          state.layout.edges.some((edge) => edge.relationshipId === id))
      );
    },
    [state.layout],
  );

  return (
    <LiveApiProvider analysis={delivery.analysis} stale={delivery.stale}>
      <div className="flex h-full flex-col bg-evidence-surface">
        <TopHeader
          projectName={state.project.name}
          dirty={state.dirty}
          workspaceViewMode={workspaceView.mode}
          graph={state.graph}
          selection={state.selection}
          onSave={() => void save()}
          onExportDiffReview={() => void reviewExport.exportPage(true)}
          onExportReview={() => void reviewExport.exportPage()}
          exportReviewBusy={reviewExport.busy}
          onWorkspaceViewModeChange={workspaceView.setMode}
          onOpenCommandPalette={() => setPaletteOpen(true)}
        />

        {liveModel.error === null ? null : (
          <p role="alert">实时诊断同步失败：{liveModel.error}</p>
        )}

        {/*
          The studio is the canvas plus one inspector: outline, diagnostics,
          sandbox and copilot are drawers the 48px activity rail opens, so the
          canvas owns every pixel the modeler is not actively using, and the
          console takes the stage's lower half instead of opening over it.
        */}
        <div className="relative flex min-h-0 flex-1">
          <ActivityRail
            activeTab={layout.activeRailTab}
            onSelect={layout.toggleRailTab}
            badges={{
              ...(sensors.report === null
                ? {}
                : {
                    diagnostics: {
                      count:
                        sensors.report.blockCount + sensors.report.warnCount,
                      tone:
                        sensors.report.blockCount > 0
                          ? ('error' as const)
                          : sensors.report.warnCount > 0
                            ? ('warning' as const)
                            : ('default' as const),
                    },
                  }),
              ...(patchReview.review === null
                ? {}
                : { copilot: { tone: 'default' as const } }),
            }}
          />

          {layout.activeRailTab === null ? null : (
            <div
              className={
                layout.isRailPinned
                  ? 'h-full w-[300px] shrink-0'
                  : 'absolute inset-y-0 left-12 z-30 w-[320px]'
              }
            >
              <ActivityDrawer
                title={RAIL_TITLES[layout.activeRailTab]}
                pinned={layout.isRailPinned}
                onTogglePinned={layout.toggleRailPinned}
                onClose={() => layout.setActiveRailTab(null)}
              >
                {layout.activeRailTab === 'topology' ? (
                  <TopologyDrawer
                    graph={state.graph}
                    layout={state.layout}
                    selectedNodeId={state.selection.nodeId}
                    searchTerm={searchTerm}
                    onSearchTermChange={setSearchTerm}
                    searchInputRef={searchInputRef}
                    onFocusNode={focusNode}
                  />
                ) : null}

                {layout.activeRailTab === 'diagnostics' ? (
                  <RailDiagnostics
                    report={sensors.report}
                    reportLoading={sensors.loading}
                    reportError={sensors.error}
                    reportStale={diagnosticsStale}
                    activeIssueIds={activeIssueIds}
                    onFocusIssue={focusIssue}
                    onRerun={() => void sensors.refresh()}
                    onClose={() => layout.setActiveRailTab(null)}
                  />
                ) : null}

                {layout.activeRailTab === 'simulation' ? (
                  <SimulationSandbox
                    embedded
                    rootPath={project.rootPath}
                    onClose={() => layout.setActiveRailTab(null)}
                    onFocusEntity={focusNode}
                  />
                ) : null}

                {layout.activeRailTab === 'copilot' ? (
                  <AgentCopilot
                    controller={agent}
                    patchReview={patchReview}
                    focus={promptFocus}
                    onClearFocus={() => state.session.clearSelection()}
                    onFocusEntity={focusNode}
                    focusToken={agentFocusToken}
                    prefill={reviewPrompt}
                    onPrefillConsumed={() => setReviewPrompt(null)}
                  />
                ) : null}
              </ActivityDrawer>
            </div>
          )}

          <div className="flex min-h-0 min-w-0 flex-1">
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="evidence-studio-horizontal-v2"
          >
            <ResizablePanel id="center-stage" order={1} minSize={35}>
              <ResizablePanelGroup
                direction="vertical"
                autoSaveId="evidence-studio-vertical-v1"
              >
                <ResizablePanel id="canvas-stage" order={1} minSize={25}>
                  <CentralStageContainer
                    mode={workspaceView.mode}
                    graph={
                      <CanvasViewport
                        graph={state.graph}
                        layout={state.layout}
                        document={state.document}
                        viewMode={viewMode}
                        selection={state.selection}
                        focusRequest={focusRequest}
                        zoomCommand={zoomCommand}
                        onViewModeChange={setViewMode}
                        diagnostics={diagnostics}
                        onOpenIssues={(issues) => {
                          setActiveIssueIds(
                            issues.map((issue) => issue.issueId),
                          );
                          openConsole('diagnostics');
                          if (issues[0]) focusIssue(issues[0]);
                        }}
                        overlay={patchReview.review?.overlay ?? null}
                        scope={scope}
                        onScopeChange={changeScope}
                        onSelect={(nodeId) => state.session.select(nodeId)}
                        onClearSelection={() => state.session.clearSelection()}
                      />
                    }
                    table={
                      <DomainLedgerTable
                        document={state.document}
                        session={state.session}
                        diagnostics={diagnostics}
                        selectedNodeId={state.selection.nodeId}
                        selectedAttributeName={state.selection.attributeName}
                        focusNodeId={state.selection.nodeId}
                        onRevealOnGraph={(nodeId) => {
                          focusNode(nodeId);
                          workspaceView.setMode('graph');
                        }}
                      />
                    }
                  />
                </ResizablePanel>

                {consoleOpen ? (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel
                      id="bottom-console"
                      order={2}
                      defaultSize={36}
                      minSize={15}
                      maxSize={70}
                    >
                      <BottomConsole
                        rootPath={project.rootPath}
                        activeTab={consoleTab}
                        onTabChange={setConsoleTab}
                        onClose={() => setConsoleOpen(false)}
                        report={sensors.report}
                        reportStale={diagnosticsStale}
                        reportLoading={sensors.loading}
                        reportError={sensors.error}
                        activeIssueIds={activeIssueIds}
                        onFocusIssue={focusIssue}
                        onRerunDiagnostics={() => void sensors.refresh()}
                        delivery={delivery}
                        reviewInput={reviewInput}
                        canLocate={canLocateIssue}
                        onPromptIssue={(issue) => {
                          setConsoleOpen(false);
                          focusIssue(issue);
                          tokenRef.current += 1;
                          setReviewPrompt({
                            token: tokenRef.current,
                            text: `请协助分析以下模型审查发现，先说明修改建议，不要假定业务决策：\n[${issue.code}] ${issue.message}\n${issue.targetNodeId ?? issue.contextRef ?? ''}\n${issue.suggestion ?? ''}`,
                          });
                        }}
                        onFocusEntity={focusNode}
                      />
                    </ResizablePanel>
                  </>
                ) : null}
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel
              id="right-rail"
              order={2}
              defaultSize={22}
              minSize={14}
              maxSize={32}
              collapsible
              collapsedSize={0}
              ref={rightRail}
            >
              <RightInspector
                graph={state.graph}
                session={state.session}
                selection={state.selection}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
          </div>
        </div>

        <BottomStatusBar
          layout={state.layout}
          validation={state.validation}
          report={sensors.report}
          reportStale={diagnosticsStale}
          sensorLoading={sensors.loading}
          sensorError={sensors.error}
          diagnosticsOpen={consoleOpen && consoleTab === 'diagnostics'}
          onToggleDiagnostics={() => {
            if (consoleOpen && consoleTab === 'diagnostics') {
              setConsoleOpen(false);
              return;
            }

            openConsole('diagnostics');
          }}
          onRerunSensors={() => void sensors.refresh()}
          dirty={state.dirty}
          savedAt={state.savedAt}
          saveError={state.saveError}
          externalChangeAt={state.externalChangeAt}
          onReload={() => void reloadFromDisk()}
          onDismissExternalChange={dismissExternalChange}
        />

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          commands={commands}
          targets={commandTargets}
          onFocusTarget={focusNode}
        />
        <Toaster />
      </div>
    </LiveApiProvider>
  );
};
