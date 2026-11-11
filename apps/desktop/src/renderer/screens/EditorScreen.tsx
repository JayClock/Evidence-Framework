import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SensorIssue } from '@evidence-poc/evidence-modeling-orchestrator/browser';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import type { EvidenceProjectSummary } from '../../shared/projects';
import { AgentPanel } from '../components/agent/AgentPanel';
import { BranchDiffPanel } from '../components/branches/BranchDiffPanel';
import { PromptDock } from '../components/agent/PromptDock';
import { BottomStatusBar } from '../components/BottomStatusBar';
import { LeftSidebar } from '../components/LeftSidebar';
import { RightInspector } from '../components/RightInspector';
import { DiagnosticsDrawer } from '../components/sensors/DiagnosticsDrawer';
import { TopHeader } from '../components/TopHeader';
import { CanvasViewport } from '../components/canvas/CanvasViewport';
import type { CanvasViewMode } from '../components/canvas/CanvasStage';
import { useAgentPatchBridge } from '../state/useAgentPatchBridge';
import { compareBranchVerdicts, useBranches } from '../state/useBranches';
import { useAgentSession } from '../state/useAgentSession';
import { useEditorSession } from '../state/useEditorSession';
import { useEditorShortcuts } from '../state/useEditorShortcuts';
import { useFrontier } from '../state/useFrontier';
import { useMcpBridge } from '../state/useMcpBridge';
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
    <EditorWorkspace project={state.project} initialDocument={state.document} />
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
  const { state, save, reloadFromDisk, adoptDocument, dismissExternalChange } =
    useEditorSession(project, initialDocument);
  const branches = useBranches(project.rootPath);
  const agent = useAgentSession(project.rootPath);
  const frontier = useFrontier(project.rootPath, state.document);
  const sensors = useSensorsState(project.rootPath);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const comparison =
    branches.state.comparison === null ? null : branches.state.comparison;
  const verdictDiff =
    comparison === null
      ? null
      : compareBranchVerdicts(
          branches.state.branches,
          comparison.baseBranchId,
          comparison.targetBranchId,
        );

  useAgentPatchBridge(state.session);

  const checkoutBranch = useCallback(
    async (branchId: string) => {
      const document = await branches.checkout(branchId);

      if (document !== null) {
        adoptDocument(document);
      }
    },
    [adoptDocument, branches],
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
  const [viewMode, setViewMode] = useState<CanvasViewMode>('simplified');
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

  const focusNode = useCallback(
    (nodeId: string) => {
      state.session.select(nodeId);
      tokenRef.current += 1;
      setFocusRequest({ nodeId, token: tokenRef.current });
    },
    [state.session],
  );

  /**
   * Jumps from a finding to the object it belongs to.
   *
   * `entity#attribute` targets select the attribute row; a bare context id
   * falls back to the first object inside it, and a finding without a target
   * stays in the drawer instead of guessing.
   */
  const focusIssue = useCallback(
    (issue: SensorIssue) => {
      const target = issue.targetNodeId;

      if (target !== undefined) {
        const [nodeId, attributeName] = target.split('#');

        if (nodeId !== undefined && nodeId !== '') {
          state.session.selectAttribute(nodeId, attributeName ?? null);
          tokenRef.current += 1;
          setFocusRequest({ nodeId, token: tokenRef.current });

          return;
        }
      }

      const contextRef = issue.contextRef;
      const group = state.layout.contextGroups.find(
        (candidate) => candidate.contextId === contextRef,
      );
      const nodeId = group?.nodeIds[0];

      if (nodeId !== undefined) {
        focusNode(nodeId);
      }
    },
    [focusNode, state.layout.contextGroups, state.session],
  );

  const requestZoom = useCallback((direction: 'in' | 'out') => {
    tokenRef.current += 1;
    setZoomCommand({ direction, token: tokenRef.current });
  }, []);

  const shortcuts = useMemo(
    () => ({
      undo: () => {
        state.session.undo();
      },
      redo: () => {
        state.session.redo();
      },
      save: () => void save(),
      focusSearch: () => searchInputRef.current?.focus(),
      clearSelection: () => state.session.clearSelection(),
      zoomIn: () => requestZoom('in'),
      zoomOut: () => requestZoom('out'),
    }),
    [requestZoom, save, state.session],
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

  useEffect(() => {
    if (state.dirty) {
      void window.evidenceAPI.agent.notifyModelChanged({
        rootPath: project.rootPath,
      });
    }
  }, [project.rootPath, state.dirty, state.document]);

  return (
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
        onViewModeChange={setViewMode}
        onSearch={() => searchInputRef.current?.focus()}
        branch={{
          branches: branches.state.branches,
          activeBranchId: branches.state.activeBranchId,
          compareBranchId: branches.state.compareBranchId,
          busy: branches.state.busy,
          loading: branches.state.loading,
          error: branches.state.error,
          actionError: branches.state.actionError,
          onCheckout: (branchId) => void checkoutBranch(branchId),
          onFork: (name, description) => {
            void branches.fork(name, description);
          },
          onCompareChange: (branchId) => void branches.compareWith(branchId),
          onDismissError: branches.clearActionError,
        }}
      />

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

        <AgentPanel
          controller={agent}
          frontier={frontier.frontier}
          frontierLoading={frontier.loading}
          frontierError={frontier.error}
          onRefreshFrontier={frontier.reload}
          onFocusNode={focusNode}
        />

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <CanvasViewport
            graph={state.graph}
            layout={state.layout}
            document={state.document}
            viewMode={viewMode}
            selection={state.selection}
            focusRequest={focusRequest}
            zoomCommand={zoomCommand}
            onSelect={(nodeId) => state.session.select(nodeId)}
            onClearSelection={() => state.session.clearSelection()}
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <div className="pointer-events-auto">
              <PromptDock
                running={agent.state.running}
                activeToolName={agent.state.activeToolName}
                onSubmit={agent.submit}
                onStop={agent.stop}
              />
            </div>
          </div>
        </div>

        {comparison !== null && verdictDiff !== null ? (
          <BranchDiffPanel
            branches={branches.state.branches}
            activeBranchId={branches.state.activeBranchId}
            compareBranchId={comparison.targetBranchId}
            diff={comparison.diff}
            verdict={verdictDiff}
            busy={branches.state.busy}
            onClose={() => void branches.compareWith(null)}
            onMerge={(branchId) => void branches.merge(branchId)}
            onFocusNode={focusNode}
          />
        ) : null}

        <RightInspector
          graph={state.graph}
          session={state.session}
          selection={state.selection}
        />
      </div>

      {diagnosticsOpen && sensors.report !== null ? (
        <DiagnosticsDrawer
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
  );
};
