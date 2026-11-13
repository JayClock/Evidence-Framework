import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  McpDriftAudit,
  McpScenarioReplay,
  TraceDialogResult,
} from '../../shared/simulation';

/**
 * Playing a scenario back, one frame at a time.
 *
 * The replay itself is computed in the main process from the saved sources; the
 * hook only decides which frame is on screen. Playback is a cursor rather than a
 * timer, so stepping forward twice always shows the same two frames — a
 * sandbox that drifted on its own would be the one thing an audit cannot use.
 */
export interface SimulationState {
  replay: McpScenarioReplay | null;
  /** Scenario whose frames were requested; null means summaries only. */
  scenarioId: string | null;
  /** Index into `replay.frames`; -1 before the first step. */
  cursor: number;
  loading: boolean;
  error: string | null;
}

export interface SimulationController extends SimulationState {
  frame: McpScenarioReplay['frames'][number] | null;
  /** Frame index the canvas should mark as current, when any. */
  currentInstanceRef: string | null;
  load: (scenarioId?: string) => Promise<void>;
  stepForward: () => void;
  stepBack: () => void;
  reset: () => void;
  /** True once the last frame is on screen. */
  atEnd: boolean;
}

const initialState: SimulationState = {
  replay: null,
  scenarioId: null,
  cursor: -1,
  loading: false,
  error: null,
};

/** Reads a replay for one project, and holds the playback cursor. */
export const useSimulationReplay = (
  rootPath: string,
  enabled: boolean,
): SimulationController => {
  const [state, setState] = useState<SimulationState>(initialState);
  // A reply that arrives after the panel closed must not reopen a frame.
  const requestRef = useRef(0);

  const load = useCallback(
    async (scenarioId?: string) => {
      requestRef.current += 1;
      const request = requestRef.current;

      setState((current) => ({ ...current, loading: true, error: null }));

      try {
        const replay = await window.evidenceAPI.simulation.replay({
          rootPath,
          ...(scenarioId === undefined ? {} : { scenarioId }),
        });

        if (request !== requestRef.current) {
          return;
        }

        setState({
          replay,
          scenarioId: scenarioId ?? null,
          cursor: replay.frames.length === 0 ? -1 : 0,
          loading: false,
          error: null,
        });
      } catch (cause) {
        if (request !== requestRef.current) {
          return;
        }

        setState((current) => ({
          ...current,
          loading: false,
          error: cause instanceof Error ? cause.message : '无法回放场景。',
        }));
      }
    },
    [rootPath],
  );

  useEffect(() => {
    if (!enabled) {
      setState(initialState);

      return;
    }

    void load();
  }, [enabled, load]);

  const frames = state.replay?.frames ?? [];
  const frame =
    state.cursor >= 0 && state.cursor < frames.length
      ? (frames[state.cursor] ?? null)
      : null;

  return {
    ...state,
    frame,
    currentInstanceRef: frame?.instanceRef ?? null,
    atEnd: frames.length > 0 && state.cursor >= frames.length - 1,
    load,
    stepForward: () =>
      setState((current) => {
        const total = current.replay?.frames.length ?? 0;

        return total === 0
          ? current
          : { ...current, cursor: Math.min(total - 1, current.cursor + 1) };
      }),
    stepBack: () =>
      setState((current) => ({
        ...current,
        cursor: Math.max(0, current.cursor - 1),
      })),
    reset: () => setState((current) => ({ ...current, cursor: 0 })),
  };
};

/** Reading one exported trace against the saved model. */
export interface DriftState {
  audit: McpDriftAudit | null;
  /** File the audit read, so a reader can tell two runs apart. */
  tracePath: string | null;
  loading: boolean;
  error: string | null;
}

export interface DriftController extends DriftState {
  /** Picks a trace file and audits it. Cancelling keeps the previous result. */
  pickAndAudit: () => Promise<void>;
  auditPath: (tracePath: string) => Promise<void>;
}

const initialDrift: DriftState = {
  audit: null,
  tracePath: null,
  loading: false,
  error: null,
};

export const useDriftAudit = (rootPath: string): DriftController => {
  const [state, setState] = useState<DriftState>(initialDrift);

  const auditPath = useCallback(
    async (tracePath: string) => {
      setState((current) => ({ ...current, loading: true, error: null }));

      try {
        const audit = await window.evidenceAPI.simulation.drift({
          rootPath,
          tracePath,
        });

        setState({ audit, tracePath, loading: false, error: null });
      } catch (cause) {
        setState((current) => ({
          ...current,
          loading: false,
          error: cause instanceof Error ? cause.message : '无法比对 trace。',
        }));
      }
    },
    [rootPath],
  );

  const pickAndAudit = useCallback(async () => {
    const picked: TraceDialogResult =
      await window.evidenceAPI.simulation.pickTrace();

    if (picked.canceled) {
      return;
    }

    await auditPath(picked.path);
  }, [auditPath]);

  return { ...state, pickAndAudit, auditPath };
};
