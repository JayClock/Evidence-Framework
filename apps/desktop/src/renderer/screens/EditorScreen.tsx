import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ImperativePanelHandle } from 'react-resizable-panels';

import { computeContextScope } from '@evidence-poc/evidence-canvas-interaction';
import type { SensorIssue } from '@evidence-poc/evidence-agent/browser';
import {
  ENTITY_CATEGORY_LABELS,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

import type { EvidenceProjectSummary } from '@evidence-poc/desktop-contracts/projects';
import { BottomStatusBar } from '../components/BottomStatusBar';
import { ProblemsPanel } from '../components/console/ProblemsPanel';
import {
  CommandPalette,
  type CommandTarget,
} from '../components/command/CommandPalette';
import { DomainLedgerTable } from '../components/ledger/DomainLedgerTable';
import { downloadLedgerCsv } from '../components/ledger/domainLedgerCsv';
import { useEntityLedger } from '../components/ledger/useEntityLedger';
import { CanvasFloatingHud } from '../components/canvas/CanvasFloatingHud';
import { ActivityDrawer } from '../components/layout/ActivityDrawer';
import { ActivityRail } from '../components/layout/ActivityRail';
import { EntityDrawer } from '../components/layout/EntityDrawer';
import { RightPaneShell } from '../components/layout/RightPaneShell';
import { ViewModeBar } from '../components/layout/ViewModeBar';
import {
  AgentCopilot,
  InlinePatchCopilot,
  useAgentPatchBridge,
  useAgentSession,
  usePatchReview,
} from '@evidence-poc/desktop-feature-agent';
import { ScenarioStudioModal } from '../components/scenario/ScenarioStudioModal';
import { WorkshopWizardDrawer } from '../components/wizard/WorkshopWizardDrawer';
import {
  StoryPlayerBar,
  StoryDrawer,
  useStoryPlayback,
} from '@evidence-poc/desktop-feature-story';
import {
  DeliveryHub,
  useDeliveryHub,
} from '@evidence-poc/desktop-feature-delivery';
import { TopHeader } from '../components/TopHeader';
import {
  CanvasViewport,
  LiveApiProvider,
  createDiagnosticIndex,
  type CanvasViewMode,
  type CanvasViewportMemory,
  type ZoomDirection,
} from '@evidence-poc/desktop-feature-canvas';
import { RightInspector } from '@evidence-poc/desktop-feature-inspector';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Toaster,
  toast,
} from '@evidence-poc/desktop-ui-kit';
import type {
  CommandCapabilities,
  CommandHandlers,
} from '../state/commandRegistry';
import { useCommandRegistry } from '../state/useCommandRegistry';
import { useLiveModelBridge } from '../state/useLiveModelBridge';
import { useEditorSession } from '../state/useEditorSession';
import { useEditorShortcuts } from '../state/useEditorShortcuts';
import { useMcpBridge } from '../state/useMcpBridge';
import { useSensorsState } from '../state/useSensorsState';
import { useWorkspaceLayoutState } from '../state/useWorkspaceLayoutState';
import { useAiConfiguration } from '../state/AiConfiguration';
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

