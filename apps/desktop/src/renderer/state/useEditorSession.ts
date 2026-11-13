import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  type DomainGraph,
  type ModelSelection,
  type ModelSession,
  createModelSession,
} from '@evidence-poc/evidence-model-core/browser';
import type {
  DomainModelDocument,
  ValidationResult,
} from '@evidence-poc/evidence-schema';
import {
  type CanvasViewMode,
  type LifecycleSwimlaneLayout,
  createLifecycleSwimlaneLayout,
} from '@evidence-poc/evidence-canvas-interaction';

import type { EvidenceProjectSummary } from '../../shared/projects';

export interface EditorSessionState {
  project: EvidenceProjectSummary;
  rootPath: string;
  session: ModelSession;
  document: DomainModelDocument;
  graph: DomainGraph;
  layout: LifecycleSwimlaneLayout;
  selection: ModelSelection;
  canUndo: boolean;
  canRedo: boolean;
  validation: ValidationResult;
  dirty: boolean;
  savedAt: string | null;
  saveError: string | null;
  externalChangeAt: string | null;
}

export interface EditorSessionController {
  state: EditorSessionState;
  save: () => Promise<void>;
  reloadFromDisk: () => Promise<void>;
  dismissExternalChange: () => void;
}

const readState = (
  project: EvidenceProjectSummary,
  rootPath: string,
  session: ModelSession,
  viewMode: CanvasViewMode,
  extras: {
    savedAt: string | null;
    saveError: string | null;
    externalChangeAt: string | null;
    dirty: boolean;
  },
): EditorSessionState => {
  const document = session.getDocument();
  const graph = session.getGraph();

  return {
    project,
    rootPath,
    session,
    document,
    graph,
    layout: createLifecycleSwimlaneLayout(graph, { viewMode }),
    selection: session.getSelection(),
    canUndo: session.canUndo(),
    canRedo: session.canRedo(),
    validation: session.validate(),
    ...extras,
  };
};

/**
 * Owns the Phase 1 `ModelSession` for one editor window.
 *
 * Every edit path (inspector, keyboard, future agent) goes through
 * `session.dispatch`, so undo/redo and the canvas stay in step.
 */
export const useEditorSession = (
  project: EvidenceProjectSummary,
  initialDocument: DomainModelDocument,
  viewMode: CanvasViewMode = 'simplified',
): EditorSessionController => {
  const sessionRef = useRef<ModelSession | null>(null);

  if (sessionRef.current === null) {
    sessionRef.current = createModelSession({ document: initialDocument });
  }

  const session = sessionRef.current;
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [externalChangeAt, setExternalChangeAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [version, forceRender] = useState(0);

  // Subscribe during commit, before paint or an incoming agent patch can edit the session.
  useLayoutEffect(() => {
    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'document-changed') {
        setDirty(true);
      }

      forceRender((version) => version + 1);
    });
    const unsubscribeChanges = window.evidenceAPI.projects.onChanged(
      (change) => {
        setExternalChangeAt(change.changedAt);
      },
    );

    return () => {
      unsubscribe();
      unsubscribeChanges();
    };
  }, [session]);

  const state = useMemo(() => {
    // `version` is read so the snapshot refreshes after every session event.
    void version;

    return readState(project, project.rootPath, session, viewMode, {
      savedAt,
      saveError,
      externalChangeAt,
      dirty,
    });
  }, [
    project,
    session,
    version,
    savedAt,
    saveError,
    externalChangeAt,
    dirty,
    viewMode,
  ]);

  const save = useCallback(async () => {
    const result = await window.evidenceAPI.projects.save({
      rootPath: project.rootPath,
      document: session.getDocument(),
    });

    if (!result.success) {
      setSaveError(result.error);
      return;
    }

    setSaveError(null);
    setSavedAt(result.savedAt);
    setDirty(false);
  }, [project.rootPath, session]);

  const reloadFromDisk = useCallback(async () => {
    const result = await window.evidenceAPI.projects.open(project.rootPath);

    if (!result.success) {
      setSaveError(result.error);
      return;
    }

    session.replaceDocument(result.document, { resetHistory: true });
    setExternalChangeAt(null);
    setSaveError(null);
    setDirty(false);
  }, [project.rootPath, session]);

  const dismissExternalChange = useCallback(() => {
    setExternalChangeAt(null);
  }, []);

  return {
    state,
    save,
    reloadFromDisk,
    dismissExternalChange,
  };
};
