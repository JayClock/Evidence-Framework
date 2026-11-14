import type { AttributeAST } from '@evidence-poc/evidence-schema';
import type { CelCandidate } from '@evidence-poc/evidence-model-core';

import { CelCodeMirrorEditor } from './CelCodeMirrorEditor';

export interface CelFormulaBarProps {
  entityLabel: string;
  /** Selected field; null until the ledger has a row to point at. */
  attribute: AttributeAST | null;
  /** Current expression of the attribute's derivation rule, when it has one. */
  ruleExpression: string | null;
  candidates: readonly CelCandidate[];
  onCommitExpression: (expression: string) => void;
}

/**
 * The formula bar above the wide ledger, in the shape spreadsheets taught.
 *
 * It edits the selected rule and nothing else: turning an input field into a
 * derived one is a binding decision with an id, a description and a rule, so it
 * stays in the row where that whole decision is visible at once.
 */
export const CelFormulaBar = ({
  entityLabel,
  attribute,
  ruleExpression,
  candidates,
  onCommitExpression,
}: CelFormulaBarProps) => {
  if (attribute === null) {
    return (
      <div className="flex h-9 items-center gap-2 border-b border-evidence-line bg-[#f6f8fa] px-3 text-[11px] text-[#6e7781]">
        <span className="font-mono font-semibold text-evidence-muted">fx</span>
        <span>选中下方任意一行，公式栏会显示并编辑该字段的派生规则。</span>
      </div>
    );
  }

  return (
    <div className="border-b border-evidence-line bg-white">
      <div className="flex items-start gap-2 px-3 py-1.5">
        <div className="flex shrink-0 items-center gap-1.5 pt-1">
          <span className="font-mono text-[12px] font-semibold text-evidence-accent">
            fx
          </span>
          <span className="rounded bg-[#eef2f7] px-1.5 py-0.5 font-mono text-[10px] font-medium text-evidence-ink">
            {entityLabel}.{attribute.name}
          </span>
          <span className="text-[11px] text-[#8c959f]">=</span>
        </div>

        <div className="min-w-0 flex-1">
          {ruleExpression !== null ? (
            <CelCodeMirrorEditor
              key={attribute.name}
              value={ruleExpression}
              candidates={candidates}
              ariaLabel={`${attribute.name} 公式栏`}
              onCommit={onCommitExpression}
              minHeight="30px"
              maxHeight="140px"
            />
          ) : (
            <p className="rounded border border-dashed border-evidence-line bg-[#fbfbfc] px-2 py-1 text-[10px] text-[#8c959f]">
              {attribute.name}{' '}
              是普通输入字段；需要派生计算时，在对应属性行绑定派生规则。
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
