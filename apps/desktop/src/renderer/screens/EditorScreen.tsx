import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { computeContextScope } from '@evidence-poc/evidence-canvas-interaction';
import type { SensorIssue } from '@evidence-poc/evidence-modeling-orchestrator/browser';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import type { EvidenceProjectSummary } from '../../shared/projects';
import { ReviewHubModal } from '../components/review/ReviewHubModal';
import { AgentPanel } from '../components/agent/AgentPanel';
import { PatchReviewBar } from '../components/agent/PatchReviewBar';
import { PromptDock } from '../components/agent/PromptDock';
import { BottomStatusBar } from '../components/BottomStatusBar';
import { LeftSidebar } from '../components/LeftSidebar';
import { RightInspector } from '../components/RightInspector';
import { DeliveryHub } from '../components/delivery/DeliveryHub';
import { DiagnosticsDrawer } from '../components/sensors/DiagnosticsDrawer';
import { SimulationSandbox } from '../components/simulation/SimulationSandbox';
import { TopHeader } from '../components/TopHeader';
import { CanvasViewport } from '../components/canvas/CanvasViewport';
import type { CanvasViewMode } from '../components/canvas/CanvasStage';
import { useAgentPatchBridge } from '../state/useAgentPatchBridge';
import { useAgentSession } from '../state/useAgentSession';
import { LiveApiProvider } from '../state/LiveApiContext';
import { useDeliveryHub } from '../state/useDeliveryHub';
import { useLiveModelBridge } from '../state/useLiveModelBridge';
import { useEditorSession } from '../state/useEditorSession';
import { useEditorShortcuts } from '../state/useEditorShortcuts';
import { useMcpBridge } from '../state/useMcpBridge';
import { usePatchReview } from '../state/usePatchReview';
import { useReviewExport } from '../state/useReviewExport';
import { createDiagnosticIndex } from '../state/diagnosticIndex';
import { useSensorsState } from '../state/useSensorsState';

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
  const [viewMode, setViewMode] = useState<CanvasViewMode>('simplified');
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
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
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
  const [reviewOpen, setReviewOpen] = useState(false);
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
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [sandboxOpen, setSandboxOpen] = useState(false);

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
  const tokenRef = useRef(0);
  // ⌘K bumps this, which moves the caret into the agent composer.
  const [agentFocusToken, setAgentFocusToken] = useState(0);

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

  const { accept: acceptPatch, revert: revertPatch } = patchReview;

  const shortcuts = useMemo(
    () => ({
      openReview: () => setReviewOpen(true),
      undo: () => {
        state.session.undo();
      },
      redo: () => {
        state.session.redo();
      },
      save: () => void save(),
      focusSearch: () => searchInputRef.current?.focus(),
      focusAgent: () => setAgentFocusToken((token) => token + 1),
      clearSelection: () => state.session.clearSelection(),
      zoomIn: () => requestZoom('in'),
      zoomOut: () => requestZoom('out'),
      ...(patchReview.review === null ? {} : { acceptPatch, revertPatch }),
    }),
    [
      acceptPatch,
      patchReview.review,
      requestZoom,
      revertPatch,
      save,
      state.session,
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

  return (
    <LiveApiProvider analysis={delivery.analysis} stale={delivery.stale}>
      <div className="flex h-full flex-col bg-evidence-surface">
        <TopHeader
          projectName={state.project.name}
          dirty={state.dirty}
          canUndo={state.canUndo}
          canRedo={state.canRedo}
          viewMode={viewMode}
          graph={state.graph}
          selection={state.selection}
          onUndo={() => {
            state.session.undo();
          }}
          onRedo={() => {
            state.session.redo();
          }}
          onSave={() => void save()}
          onPreviewReview={() => setReviewOpen(true)}
          onExportDiffReview={() => void reviewExport.exportPage(true)}
          onExportReview={() => void reviewExport.exportPage()}
          exportReviewBusy={reviewExport.busy}
          onOpenDelivery={() => setDeliveryOpen(true)}
          onOpenSandbox={() => setSandboxOpen(true)}
          onViewModeChange={setViewMode}
          onSearch={() => searchInputRef.current?.focus()}
        />

        {liveModel.error === null ? null : (
          <p role="alert">实时诊断同步失败：{liveModel.error}</p>
        )}
        {reviewExport.notice !== null ? (
          <div
            role="status"
            className={[
              'flex items-center justify-between gap-2 border-b px-4 py-1.5 text-[11px]',
              reviewExport.notice.tone === 'saved'
                ? 'border-evidence-line bg-evidence-surface text-evidence-muted'
                : 'border-evidence-evidence bg-[#fdf3f1] text-evidence-evidence',
            ].join(' ')}
          >
            <span className="truncate">{reviewExport.notice.message}</span>
            <button
              type="button"
              onClick={reviewExport.dismissNotice}
              className="shrink-0 rounded border border-evidence-line px-1.5 py-0.5 text-evidence-muted hover:text-evidence-ink"
            >
              知道了
            </button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <LeftSidebar
            graph={state.graph}
            layout={state.layout}
            selectedNodeId={state.selection.nodeId}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            searchInputRef={searchInputRef}
            onFocusNode={focusNode}
          />

          <AgentPanel controller={agent} />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <CanvasViewport
              graph={state.graph}
              layout={state.layout}
              document={state.document}
              viewMode={viewMode}
              selection={state.selection}
              focusRequest={focusRequest}
              zoomCommand={zoomCommand}
              diagnostics={diagnostics}
              onOpenIssues={(issues) => {
                setActiveIssueIds(issues.map((issue) => issue.issueId));
                setDiagnosticsOpen(true);
                if (issues[0]) focusIssue(issues[0]);
              }}
              overlay={patchReview.review?.overlay ?? null}
              scope={scope}
              onScopeChange={changeScope}
              onSelect={(nodeId) => state.session.select(nodeId)}
              onClearSelection={() => state.session.clearSelection()}
            />

            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2">
              {patchReview.review === null ? null : (
                <PatchReviewBar
                  review={patchReview.review}
                  onAccept={patchReview.accept}
                  onRevert={patchReview.revert}
                />
              )}

              <div className="pointer-events-auto">
                <PromptDock
                  prefill={reviewPrompt}
                  running={agent.state.running}
                  activeToolName={agent.state.activeToolName}
                  onSubmit={agent.submit}
                  onStop={agent.stop}
                  focus={promptFocus}
                  onClearFocus={() => state.session.clearSelection()}
                  focusToken={agentFocusToken}
                />
              </div>
            </div>
          </div>

          <RightInspector
            graph={state.graph}
            session={state.session}
            selection={state.selection}
          />
        </div>

        {reviewOpen ? (
          <ReviewHubModal
            input={reviewInput}
            onClose={() => setReviewOpen(false)}
            canLocate={(issue) => {
              const id = issue.targetNodeId?.split('#')[0] ?? issue.contextRef;
              return (
                !!id &&
                (state.layout.nodeById.has(id) ||
                  state.layout.contextGroups.some(
                    (group) => group.contextId === id,
                  ) ||
                  state.layout.edges.some((edge) => edge.relationshipId === id))
              );
            }}
            onLocate={(issue) => {
              setReviewOpen(false);
              focusIssue(issue);
            }}
            onPrompt={(issue) => {
              setReviewOpen(false);
              focusIssue(issue);
              tokenRef.current += 1;
              setReviewPrompt({
                token: tokenRef.current,
                text: `请协助分析以下模型审查发现，先说明修改建议，不要假定业务决策：\n[${issue.code}] ${issue.message}\n${issue.targetNodeId ?? issue.contextRef ?? ''}\n${issue.suggestion ?? ''}`,
              });
            }}
          />
        ) : null}
        {deliveryOpen ? (
          <DeliveryHub
            hub={delivery}
            onFocusEntity={focusNode}
            onClose={() => setDeliveryOpen(false)}
          />
        ) : null}

        {sandboxOpen ? (
          <SimulationSandbox
            rootPath={project.rootPath}
            onClose={() => setSandboxOpen(false)}
            onFocusEntity={focusNode}
          />
        ) : null}

        {diagnosticsOpen && sensors.report !== null ? (
          <DiagnosticsDrawer
            selectedIssueIds={activeIssueIds}
            stale={diagnosticsStale}
            report={sensors.report}
            onClose={() => setDiagnosticsOpen(false)}
            onFocusIssue={focusIssue}
          />
        ) : null}

        <BottomStatusBar
          layout={state.layout}
          validation={state.validation}
          report={sensors.report}
          sensorLoading={sensors.loading}
          sensorError={sensors.error}
          diagnosticsOpen={diagnosticsOpen}
          onToggleDiagnostics={() => setDiagnosticsOpen((open) => !open)}
          onRerunSensors={() => void sensors.refresh()}
          dirty={state.dirty}
          savedAt={state.savedAt}
          saveError={state.saveError}
          externalChangeAt={state.externalChangeAt}
          onReload={() => void reloadFromDisk()}
          onDismissExternalChange={dismissExternalChange}
        />
      </div>
    </LiveApiProvider>
  );
};
