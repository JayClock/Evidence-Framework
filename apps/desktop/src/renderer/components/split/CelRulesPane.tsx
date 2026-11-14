import { useMemo, useState } from 'react';

import { CodeEditor, cn } from '@evidence-poc/desktop-ui-kit';
import {
  RULE_KIND_LABELS,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

export interface CelRulesPaneProps {
  document: DomainModelDocument;
  focusEntityId?: string | null;
  /** Names the object a rule belongs to back to the canvas. */
  onFocusEntity?: (entityId: string) => void;
}

interface RuleRow {
  id: string;
  label: string;
  kindLabel: string;
  expression: string;
  entityRef: string | null;
  entityLabel: string | null;
  attribute: string | null;
}

/**
 * The rules the model enforces, in the order the service evaluates them.
 *
 * A derivation is the one part of the model that ends up as running code, so
 * reading it beside the graph answers the question the graph raises: not "what
 * does this contract hold" but "what does this contract compute". The pane is
 * read-only for the same reason the contract pane is — a rule is edited on the
 * attribute it derives, where its bindings are in scope.
 */
export const CelRulesPane = ({
  document,
  focusEntityId = null,
  onFocusEntity,
}: CelRulesPaneProps) => {
  const [pinnedRuleId, setPinnedRuleId] = useState<string | null>(null);

  const rows = useMemo<readonly RuleRow[]>(
    () => {
      const labelById = new Map(
        document.entities.map((entity) => [entity.id, entity.label] as const),
      );

      return document.rules.map((rule) => {
        const entityRef = rule.target?.entityRef ?? null;

        return {
          id: rule.id,
          label: rule.label,
          kindLabel: RULE_KIND_LABELS[rule.kind],
          expression: rule.expression,
          entityRef,
          entityLabel:
            entityRef === null ? null : (labelById.get(entityRef) ?? null),
          attribute: rule.target?.attribute ?? null,
        };
      });
    },
    [document.entities, document.rules],
  );

  // A canvas selection outranks a pinned row: pointing at an object should show
  // what that object computes, not whatever was last read.
  const focused =
    rows.find(
      (row) => row.entityRef !== null && row.entityRef === focusEntityId,
    ) ??
    rows.find((row) => row.id === pinnedRuleId) ??
    rows[0] ??
    null;

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[11px] text-evidence-muted">
        当前模型还没有派生规则。
      </div>
    );
  }

  return (
    <div
      data-region="cel-rules"
      className="flex h-full min-h-0 flex-col bg-white"
    >
      <div className="max-h-[45%] min-h-0 shrink-0 overflow-y-auto border-b border-evidence-line">
        {rows.map((row) => {
          const selected = row.id === focused?.id;

          return (
            <button
              key={row.id}
              type="button"
              data-rule-id={row.id}
              aria-pressed={selected}
              onClick={() => {
                setPinnedRuleId(row.id);
                if (row.entityRef !== null) onFocusEntity?.(row.entityRef);
              }}
              className={cn(
                'flex w-full flex-col gap-0.5 border-b border-evidence-line/60 px-3 py-1.5 text-left transition-colors last:border-b-0',
                selected ? 'bg-evidence-active' : 'hover:bg-evidence-hover',
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-evidence-muted">
                <span className="shrink-0 rounded bg-white px-1 text-[9px]">
                  {row.kindLabel}
                </span>
                <span className="truncate text-evidence-ink">
                  {row.entityLabel ?? row.label}
                  {row.attribute === null ? '' : ` · ${row.attribute}`}
                </span>
              </span>
              <code className="truncate font-mono text-[10px] text-[#475467]">
                {row.expression}
              </code>
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-evidence-line bg-evidence-surface/60 px-3 py-1">
        <span className="truncate text-[10px] text-evidence-muted">
          {focused?.label ?? ''}
        </span>
        <span className="shrink-0 font-mono text-[9px] text-evidence-muted">
          {focused?.id ?? ''}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <CodeEditor
          label="CEL 规则表达式"
          language="cel"
          value={focused?.expression ?? ''}
        />
      </div>
    </div>
  );
};
