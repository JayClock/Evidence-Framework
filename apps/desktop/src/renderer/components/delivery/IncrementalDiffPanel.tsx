import { useState } from 'react';
import type { LiveDeliveryPreview } from '../../../shared/delivery';

export const IncrementalDiffPanel = ({
  analysis,
  stale,
  onFocusEntity,
}: {
  analysis: LiveDeliveryPreview;
  stale: boolean;
  onFocusEntity?: (entityRef: string) => void;
}) => {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const { diff } = analysis;
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('剪贴板不可用');
      await navigator.clipboard.writeText(analysis.changeLog);
      setCopyNotice('已复制变更日志');
    } catch (error) {
      setCopyNotice(
        `复制失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  return (
    <section aria-label="API 增量变更" className="space-y-3 p-5 text-[11px]">
      <p>
        基线摘要 <code>{analysis.baseModelDigest.slice(0, 20)}</code> → 当前{' '}
        <code>{analysis.modelDigest.slice(0, 20)}</code>
      </p>
      <p>
        契约变更 {diff.changes.length} · 破坏性变更{' '}
        {diff.changes.filter((change) => change.level >= 2).length}
      </p>
      <p className="text-evidence-muted">
        差异相对于打开编辑器时的模型；保存或刷新不确认新基线。 OpenAPI
        兼容性不代表业务规则、角色权限或履约语义兼容；这些仍需业务验收。
      </p>
      <button
        type="button"
        disabled={stale}
        onClick={() => void copy()}
        className="rounded border px-2 py-1 disabled:opacity-40"
      >
        复制 Markdown 变更日志
      </button>
      {copyNotice === null ? null : <p role="status">{copyNotice}</p>}
      {diff.hasBreakingChanges ? (
        <p role="alert" className="rounded bg-amber-50 p-2 text-amber-800">
          检测到破坏性变更，请确认调用方方案；当前未授权发布。
        </p>
      ) : null}
      {diff.changes.length === 0 ? (
        <p>无契约兼容性变更</p>
      ) : (
        diff.changes.map((change, index) => {
          const binding = analysis.bindings.find(
            (item) =>
              item.path === change.path && item.method === change.operation,
          );
          return (
            <article
              key={`${change.id}:${index}`}
              className="rounded border p-3"
            >
              <h3>
                <code>
                  {change.operation} {change.path}
                </code>
              </h3>
              <p>
                [
                {change.level === 3
                  ? 'ERR'
                  : change.level === 2
                    ? 'WARN'
                    : 'INFO'}
                ] {change.id}: {change.text}
              </p>
              {binding === undefined || onFocusEntity === undefined ? null : (
                <button
                  type="button"
                  disabled={stale}
                  onClick={() => onFocusEntity(binding.entityRef)}
                >
                  定位模型：{binding.entityRef}
                </button>
              )}
            </article>
          );
        })
      )}
      <details>
        <summary>完整 OpenAPI 差异</summary>
        <pre className="overflow-auto">
          {JSON.stringify(diff.details, null, 2)}
        </pre>
      </details>
      <section aria-label="API 待决项">
        <h3 className="font-medium">API 覆盖与诊断</h3>
        <p>
          覆盖率 {(analysis.apiSummary.coverageRatio * 100).toFixed(0)}% ·{' '}
          {analysis.apiSummary.totalRoutes} 条路由
        </p>
        {analysis.issues
          .filter((issue) => issue.code !== 'API_ALIGNED')
          .map((issue) => (
            <p key={issue.issueId} className="mt-1">
              [{issue.severity}] {issue.message} {issue.suggestion}
            </p>
          ))}
      </section>
    </section>
  );
};
