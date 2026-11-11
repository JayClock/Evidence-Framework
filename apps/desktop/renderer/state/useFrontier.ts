import { useCallback, useEffect, useRef, useState } from 'react';

import {
  calculateFrontier,
  type DependencyFrontier,
  type InterviewTraceDocument,
} from '@evidence-poc/evidence-modeling-orchestrator';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

export interface FrontierState {
  frontier: DependencyFrontier | null;
  loading: boolean;
  error: string | null;
}

export interface FrontierController extends FrontierState {
  reload: () => void;
}

/**
 * Projects the interview trace onto the current model.
 *
 * The pure `calculateFrontier` owns the business read; this hook only fetches
 * the trace and keeps the entity ids in step with the live document, so a
 * dangling reference shows up as soon as the model changes.
 */
export const useFrontier = (
  rootPath: string,
  document: DomainModelDocument,
): FrontierController => {
  const [state, setState] = useState<FrontierState>({
    frontier: null,
    loading: true,
    error: null,
  });
  const [token, setToken] = useState(0);
  const entityIdsRef = useRef<readonly string[]>([]);
  entityIdsRef.current = document.entities.map((entity) => entity.id);

  useEffect(() => {
    let active = true;

    setState((current) => ({ ...current, loading: true }));

    void window.evidenceAPI.agent
      .readInterviewTrace({ rootPath })
      .then((result) => {
        if (!active) {
          return;
        }

        if (result.success === false) {
          setState({ frontier: null, loading: false, error: result.error });

          return;
        }

        setState({
          frontier:
            result.trace === null
              ? null
              : calculateFrontier({
                  trace: result.trace as InterviewTraceDocument,
                  entityIds: entityIdsRef.current,
                }),
          loading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setState({
          frontier: null,
          loading: false,
          error: error instanceof Error ? error.message : '无法读取追溯日志。',
        });
      });

    return () => {
      active = false;
    };
  }, [rootPath, token]);

  const reload = useCallback(() => {
    setToken((current) => current + 1);
  }, []);

  return { ...state, reload };
};
