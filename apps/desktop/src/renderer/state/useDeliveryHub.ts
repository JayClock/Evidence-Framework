import { useCallback, useEffect, useState } from 'react';

import type {
  DeliveryPreview,
  ExportDeliveryResult,
} from '../../shared/projects';

/** What the hub shows after an export attempt. */
export interface DeliveryNotice {
  tone: 'saved' | 'failed';
  message: string;
}

export interface DeliveryHubController {
  loading: boolean;
  /** Why the preview could not be read; the hub offers no export then. */
  error: string | null;
  preview: DeliveryPreview | null;
  busy: boolean;
  notice: DeliveryNotice | null;
  /** Writes the delivery documents into a folder the user picks. */
  exportDelivery: () => Promise<void>;
  dismissNotice: () => void;
}

const noticeOf = (result: ExportDeliveryResult): DeliveryNotice | null => {
  switch (result.status) {
    case 'saved':
      return {
        tone: 'saved',
        message: `已写入 ${result.directory}：${result.files.join('、')}（${result.serviceCount} 个服务，${result.routeCount} 条路由）`,
      };
    case 'failed':
      return { tone: 'failed', message: `导出失败：${result.error}` };
    default:
      return null;
  }
};

/**
 * Reads the delivery preview and exports it.
 *
 * Both calls run in the main process, so the hub never reads the model tree: what
 * it lists is the projection the export writes, and a model that cannot be
 * projected shows the error instead of an empty promise.
 */
export const useDeliveryHub = (
  rootPath: string,
  enabled: boolean,
): DeliveryHubController => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeliveryPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<DeliveryNotice | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;

    setLoading(true);
    setError(null);

    void window.evidenceAPI.projects
      .deliveryPreview(rootPath)
      .then((result) => {
        if (!active) {
          return;
        }

        if (result.success) {
          setPreview(result.preview);
        } else {
          setPreview(null);
          setError(result.error);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [enabled, rootPath]);

  const exportDelivery = useCallback(async () => {
    setBusy(true);
    setNotice(null);

    try {
      setNotice(noticeOf(await window.evidenceAPI.projects.exportDelivery(rootPath)));
    } catch (cause) {
      setNotice({
        tone: 'failed',
        message: `导出失败：${cause instanceof Error ? cause.message : '未知错误。'}`,
      });
    } finally {
      setBusy(false);
    }
  }, [rootPath]);

  return {
    loading,
    error,
    preview,
    busy,
    notice,
    exportDelivery,
    dismissNotice: () => setNotice(null),
  };
};
