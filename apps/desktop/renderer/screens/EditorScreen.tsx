import { useEffect, useState } from 'react';

import type { EvidenceProjectSummary } from '../../shared/projects';

type Status =
  | { name: 'loading' }
  | { name: 'ready'; project: EvidenceProjectSummary }
  | { name: 'error'; message: string };

/**
 * Placeholder workspace: the interactive canvas, inspector and status bar land
 * in the following commits of Phase 2.
 */
export const EditorScreen = ({ rootPath }: { rootPath: string }) => {
  const [status, setStatus] = useState<Status>({ name: 'loading' });

  useEffect(() => {
    let active = true;

    void window.evidenceAPI.projects.open(rootPath).then((result) => {
      if (!active) {
        return;
      }

      setStatus(
        result.success
          ? { name: 'ready', project: result.project }
          : { name: 'error', message: result.error },
      );
    });

    return () => {
      active = false;
    };
  }, [rootPath]);

  return (
    <div className="flex h-full flex-col bg-evidence-surface">
      <header className="evidence-drag-region flex h-12 shrink-0 items-center border-b border-evidence-line bg-white/80 pl-[var(--evidence-traffic-light-space)]">
        <span className="text-[13px] font-medium text-evidence-ink">
          {status.name === 'ready' ? status.project.name : '加载模型…'}
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center px-8 text-center">
        {status.name === 'error' ? (
          <p className="max-w-xl text-[12px] whitespace-pre-wrap text-[#b42318]">
            {status.message}
          </p>
        ) : status.name === 'ready' ? (
          <div>
            <p className="text-[13px] text-evidence-ink">
              已加载 {status.project.entityCount} 个业务对象、
              {status.project.relationshipCount} 条关系、
              {status.project.ruleCount} 条规则。
            </p>
            <p className="mt-2 text-[11px] text-evidence-muted">
              {status.project.modelRoot}
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-evidence-muted">正在读取源树…</p>
        )}
      </main>
    </div>
  );
};
