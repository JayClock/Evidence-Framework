import { useCallback, useRef, useState } from 'react';

import type { ExportReviewResult } from '../../shared/projects';

/** What the header shows after an export attempt. */
export interface ReviewExportNotice {
  tone: 'saved' | 'failed';
  message: string;
}

export interface ReviewExportController {
  busy: boolean;
  notice: ReviewExportNotice | null;
  /** Writes the offline review page, asking the user where to put it. */
  exportPage: (diff?: boolean) => Promise<void>;
  dismissNotice: () => void;
}

const messageOf = (result: ExportReviewResult): ReviewExportNotice | null => {
  switch (result.status) {
    case 'saved':
      return {
        tone: 'saved',
        message: `已导出审查页：${result.path}`,
      };
    case 'failed':
      return { tone: 'failed', message: `导出失败：${result.error}` };
    default:
      // A cancelled dialog is not a result worth reporting.
      return null;
  }
};

/**
 * Exports the offline review page for one project.
 *
 * The main process owns the dialog and the generation, so this only tracks the
 * in-flight state and the outcome: the renderer never reads the model tree, and
 * a slow generation cannot block the canvas.
 */
export const useReviewExport = (rootPath: string): ReviewExportController => {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ReviewExportNotice | null>(null);

  const pending = useRef(false);
  const exportPage = useCallback(
    async (diff = false) => {
      if (pending.current) return;
      pending.current = true;
      setBusy(true);
      setNotice(null);

      try {
        const result = await (diff
          ? window.evidenceAPI.projects.exportDiffReview(rootPath)
          : window.evidenceAPI.projects.exportReview(rootPath));

        setNotice(messageOf(result));
      } catch (error) {
        setNotice({
          tone: 'failed',
          message: `导出失败：${error instanceof Error ? error.message : '未知错误。'}`,
        });
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [rootPath],
  );

  return {
    busy,
    notice,
    exportPage,
    dismissNotice: () => setNotice(null),
  };
};
