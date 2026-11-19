import { useState } from 'react';
import {
  Button,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@evidence-poc/desktop-ui-kit';
import { CodePreviewPane } from './CodePreviewPane';
import { ContractOverview } from './ContractOverview';
import { IncrementalDiffPanel } from './IncrementalDiffPanel';
import type { DeliveryHubController } from '../../state/useDeliveryHub';

const artifactTitles = new Map([
  ['openapi.json', 'OpenAPI 契约'],
  ['topology.json', '服务拓扑'],
  ['routes.json', '路由清单'],
  ['deployment.compose.json', '部署拓扑'],
  ['projection.json', '完整模型投影'],
  ['http-journeys.json', 'HTTP 旅程定义'],
  ['limitations.md', '尚未闭环的能力'],
  ['api-changes.md', 'API 变更日志'],
  ['draft-status.json', '草稿状态与诊断'],
]);

export interface DeliveryHubProps {
  hub: DeliveryHubController;
  projectName: string;
  dirty: boolean;
  externalChange: boolean;
  onFocusEntity?: (entityRef: string) => void;
  onClose: () => void;
  onRestoreFocus: () => void;
}

export const DeliveryHub = ({
  hub,
  projectName,
  dirty,
  externalChange,
  onClose,
  onFocusEntity,
  onRestoreFocus,
}: DeliveryHubProps) => {
  const [view, setView] = useState<'artifacts' | 'overview' | 'diff'>(
    'artifacts',
  );
  const [path, setPath] = useState('openapi.json');
  const { analysis } = hub;
  const artifacts = analysis?.artifacts ?? [];
  const artifact = artifacts.find((item) => item.path === path) ?? artifacts[0];
  const current = analysis !== null && !hub.loading && !hub.stale && !hub.error;
  const status = hub.error
    ? '投影失败'
    : !current
      ? '正在投影当前模型…'
      : externalChange
        ? '检测到磁盘变更 · 仍基于编辑会话'
        : dirty
          ? '基于未保存的模型草稿'
          : '基于当前编辑会话';
  const blocked = current
    ? analysis.issues.filter((issue) => issue.severity === 'block').length
    : 0;
  const warnings = current
    ? analysis.issues.filter((issue) => issue.severity === 'warn').length
    : 0;
  const gateLabel = !current
    ? '—'
    : blocked
      ? `${blocked} 项阻断`
      : warnings
        ? `${warnings} 项警告`
        : '无 API 阻断';
  const diffLabel =
    !current || !analysis.apiSummary.hasBaseline
      ? '—'
      : `${analysis.apiSummary.breakingChangeCount} 项`;
  const exportButton = (
    <Button
      variant="default"
      size="xs"
      loading={hub.busy}
      disabled={
        hub.busy || !current || !analysis.canExportDraft || !artifacts.length
      }
      onClick={() => void hub.exportDelivery()}
    >
      {hub.busy ? '导出中…' : '导出当前草稿'}
    </Button>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        fullScreen
        showClose={false}
        aria-describedby={undefined}
        className="flex min-h-0 flex-col bg-workbench-background"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="evidence-drag-region flex min-h-12 shrink-0 items-center justify-between gap-4 border-b border-workbench-border bg-white py-1 pr-4 pl-[var(--evidence-traffic-light-space)]">
          <div className="evidence-no-drag flex min-w-0 items-center gap-2 text-xs">
            <span className="truncate font-semibold" title={projectName}>
              {projectName}
            </span>
            <span aria-hidden="true" className="text-workbench-border-strong">
              /
            </span>
            <DialogTitle className="shrink-0 text-xs">
              交付与导出中枢
            </DialogTitle>
          </div>
          <div className="evidence-no-drag flex shrink-0 items-center gap-3">
            <span
              role="status"
              className={cn(
                'rounded-full border px-2 py-1 text-[11px]',
                current && !externalChange
                  ? 'border-evidence-line bg-workbench-background text-workbench-muted'
                  : 'border-amber-200 bg-amber-50 text-amber-900',
              )}
            >
              {status}
            </span>
            <DialogClose asChild>
              <Button>返回工作台</Button>
            </DialogClose>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,min(34%,440px))_minmax(0,1fr)] gap-4 p-4 xl:gap-6 xl:px-8 xl:py-6">
          <aside
            className="min-h-0 min-w-0 overflow-auto overscroll-contain p-0.5"
            aria-label="交付导航"
          >
            <dl className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-workbench-border bg-white p-3">
                <dt className="text-[11px] text-workbench-muted">
                  API 草稿校验
                </dt>
                <dd className="text-lg font-semibold">{gateLabel}</dd>
              </div>
              <div className="rounded-lg border border-workbench-border bg-white p-3">
                <dt className="text-[11px] text-workbench-muted">
                  会话破坏性变更
                </dt>
                <dd className="text-lg font-semibold">{diffLabel}</dd>
              </div>
            </dl>
            <div
              role="group"
              aria-label="交付视图"
              className="mb-4 flex flex-wrap gap-2"
            >
              <Button
                aria-pressed={view === 'overview'}
                variant={view === 'overview' ? 'default' : 'outline'}
                onClick={() => setView('overview')}
              >
                契约全览
              </Button>
              <Button
                aria-pressed={view === 'diff'}
                variant={view === 'diff' ? 'default' : 'outline'}
                onClick={() => setView('diff')}
              >
                本次增量变更
                {current && analysis.diff.hasBreakingChanges ? ' ⚠' : ''}
              </Button>
            </div>
            <h2 className="mb-2 text-sm font-semibold">可导出工程产物</h2>
            {artifacts.length ? (
              <ul className="flex flex-col gap-2">
                {artifacts.map((item) => (
                  <li key={item.path}>
                    <button
                      type="button"
                      aria-pressed={
                        view === 'artifacts' && item.path === artifact?.path
                      }
                      className="flex w-full flex-col gap-0.5 rounded-lg border border-workbench-border bg-white px-3 py-2 text-left hover:bg-workbench-subtle focus-visible:outline-2 focus-visible:outline-evidence-accent aria-pressed:border-evidence-accent aria-pressed:bg-evidence-active"
                      onClick={() => {
                        setPath(item.path);
                        setView('artifacts');
                      }}
                    >
                      <span className="text-xs font-semibold">
                        {artifactTitles.get(item.path) ?? item.path}
                      </span>
                      <code
                        className="max-w-full truncate text-[11px] text-workbench-muted"
                        title={item.path}
                      >
                        {item.path}
                      </code>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-workbench-muted">
                {hub.error ? '暂无法读取产物。' : '等待产物投影。'}
              </p>
            )}
          </aside>
          <div className="flex min-h-0 min-w-0 flex-col overflow-clip rounded-lg border border-workbench-border bg-white">
            <p className="border-b border-workbench-border px-4 py-2 text-[11px] text-workbench-muted">
              会话基线：打开编辑器时的模型；保存不会重置差异。当前产物仅供草稿交付，不代表已授权发布。
              {hub.stale && artifact
                ? ' 当前显示上一次投影，暂不可复制或导出。'
                : ''}
            </p>
            {hub.notice ? (
              <p
                role={hub.notice.tone === 'failed' ? 'alert' : 'status'}
                className="border-b border-workbench-border px-4 py-2 text-xs [overflow-wrap:anywhere]"
              >
                {hub.notice.message}
              </p>
            ) : null}
            {hub.error ? (
              <p
                role="alert"
                className="px-4 py-2 text-xs whitespace-pre-wrap text-red-800"
              >
                {hub.error}
              </p>
            ) : null}
            {view === 'artifacts' && artifact ? (
              <CodePreviewPane
                key={`${analysis?.revision}:${artifact.path}`}
                artifact={artifact}
                version={
                  artifact.path === 'openapi.json'
                    ? analysis?.openapi.openapi
                    : undefined
                }
                stale={!current}
                actions={exportButton}
              />
            ) : (
              <>
                <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-workbench-border px-4 py-1">
                  <h2 className="text-xs font-semibold">
                    {view === 'diff'
                      ? '本次增量变更'
                      : view === 'overview'
                        ? '契约全览'
                        : '产物预览'}
                  </h2>
                  {exportButton}
                </div>
                <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
                  {view === 'diff' && analysis ? (
                    <IncrementalDiffPanel
                      analysis={analysis}
                      stale={!current}
                      {...(onFocusEntity ? { onFocusEntity } : {})}
                    />
                  ) : view === 'overview' && hub.preview ? (
                    <ContractOverview
                      preview={hub.preview}
                      bindings={analysis?.bindings ?? []}
                    />
                  ) : (
                    <p className="p-4 text-xs text-workbench-muted">暂无预览</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
