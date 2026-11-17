import type { EvidenceDriftApi } from '@evidence-poc/desktop-contracts/drift';
import { useCallback, useState } from 'react';
import type {
  McpDriftAudit,
  TraceDialogResult,
} from '@evidence-poc/desktop-contracts/drift';

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

export const useDriftAudit = (
  api: EvidenceDriftApi,
  rootPath: string,
): DriftController => {
  const [state, setState] = useState<DriftState>(initialDrift);

  const auditPath = useCallback(
    async (tracePath: string) => {
      setState((current) => ({ ...current, loading: true, error: null }));

      try {
        const audit = await api.drift({
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
    [api, rootPath],
  );

  const pickAndAudit = useCallback(async () => {
    const picked: TraceDialogResult = await api.pickTrace();

    if (picked.canceled) {
      return;
    }

    await auditPath(picked.path);
  }, [api, auditPath]);

  return { ...state, pickAndAudit, auditPath };
};
