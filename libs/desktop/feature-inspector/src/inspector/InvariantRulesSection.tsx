import { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { Button } from '@evidence-poc/desktop-ui-kit';
import {
  analyzeCelExpression,
  updateRuleMutator,
  type DomainGraph,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';
import type { RuleAST } from '@evidence-poc/evidence-schema';

import { CelCodeMirrorEditor } from './cel/CelCodeMirrorEditor';
import { useCelCompletion } from './useCelCompletion';

export const InvariantRulesSection = ({
  entityId,
  graph,
  session,
}: {
  entityId: string;
  graph: DomainGraph;
  session: ModelSession;
}) => {
  const rules = useMemo(
    () =>
      graph
        .rules()
        .filter(
          (rule) =>
            rule.kind === 'invariant' &&
            Object.values(rule.bindings).some(
              (binding) => 'ref' in binding && binding.ref === entityId,
            ),
        ),
    [graph, entityId],
  );
  const [editing, setEditing] = useState<RuleAST | null>(null);

  return (
    <section aria-label="业务不变量规则" className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold text-workbench-label">
        业务不变量规则（CEL）
      </h3>
      {rules.length === 0 ? (
        <p className="text-workbench-muted">未声明不变量</p>
      ) : null}
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="flex min-w-0 flex-col gap-1.5 rounded-md border border-workbench-border bg-workbench-background p-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Zap
              aria-hidden="true"
              className="size-3 shrink-0 text-evidence-accent"
            />
            <code title={rule.label} className="min-w-0 flex-1 truncate">
              {rule.id}
            </code>
            {editing === null ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                aria-label={`编辑 CEL ${rule.id}`}
                onClick={() => setEditing(rule)}
              >
                编辑
              </Button>
            ) : null}
          </div>
          {editing?.id === rule.id ? (
            <InvariantEditor
              entityId={entityId}
              original={editing}
              rule={rule}
              graph={graph}
              session={session}
              onClose={() => setEditing(null)}
            />
          ) : (
            <code className="font-mono break-all whitespace-pre-wrap text-workbench-body">
              {rule.expression}
            </code>
          )}
        </div>
      ))}
      {editing !== null && !rules.some((rule) => rule.id === editing.id) ? (
        <StaleRule onClose={() => setEditing(null)} />
      ) : null}
    </section>
  );
};

const StaleRule = ({ onClose }: { onClose: () => void }) => (
  <div className="flex flex-wrap items-center gap-2">
    <p role="status">规则已变更或移除，无法应用这份草稿。</p>
    <Button type="button" size="xs" variant="outline" onClick={onClose}>
      放弃草稿
    </Button>
  </div>
);

const InvariantEditor = ({
  entityId,
  original,
  rule,
  graph,
  session,
  onClose,
}: {
  entityId: string;
  original: RuleAST;
  rule: RuleAST;
  graph: DomainGraph;
  session: ModelSession;
  onClose: () => void;
}) => {
  const candidates = useCelCompletion({
    graph,
    entityRef: entityId,
    ruleId: original.id,
  });
  const [draft, setDraft] = useState(original.expression);
  const [saveError, setSaveError] = useState<string | null>(null);
  if (rule !== original) return <StaleRule onClose={onClose} />;

  const apply = () => {
    // Check again using the live session, not just the last rendered graph.
    const liveGraph = session.getGraph();
    if (liveGraph.getRule(original.id) !== original) {
      setSaveError('规则已变更或移除，无法应用这份草稿。');
      return;
    }
    const analysis = analyzeCelExpression({ expression: draft, candidates });
    if (!analysis.ok) {
      setSaveError(
        draft.trim() === ''
          ? '不变量表达式不能为空。'
          : '请修正表达式中的错误后再应用。',
      );
      return;
    }
    try {
      session.mutate(
        (document) =>
          updateRuleMutator(document, original.id, { expression: draft }),
        'update-rule',
      );
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '无法更新不变量。');
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <CelCodeMirrorEditor
        ariaLabel={`${original.id} CEL 表达式`}
        value={original.expression}
        candidates={candidates}
        onDraftChange={(next) => {
          setDraft(next);
          setSaveError(null);
        }}
        autoFocus
        minHeight="32px"
      />
      {saveError !== null ? (
        <p role="alert" className="text-evidence-evidence">
          {saveError}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="xs" variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button
          type="button"
          size="xs"
          disabled={draft === original.expression}
          onClick={apply}
        >
          应用 CEL
        </Button>
      </div>
    </div>
  );
};
