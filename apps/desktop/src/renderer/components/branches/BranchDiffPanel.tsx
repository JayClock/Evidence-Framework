import type {
  DiffChangeType,
  ModelDiff,
} from '@evidence-poc/evidence-model-core/browser';
import type { VerdictDiff } from '@evidence-poc/evidence-modeling-orchestrator/browser';

import type { EvidenceBranchSummary } from '../../../shared/branches';

interface BranchDiffPanelProps {
  branches: readonly EvidenceBranchSummary[];
  activeBranchId: string;
  compareBranchId: string;
  diff: ModelDiff;
  verdict: VerdictDiff;
  busy: boolean;
  onClose: () => void;
  /** Adopts the compared branch as the decision. */
  onMerge: (branchId: string) => void;
  /** Jumps to one object of the compared branch in the canvas. */
  onFocusNode: (nodeId: string) => void;
}

const CHANGE_LABEL: Record<DiffChangeType, string> = {
  added: '新增',
  removed: '删除',
  modified: '修改',
  unchanged: '未变',
};

const changeClass = (changeType: DiffChangeType): string =>
  changeType === 'added'
    ? 'text-[#15803d]'
    : changeType === 'removed'
      ? 'text-[#b42318]'
      : changeType === 'modified'
        ? 'text-[#8d6200]'
        : 'text-evidence-muted';

const branchNameOf = (
  branches: readonly EvidenceBranchSummary[],
  branchId: string,
): string =>
  branches.find((branch) => branch.id === branchId)?.name ?? branchId;

const sourceLabel = (source: string | undefined): string => {
  if (source === undefined) {
    return '未建模';
  }

  const labels: Record<string, string> = {
    derived: '派生规则',
    'contract-term': '合同参数',
    'domain-source': '领域对象',
    'negotiation-source': '协商来源',
    'result-fact': '结果事实',
    'request-input': '请求形成',
    'needs-decision': '待决',
    other: '未归类',
  };

  return labels[source] ?? source;
};

const verdictLine = (
  label: string,
  snapshot: VerdictDiff['base'],
): string =>
  snapshot === null
    ? `${label}：未运行检查`
    : `${label}：阻塞 ${snapshot.blockCount} · 警告 ${snapshot.warnCount} · 待决 ${snapshot.decisionOwedCount}`;

/**
 * Structural and verdict difference between the checkout and one other branch.
 *
 * The panel only reports what the two trees and their stored verdicts say: it
 * never re-runs the sensors for a branch nobody is editing, and a branch without
 * a verdict says so instead of inheriting the active one.
 */
