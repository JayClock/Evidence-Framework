import { useCallback, useEffect, useState } from 'react';

import type { SensorReport } from '@evidence-poc/evidence-agent/browser';

export interface SensorsState {
  report: SensorReport | null;
  loading: boolean;
  error: string | null;
}

export interface SensorsController extends SensorsState {
  /** Runs the sensors now, ignoring the main process debounce. */
  refresh: () => Promise<void>;
}

/**
 * Reads the sensor verdict the main process publishes.
 *
 * The first load runs the sensors once so an opened project never shows a
 * blank gate; later verdicts arrive from the debounced background run.
 */
export const useSensorsState = (rootPath: string): SensorsController => {
  const [state, setState] = useState<SensorsState>({
    report: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));

    try {
      const report = await window.evidenceAPI.agent.triggerSensors({
        rootPath,
      });

      setState({ report, loading: false, error: null });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : '无法运行检查器。',
      }));
    }
  }, [rootPath]);

  useEffect(() => {
    let active = true;

    const unsubscribe = window.evidenceAPI.agent.onReport((payload) => {
      if (active && payload.rootPath === rootPath) {
        setState({ report: payload.report, loading: false, error: null });
      }
    });

    void window.evidenceAPI.agent
      .latestReport({ rootPath })
      .then(async (report) => (report === null ? undefined : report))
      .then((report) => {
        if (!active) {
          return;
        }

        if (report === undefined) {
          void refresh();

          return;
        }

        setState({ report, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (active) {
          setState((current) => ({
            ...current,
            loading: false,
            error:
              error instanceof Error ? error.message : '无法读取检查结果。',
          }));
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [rootPath, refresh]);

  return { ...state, refresh };
};
