import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import type { EvidenceProjectSummary } from '../../shared/projects';
import { BottomStatusBar } from '../components/BottomStatusBar';
import { LeftSidebar } from '../components/LeftSidebar';
import { TopHeader } from '../components/TopHeader';
import { CanvasViewport } from '../components/canvas/CanvasViewport';
import type { CanvasViewMode } from '../components/canvas/CanvasStage';
import { useEditorSession } from '../state/useEditorSession';
import { useEditorShortcuts } from '../state/useEditorShortcuts';

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
  const { state, save, reloadFromDisk, dismissExternalChange } =
    useEditorSession(project, initialDocument);
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

        <InspectorPlaceholder
          label={
            state.selection.nodeId === null
              ? null
              : (state.graph.getEntity(state.selection.nodeId)?.label ?? null)
          }
        />
      </div>

      <BottomStatusBar
        layout={state.layout}
        validation={state.validation}
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

const InspectorPlaceholder = ({ label }: { label: string | null }) => (
  <aside className="w-[312px] shrink-0 border-l border-evidence-line bg-white/70 p-3">
    <p className="text-[10px] tracking-wide text-evidence-muted uppercase">
      检视器
    </p>
    <p className="mt-2 text-[12px] text-evidence-ink">
      {label === null ? '选择画布上的业务对象查看属性。' : label}
    </p>
  </aside>
);