export const BranchDiffPanel = ({
  branches,
  activeBranchId,
  compareBranchId,
  diff,
  verdict,
  busy,
  onClose,
  onMerge,
  onFocusNode,
}: BranchDiffPanelProps) => {
  const changedEntities = diff.entities.filter(
    (entity) => entity.changeType !== 'unchanged',
  );
  const changedRules = diff.rules.filter((rule) => rule.changeType !== 'unchanged');
  const changedRelationships = diff.relationships.filter(
    (relationship) => relationship.changeType !== 'unchanged',
  );
  const target = branches.find((branch) => branch.id === compareBranchId);

  return (
    <aside
      aria-label="分支对比"
      className="flex h-full min-h-0 w-[300px] shrink-0 flex-col border-l border-evidence-line bg-white/85"
    >
      <div className="flex items-start justify-between gap-2 border-b border-evidence-line px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] tracking-wide text-evidence-muted uppercase">
            分支对比
          </p>
          <p className="truncate text-[11px] font-medium text-evidence-ink">
            {branchNameOf(branches, activeBranchId)} ↔{' '}
            {branchNameOf(branches, compareBranchId)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-evidence-line px-1.5 py-0.5 text-[10px] text-evidence-muted hover:bg-[#f1f3f6]"
        >
          关闭
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <section aria-label="变动概览">
          <p className="text-[10px] tracking-wide text-evidence-muted uppercase">
            变动概览
          </p>
          <p className="mt-1 text-[11px] text-evidence-ink">
            新增 {diff.summary.addedCount} · 删除 {diff.summary.removedCount} ·
            修改 {diff.summary.modifiedCount}
          </p>
          <p className="text-[11px] text-evidence-muted">
            关键数据变动 {diff.summary.keyDataChangedCount} · 待决{' '}
            {diff.summary.decisionOwedBase} → {diff.summary.decisionOwedTarget}
          </p>
        </section>

        <section aria-label="门禁对比" className="mt-3">
          <p className="text-[10px] tracking-wide text-evidence-muted uppercase">
            门禁对比
          </p>
          {verdict.comparable ? (
            <>
              <p className="mt-1 text-[11px] text-evidence-muted">
                {verdictLine('主干', verdict.base)}
              </p>
              <p className="text-[11px] text-evidence-muted">
                {verdictLine('对比分支', verdict.target)}
              </p>
              {verdict.gateImproved ? (
                <p className="text-[11px] text-[#15803d]">
                  对比分支已具备阶段门禁条件。
                </p>
              ) : null}
              {verdict.gateRegressed ? (
                <p className="text-[11px] text-[#b42318]">
                  对比分支关闭了阶段门禁。
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-[11px] text-evidence-muted">
              两边尚未逐一运行检查，门禁结论不可比。切到该分支跑一轮检查后即可对比。
            </p>
          )}
        </section>

        <section aria-label="对象变动" className="mt-3">
          <p className="text-[10px] tracking-wide text-evidence-muted uppercase">
            对象变动
          </p>
          {changedEntities.length === 0 ? (
            <p className="mt-1 text-[11px] text-evidence-muted">
              两个分支的业务对象一致。
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-evidence-line">
              {changedEntities.map((entity) => (
                <li key={entity.id} className="py-1">
                  <button
                    type="button"
                    onClick={() => onFocusNode(entity.id)}
                    className="block w-full truncate text-left text-[11px] text-evidence-ink hover:text-evidence-accent"
                  >
                    <span className={`mr-1 ${changeClass(entity.changeType)}`}>
                      {CHANGE_LABEL[entity.changeType]}
                    </span>
                    {entity.label}
                  </button>
                  {entity.attributeDiffs !== undefined ? (
                    <span className="block truncate text-[10px] text-evidence-muted">
                      {entity.attributeDiffs
                        .filter((attribute) => attribute.changeType !== 'unchanged')
                        .map(
                          (attribute) =>
                            `${CHANGE_LABEL[attribute.changeType]}${attribute.name}`,
                        )
                        .join(' · ')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="关键数据对比" className="mt-3">
          <p className="text-[10px] tracking-wide text-evidence-muted uppercase">
            关键数据对比
          </p>
          {diff.keyData.length === 0 ? (
            <p className="mt-1 text-[11px] text-evidence-muted">
              关键数据的提供方结论没有变化。
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-evidence-line">
              {diff.keyData.map((item) => (
                <li key={`${item.entityRef}#${item.attribute}`} className="py-1">
                  <p className="truncate text-[11px] text-evidence-ink">
                    <span className={`mr-1 ${changeClass(item.changeType)}`}>
                      {CHANGE_LABEL[item.changeType]}
                    </span>
                    {item.label}
                  </p>
                  <p className="truncate text-[10px] text-evidence-muted">
                    {sourceLabel(item.baseSource)} → {sourceLabel(item.targetSource)}
                  </p>
                  {item.targetExpression !== undefined ? (
                    <p className="truncate font-mono text-[10px] text-[#414751]">
                      {item.targetExpression}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {changedRules.length > 0 || changedRelationships.length > 0 ? (
          <section aria-label="规则与关系变动" className="mt-3">
            <p className="text-[10px] tracking-wide text-evidence-muted uppercase">
              规则与关系变动
            </p>
            <ul className="mt-1 divide-y divide-evidence-line">
              {changedRules.map((rule) => (
                <li key={rule.id} className="py-1 text-[11px] text-evidence-ink">
                  <span className={`mr-1 ${changeClass(rule.changeType)}`}>
                    {CHANGE_LABEL[rule.changeType]}
                  </span>
                  规则 · {rule.label}
                </li>
              ))}
              {changedRelationships.map((relationship) => (
                <li
                  key={relationship.id}
                  className="py-1 text-[11px] text-evidence-ink"
                >
                  <span className={`mr-1 ${changeClass(relationship.changeType)}`}>
                    {CHANGE_LABEL[relationship.changeType]}
                  </span>
                  关系 · {relationship.label}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {target?.lastVerdict === undefined ? (
          <p className="mt-3 text-[10px] text-evidence-muted">
            该分支会在检出并运行一次检查后记录自己的门禁结论。
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-evidence-line px-3 py-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onMerge(compareBranchId)}
          className="rounded bg-evidence-accent px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
          title="把该分支检入主干并记为已合并"
        >
          采纳并合入主干
        </button>
      </div>
    </aside>
  );
};
