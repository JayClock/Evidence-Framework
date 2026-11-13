import { useState } from 'react';
import type { LiveDeliveryPreview } from '../../../shared/delivery';

const CHANGE_LABELS = {
  added: '新增',
  removed: '移除',
  modified: '修改',
  unchanged: '未变',
};

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
  const changed = diff.routes.filter(
    (route) => route.changeType !== 'unchanged',
  );
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
        新增 {diff.summary.routesAdded} · 移除 {diff.summary.routesRemoved} ·
        修改 {diff.summary.routesModified} · 破坏性变更{' '}
        {diff.summary.breakingChangeCount}
      </p>
      <p className="text-evidence-muted">
        差异相对于打开编辑器时的模型；保存或刷新不确认新基线。导航链接仅表示可能的调用，不代表运行时授权。
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
      {diff.summary.hasBreakingChanges ? (
        <p role="alert" className="rounded bg-amber-50 p-2 text-amber-800">
          检测到破坏性变更，请确认调用方迁移方案；当前未授权发布。
        </p>
      ) : null}
      {changed.length === 0 ? (
        <p>无路由变更</p>
      ) : (
        changed.map((route) => (
          <article
            key={route.id}
            className={`rounded border p-3 ${route.breaking ? 'border-amber-400' : route.changeType === 'added' ? 'border-green-300' : 'border-evidence-line'}`}
          >
            <h3 className="font-medium">
              [{CHANGE_LABELS[route.changeType]}]{' '}
              <code>
                {route.method} {route.path}
              </code>
            </h3>
            {route.previousPath === undefined ? null : (
              <p>原路径：{route.previousPath}</p>
            )}
            <p>
              服务：{route.serviceId} · 角色：
              {(route.after ?? route.before)?.allowedPartyRoleRefs.join('、') ||
                '内部操作'}
            </p>
            {route.changeType === 'removed' || onFocusEntity === undefined ? (
              <code>{route.entityRef}</code>
            ) : (
              <button
                type="button"
                disabled={stale}
                className="text-evidence-accent underline"
                onClick={() => onFocusEntity(route.entityRef)}
              >
                定位模型：{route.entityRef}
              </button>
            )}
            {route.fieldDiffs.length === 0 ? null : (
              <ul aria-label="字段变更" className="mt-2 space-y-1">
                {route.fieldDiffs.map((field) => (
                  <li key={field.name}>
                    <code>{field.name}</code>：
                    {field.shifted === 'to_derived'
                      ? 'Input → CEL Derived（已从请求体剔除）'
                      : field.shifted === 'to_caller'
                        ? 'CEL Derived → Input（需复核输入要求）'
                        : CHANGE_LABELS[field.changeType]}
                    {field.before &&
                    field.after &&
                    field.before.valueType !== field.after.valueType
                      ? ` · ${field.before.valueType} → ${field.after.valueType}`
                      : ''}
                    {field.after?.ruleExpression === undefined ? null : (
                      <code className="ml-2 text-purple-700">
                        {field.after.ruleRef}: {field.after.ruleExpression}
                      </code>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {route.breakingChanges.map((breaking, index) => (
              <p
                key={`${breaking.kind}:${index}`}
                className="mt-1 text-amber-800"
              >
                {breaking.kind}：{breaking.description} ·{' '}
                {breaking.remediationHint}
              </p>
            ))}
          </article>
        ))
      )}
      {diff.hypermediaLinks.length === 0 ? null : (
        <section aria-label="导航链接变更">
          <h3 className="font-medium">导航链接</h3>
          {diff.hypermediaLinks.map((link) => (
            <p key={`${link.sourceRouteId}:${link.rel}:${link.targetPath}`}>
              <span>{CHANGE_LABELS[link.changeType]}</span> · {link.rel} →{' '}
              <code>{link.targetPath}</code>
            </p>
          ))}
        </section>
      )}
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
