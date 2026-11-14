import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelSession } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type {
  LiveDeliveryInput,
  LiveDeliveryPreview,
} from '../../shared/delivery';
import type {
  DeliveryPreview,
  ExportDeliveryResult,
} from '../../shared/projects';

export interface DeliveryNotice {
  tone: 'saved' | 'failed';
  message: string;
}

export interface DeliveryHubController {
  loading: boolean;
  stale: boolean;
  error: string | null;
  preview: DeliveryPreview | null;
  analysis: LiveDeliveryPreview | null;
  busy: boolean;
  notice: DeliveryNotice | null;
  exportDelivery: () => Promise<void>;
  dismissNotice: () => void;
}

const noticeOf = (result: ExportDeliveryResult): DeliveryNotice | null => {
  switch (result.status) {
    case 'saved':
      return {
        tone: 'saved',
        message: `已写入草稿 ${result.directory}：${result.files.join('、')}`,
      };
    case 'failed':
      return { tone: 'failed', message: `导出失败：${result.error}` };
    default:
      return null;
  }
};

/** One subscription for the editor lifetime, not the modal lifetime. */
export const useDeliveryHub = (
  rootPath: string,
  session: ModelSession,
  baseDocument: DomainModelDocument,
  enabled = true,
): DeliveryHubController => {
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<LiveDeliveryPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<DeliveryNotice | null>(null);
  const generation = useRef(0);
  const accepted = useRef<{
    input: LiveDeliveryInput;
    analysis: LiveDeliveryPreview;
  } | null>(null);

  useEffect(() => {
    accepted.current = null;
    setAnalysis(null);
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const revision = ++generation.current;
      accepted.current = null;
      setStale(true);
      setLoading(true);
      setError(null);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const input: LiveDeliveryInput = {
          rootPath,
          revision,
          document: session.getDocument(),
          baseDocument,
        };
        void window.evidenceAPI.projects
          .deliveryLivePreview(input)
          .then((result) => {
            if (!active || revision !== generation.current) return;
            if (!result.success) throw new Error(result.error);
            if (result.analysis.revision !== revision)
              throw new Error('API 预览版本不匹配。');
            accepted.current = { input, analysis: result.analysis };
            setAnalysis(result.analysis);
            setStale(false);
          })
          .catch((cause: unknown) => {
            if (!active || revision !== generation.current) return;
            setAnalysis(null);
            setError(cause instanceof Error ? cause.message : String(cause));
          })
          .finally(() => {
            if (active && revision === generation.current) setLoading(false);
          });
      }, 150);
    };
    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'document-changed') refresh();
    });
    refresh();
    return () => {
      active = false;
      ++generation.current;
      accepted.current = null;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [rootPath, session, baseDocument, enabled]);

  const exportDelivery = useCallback(async () => {
    const current = accepted.current;
    if (busy || current === null || !current.analysis.canExportDraft) return;
    setBusy(true);
    setNotice(null);
    try {
      setNotice(
        noticeOf(
          await window.evidenceAPI.projects.exportLiveDelivery({
            ...current.input,
            expectedModelDigest: current.analysis.modelDigest,
          }),
        ),
      );
    } catch (cause) {
      setNotice({
        tone: 'failed',
        message: `导出失败：${cause instanceof Error ? cause.message : String(cause)}`,
      });
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return {
    loading,
    stale,
    error,
    analysis,
    preview: analysis?.preview ?? null,
    busy,
    notice,
    exportDelivery,
    dismissNotice: () => setNotice(null),
  };
};