const EditorWorkspace = ({
  project,
  initialDocument,
}: EditorWorkspaceProps) => {
  const ai = useAiConfiguration();
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [viewMode, setViewMode] = useState<CanvasViewMode>('standard');
  const canvasMemory = useRef<CanvasViewportMemory['current']>(null);
  const workspaceView = useWorkspaceViewMode();
  const layoutMode =
    workspaceView.graphMode === 'topology' ? 'topology' : 'swimlane';
  const ledgerActive = workspaceView.mode === 'table';
  const storyActive = workspaceView.mode === 'story';
  const rightRail = useRef<ImperativePanelHandle>(null);
  const canvasStageRef = useRef<HTMLDivElement>(null);
  const returnToCanvas = useCallback(() => {
    const canvas = canvasStageRef.current;
    if (canvas === null) return;
    const selected = canvas.querySelector<HTMLElement>(
      '[data-node-id][aria-pressed="true"]',
    );
    (selected ?? canvas).focus({ preventScroll: true });
  }, []);
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false);
  const expandRightRail = useCallback(() => {
    const panel = rightRail.current;
    if (!panel?.isCollapsed()) return false;
    panel.expand();
    return true;
  }, []);
  const toggleRightRail = useCallback(() => {
    if (!expandRightRail()) rightRail.current?.collapse();
  }, [expandRightRail]);
  const layout = useWorkspaceLayoutState(
    workspaceView.toggleLedger,
    expandRightRail,
    { active: ledgerActive, returnToGraph: workspaceView.returnToGraph },
  );
  const {
    state,
    save,
    reloadFromDisk,
    reloadFromDiskIfClean,
    dismissExternalChange,
  } = useEditorSession(project, initialDocument, viewMode, layoutMode);
  const story = useStoryPlayback({
    api: window.evidenceAPI.story,
    rootPath: project.rootPath,
    document: state.document,
    enabled: storyActive,
    aiConfigured: ai?.aiConfigured,
    refreshSavedSources: state.externalChangeAt !== null,
    onInvalidated: reloadFromDiskIfClean,
  });
  const agent = useAgentSession(window.evidenceAPI.agent, project.rootPath);
  const sensors = useSensorsState(project.rootPath);
  const liveModel = useLiveModelBridge(
    project.rootPath,
    state.session,
    initialDocument,
  );
  const delivery = useDeliveryHub(
    window.evidenceAPI.projects,
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
    if (state.layoutPending || state.layoutError !== null) return;
    if (
      selectedScope !== null &&
      (scope === null ||
        (state.selection.nodeId !== null &&
          !scope.nodeIds.has(state.selection.nodeId)))
    )
      setSelectedScope(null);
  }, [
    selectedScope,
    scope,
    state.selection.nodeId,
    state.layoutPending,
    state.layoutError,
  ]);
  // The palette replaces a row of header buttons with one chord; every action
  // it runs is the same handler the header used to call.
  const [paletteOpen, setPaletteOpen] = useState(false);
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
  const entityLedger = useEntityLedger(
    state.document,
    diagnosticsStale ? null : diagnostics,
    ledgerActive,
  );
  useEffect(() => {
    if (state.savedAt !== null) void sensors.refresh();
  }, [state.savedAt, sensors.refresh]);
  const [copilotPrefill, setCopilotPrefill] = useState<{
    token: number;
    text: string;
  } | null>(null);

  const patchReview = usePatchReview(state.session, state.document);

  useAgentPatchBridge(
    window.evidenceAPI.agent,
    state.session,
    patchReview.record,
  );

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
  const [focusRequest, setFocusRequest] = useState<{
    nodeId: string;
    token: number;
  } | null>(null);
  const [zoomCommand, setZoomCommand] = useState<{
    direction: ZoomDirection;
    token: number;
  } | null>(null);
  const tokenRef = useRef(0);
  // ⌘K bumps this, which moves the caret into the agent composer.
  const [agentFocusToken, setAgentFocusToken] = useState(0);

  // The table and the graph share one selection, so leaving the ledger lands on
  // the object that was being read instead of the fit-to-content corner.
  const previousWorkspaceView = useRef(workspaceView.mode);
  useEffect(() => {
    const previous = previousWorkspaceView.current;
    previousWorkspaceView.current = workspaceView.mode;

    if (previous !== 'table' || workspaceView.mode === 'table') return;

    const nodeId = state.selection.nodeId;
    if (nodeId === null) return;

    tokenRef.current += 1;
    setFocusRequest({ nodeId, token: tokenRef.current });
  }, [workspaceView.mode, state.selection.nodeId]);

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

  const requestZoom = useCallback((direction: ZoomDirection) => {
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
      viewMode: workspaceView.mode,
      hasSelection: state.selection.nodeId !== null,
    }),
    [state.canUndo, state.canRedo, state.selection.nodeId, workspaceView.mode],
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
      zoomToSelection: () => requestZoom('selection'),
      openDelivery: layout.openDelivery,
      rerunSensors: () => void sensors.refresh(),
      askAgent: () => {
        layout.openCopilot();
        setAgentFocusToken((token) => token + 1);
      },
      openCopilot: layout.openCopilot,
      openWorkshop: layout.openWorkshop,
      openProblems: layout.openProblemsPanel,
      toggleProblems: layout.toggleProblemsPanel,
    }),
    [
      layout.openCopilot,
      layout.openWorkshop,
      layout.openDelivery,
      layout.openProblemsPanel,
      layout.toggleProblemsPanel,
      requestZoom,
      save,
      sensors.refresh,
      state.session,
      workspaceView.setMode,
    ],
  );

  const registeredCommands = useCommandRegistry(
    commandCapabilities,
    commandHandlers,
  );
  const commands = useMemo(
    () =>
      ai
        ? [
            ...registeredCommands,
            {
              id: 'ai-settings',
              title: '配置大模型 / AI Settings',
              category: 'agent' as const,
              shortcut: '⌘+,',
              keywords: ['API Key', '模型', 'provider'],
              perform: ai.openSettings,
            },
          ]
        : registeredCommands,
    [registeredCommands, ai],
  );

  const { accept: acceptPatch, revert: revertPatch } = patchReview;

  const shortcuts = useMemo(
    () => ({
      undo: () => {
        state.session.undo();
      },
      redo: () => {
        state.session.redo();
      },
      save: () => void save(),
      openCommandPalette: () => setPaletteOpen(true),
      rerunSensors: () => void sensors.refresh(),
      openDelivery: layout.openDelivery,
      clearSelection: () => state.session.clearSelection(),
      zoomIn: () => requestZoom('in'),
      zoomOut: () => requestZoom('out'),
      resetZoom: () => requestZoom('reset'),
      fitCanvas: () => requestZoom('fit'),
      zoomToSelection: () => requestZoom('selection'),
      toggleRightRail,
      openInlineCopilot: layout.openInlineCopilot,
      toggleProblems: layout.toggleProblemsPanel,
      ...(storyActive ? { closeStory: workspaceView.returnToGraph } : {}),
      ...(patchReview.review === null ? {} : { acceptPatch, revertPatch }),
    }),
    [
      acceptPatch,
      patchReview.review,
      requestZoom,
      revertPatch,
      layout.openDelivery,
      layout.openInlineCopilot,
      layout.toggleProblemsPanel,
      save,
      sensors.refresh,
      state.session,
      storyActive,
      toggleRightRail,
      workspaceView.returnToGraph,
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

  const revealOnGraph = useCallback(
    (nodeId: string) => {
      focusNode(nodeId);
      workspaceView.returnToGraph();
    },
    [focusNode, workspaceView.returnToGraph],
  );

  const problemsPanel = layout.isProblemsPanelOpen ? (
    <ProblemsPanel
      report={sensors.report}
      reportStale={diagnosticsStale}
      reportLoading={sensors.loading}
      reportError={sensors.error}
      activeIssueId={layout.activeIssueId}
      onFocusIssue={(issue) => {
        layout.openProblemsWithIssue(issue.issueId);
        focusIssue(issue);
      }}
      onRerun={() => void sensors.refresh()}
      onClose={layout.closeProblemsPanel}
    />
  ) : null;

  const graphStage = (
    <div
      ref={canvasStageRef}
      tabIndex={-1}
      className="relative flex h-full min-h-0 flex-1"
      aria-busy={state.layoutPending}
    >
      {state.layoutPending || state.layoutError ? (
        <div
          role={state.layoutError ? 'alert' : 'status'}
          className="absolute top-24 left-5 z-40 rounded bg-white px-3 py-2 text-sm shadow"
        >
          {state.layoutError
            ? `画布布局失败：${state.layoutError}`
            : '正在计算画布布局…'}
        </div>
      ) : null}
      <CanvasViewport
        graph={state.graph}
        layout={state.layout}
        document={state.document}
        viewMode={viewMode}
        selection={state.selection}
        focusRequest={focusRequest}
        zoomCommand={zoomCommand}
        viewportMemory={canvasMemory}
        storyFocus={story.canvasFocus}
        hud={(controls) => (
          <CanvasFloatingHud
            {...controls}
            density={viewMode}
            onOpenScenarios={() => setScenarioOpen(true)}
            onDensityChange={setViewMode}
            hasSelection={state.selection.nodeId !== null}
            onClearSelection={() => state.session.clearSelection()}
          />
        )}
        diagnostics={diagnostics}
        onOpenIssues={(issues) => {
          if (issues[0] === undefined) return;
          layout.openProblemsWithIssue(issues[0].issueId);
          focusIssue(issues[0]);
        }}
        overlay={patchReview.review?.overlay ?? null}
        scope={storyActive ? null : scope}
        onScopeChange={storyActive ? undefined : changeScope}
        onSelect={(nodeId) => state.session.select(nodeId)}
        onClearSelection={() => state.session.clearSelection()}
      />
    </div>
  );

  return (
    <LiveApiProvider analysis={delivery.analysis} stale={delivery.stale}>
      <div className="flex h-full flex-col bg-evidence-surface">
        <TopHeader
          projectName={state.project.name}
          dirty={state.dirty}
          graph={state.graph}
          selection={state.selection}
          onSave={() => void save()}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          ledgerExport={
            ledgerActive
              ? {
                  enabled: entityLedger.rows.length > 0,
                  onExport: () => {
                    try {
                      downloadLedgerCsv(state.project.name, entityLedger.rows);
                    } catch {
                      toast.error('无法导出总台账 CSV');
                    }
                  },
                }
              : undefined
          }
        />

        {!ledgerActive ? (
          <ViewModeBar
            mode={workspaceView.mode}
            onChange={workspaceView.setMode}
            storyControls={
              storyActive ? (
                <>
                  <StoryPlayerBar
                    playback={story}
                    onExit={workspaceView.returnToGraph}
                    aiConfigured={ai?.aiConfigured}
                    onConfigureAi={ai?.openSettings}
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="rounded border border-evidence-line px-2 py-1 text-[11px]"
                      >
                        剧情详情
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      aria-label="剧情详情"
                      onInteractOutside={(event) => {
                        if (
                          event.target instanceof Element &&
                          event.target.closest('[data-story-toolbar]')
                        ) {
                          // Let readers step through scenes with details open.
                          event.preventDefault();
                        }
                      }}
                      className="h-[min(70vh,var(--radix-popover-content-available-height))] w-[min(32rem,calc(100vw-2rem))] p-0"
                    >
                      <StoryDrawer
                        aiConfigured={ai?.aiConfigured}
                        onConfigureAi={ai?.openSettings}
                        playback={story}
                        dirty={state.dirty}
                        externalConflict={
                          state.dirty && state.externalChangeAt !== null
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </>
              ) : null
            }
          />
        ) : null}

        {liveModel.error === null ? null : (
          <p role="alert">实时诊断同步失败：{liveModel.error}</p>
        )}

        <div className="relative flex min-h-0 flex-1">
          <ActivityRail
            pressed={{
              ledger: ledgerActive,
              diagnostics: layout.isProblemsPanelOpen,
              copilot:
                !ledgerActive &&
                !rightRailCollapsed &&
                layout.rightPane === 'copilot',
              directory: !ledgerActive && layout.isDirectoryOpen,
            }}
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

          {!ledgerActive && layout.isDirectoryOpen ? (
            <EntityDrawer
              graph={state.graph}
              selectedNodeId={state.selection.nodeId}
              onReveal={revealOnGraph}
              onCreate={layout.openWorkshop}
            />
          ) : null}

          {!ledgerActive && layout.isWorkshopOpen ? (
            <div
              className={
                layout.isWorkshopPinned
                  ? 'h-full w-[300px] shrink-0'
                  : `absolute inset-y-0 z-30 w-[320px] ${layout.isDirectoryOpen ? 'left-[268px]' : 'left-12'}`
              }
            >
              <ActivityDrawer
                title="共创工作坊"
                pinned={layout.isWorkshopPinned}
                onTogglePinned={layout.toggleWorkshopPinned}
                onClose={layout.closeWorkshop}
              >
                <WorkshopWizardDrawer
                  session={state.session}
                  onFocus={revealOnGraph}
                  onReview={(text) => {
                    setCopilotPrefill({ token: Date.now(), text });
                    layout.closeWorkshop();
                    layout.openCopilot();
                  }}
                />
              </ActivityDrawer>
            </div>
          ) : null}

          {/* Keep canvas control layers below the floating activity drawer. */}
          <div
            data-region="workspace-stage"
            className="isolate flex min-h-0 min-w-0 flex-1"
          >
            {ledgerActive ? (
              <div className="relative h-full min-h-0 w-full min-w-0">
                <DomainLedgerTable
                  ledger={entityLedger}
                  selectedNodeId={state.selection.nodeId}
                  onRevealOnGraph={revealOnGraph}
                />
                {problemsPanel}
              </div>
            ) : null}
            {/* Keep the panel sizes and collapse state when the ledger takes over. */}
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId="evidence-studio-horizontal-v2"
              style={ledgerActive ? { display: 'none' } : undefined}
            >
              <ResizablePanel id="center-stage" order={1} minSize={35}>
                <div className="relative h-full min-h-0">
                  {!ledgerActive ? graphStage : null}
                  {!ledgerActive ? problemsPanel : null}
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel
                id="right-rail"
                order={2}
                defaultSize={27.3}
                minSize={18}
                maxSize={40}
                collapsible
                collapsedSize={0}
                onCollapse={() => setRightRailCollapsed(true)}
                onExpand={() => setRightRailCollapsed(false)}
                ref={rightRail}
              >
                {!ledgerActive ? (
                  <RightPaneShell
                    collapsed={rightRailCollapsed}
                    pane={layout.rightPane}
                    onShowInspector={layout.showInspector}
                    onShowCopilot={layout.openCopilot}
                    onReturnToCanvas={
                      layout.rightPane === 'inspector' &&
                      !storyActive &&
                      patchReview.review === null
                        ? returnToCanvas
                        : undefined
                    }
                  >
                    {layout.rightPane === 'inspector' ? (
                      <RightInspector
                        graph={state.graph}
                        session={state.session}
                        selection={state.selection}
                        showHeading={false}
                        active={!rightRailCollapsed}
                      />
                    ) : (
                      <AgentCopilot
                        aiConfigured={ai?.aiConfigured}
                        onConfigureAi={ai?.openSettings}
                        controller={agent}
                        patchReview={patchReview}
                        focus={promptFocus}
                        onClearFocus={() => state.session.clearSelection()}
                        onFocusEntity={revealOnGraph}
                        focusToken={agentFocusToken}
                        prefill={copilotPrefill}
                        onPrefillConsumed={() => setCopilotPrefill(null)}
                      />
                    )}
                  </RightPaneShell>
                ) : null}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          {layout.isInlineCopilotOpen ? (
            <div
              data-canvas-control=""
              data-evidence-capture-hide=""
              className="pointer-events-none absolute inset-x-0 bottom-16 z-40 flex justify-center px-4"
            >
              <InlinePatchCopilot
                focus={promptFocus}
                controller={agent}
                patchReview={patchReview}
                onFocusEntity={focusNode}
                onClose={layout.closeInlineCopilot}
                onOpenFullInterview={() => {
                  layout.closeInlineCopilot();
                  layout.openCopilot();
                  setAgentFocusToken((token) => token + 1);
                }}
              />
            </div>
          ) : null}
        </div>

        {layout.isDeliveryOpen ? (
          <DeliveryHub
            hub={delivery}
            onClose={layout.closeDelivery}
            onFocusEntity={focusNode}
          />
        ) : null}

        {!ledgerActive ||
        state.externalChangeAt !== null ||
        state.saveError !== null ? (
          <BottomStatusBar
            layout={state.layout}
            validation={state.validation}
            report={sensors.report}
            reportStale={diagnosticsStale}
            sensorLoading={sensors.loading}
            sensorError={sensors.error}
            diagnosticsOpen={layout.isProblemsPanelOpen}
            onToggleDiagnostics={layout.toggleProblemsPanel}
            onRerunSensors={() => void sensors.refresh()}
            dirty={state.dirty}
            savedAt={state.savedAt}
            saveError={state.saveError}
            externalChangeAt={state.externalChangeAt}
            onReload={() => void reloadFromDisk()}
            onDismissExternalChange={dismissExternalChange}
          />
        ) : null}

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          commands={commands}
          targets={commandTargets}
          onFocusTarget={focusNode}
        />
        {scenarioOpen ? (
          <ScenarioStudioModal
            session={state.session}
            onClose={() => setScenarioOpen(false)}
            onPlay={(flow) => {
              story.selectFlow(flow);
              story.setSkipAi(true);
              workspaceView.setMode('story');
              setScenarioOpen(false);
            }}
          />
        ) : null}
        <Toaster />
      </div>
    </LiveApiProvider>
  );
};
