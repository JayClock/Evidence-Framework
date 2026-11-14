import { useEffect, useMemo, useState } from 'react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@evidence-poc/desktop-ui-kit';
import {
  VALUE_TYPES,
  type AttributeAST,
  type EntityAST,
  type ValueType,
} from '@evidence-poc/evidence-schema';
import {
  UpdateAttributeCommand,
  UpdateRuleCommand,
  buildKeyDataLedger,
  type DomainGraph,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';

import { CelFormulaBar } from './cel/CelFormulaBar';
import { useCelCompletion } from './useCelCompletion';

export interface KeyDataLedgerSheetProps {
  entity: EntityAST;
  graph: DomainGraph;
  session: ModelSession;
  /** Attribute the modeler was inspecting, so the ledger opens where they were. */
  initialAttribute?: string | null;
  onClose: () => void;
}

/**
 * The whole ledger of one entity, one slide away from the model it describes.
 *
 * The rail answers "what is this field" one row at a time; a contract with forty
 * fields needs the other question — "which of these still owe a decision" — and
 * that question needs columns. A sheet keeps the canvas mounted underneath, so
 * the modeler reads the columns and steps back without losing their place; it
 * also edits the same session, so no state has to be reconciled on return.
 */
export const KeyDataLedgerSheet = ({
  entity: selected,
  graph,
  session,
  initialAttribute = null,
  onClose,
}: KeyDataLedgerSheetProps) => {
  const entity = graph.getEntity(selected.id) ?? selected;
  const attributes = useMemo(
    () => entity.attributes ?? [],
    [entity.attributes],
  );
  const [active, setActive] = useState<string | null>(
    initialAttribute !== null &&
      attributes.some((attribute) => attribute.name === initialAttribute)
      ? initialAttribute
      : (attributes[0]?.name ?? null),
  );

  const activeAttribute =
    attributes.find((attribute) => attribute.name === active) ?? null;
  const activeRule =
    activeAttribute?.derivedByRuleRef === undefined
      ? undefined
      : graph.getRule(activeAttribute.derivedByRuleRef);
  const candidates = useCelCompletion({
    graph,
    entityRef: entity.id,
    ...(activeRule === undefined ? {} : { ruleId: activeRule.id }),
  });

  const ledger = useMemo(
    () => buildKeyDataLedger(session.getDocument()),
    [session, session.getDocument()],
  );
  const entriesForEntity = ledger.entries.filter(
    (entry) => entry.entityRef === entity.id,
  );
  const decisionOwed = entriesForEntity.filter((entry) => entry.decisionOwed);

  // Escape belongs to the sheet, not to the selection the inspector behind it
  // is showing: closing the wide ledger must not also clear the object.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        showClose={false}
        aria-label="关键数据台账工作台"
        data-region="ledger-sheet"
        className="w-[55vw] min-w-[480px] max-w-none gap-0 p-0"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-evidence-line bg-[#f6f8fa] px-4">
          <SheetTitle className="sr-only">关键数据台账工作台</SheetTitle>
          <div className="flex min-w-0 items-center gap-2 text-[13px]">
            <span className="truncate font-semibold text-evidence-ink">
              {entity.label}
            </span>
            <code className="rounded bg-[#eef2f7] px-1.5 py-0.5 font-mono text-[10px] font-normal text-evidence-muted">
              {entity.id}
            </code>
            <span className="text-[11px] font-normal text-evidence-muted">
              {attributes.length} 个字段
            </span>
            {decisionOwed.length > 0 ? (
              <span className="rounded-full bg-[#fdeef2] px-2 py-0.5 text-[10px] font-medium text-evidence-evidence">
                {decisionOwed.length} 项台账待决
              </span>
            ) : (
              <span className="rounded-full bg-[#eaf3ee] px-2 py-0.5 text-[10px] font-medium text-evidence-participant">
                台账已闭合
              </span>
            )}
          </div>
          <SheetDescription className="sr-only">
            在宽屏台账中逐字段编辑数据类型、必填约束与 CEL 派生规则。
          </SheetDescription>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-evidence-line bg-white px-3 py-1 text-[11px] font-medium text-evidence-ink hover:border-evidence-accent"
          >
            返回属性面板（Esc）
          </button>
        </header>

        <CelFormulaBar
          entityLabel={entity.label}
          attribute={activeAttribute}
          ruleExpression={activeRule?.expression ?? null}
          candidates={candidates}
          onCommitExpression={(expression) => {
            if (
              activeRule === undefined ||
              expression === activeRule.expression
            ) {
              return;
            }

            session.dispatch(
              new UpdateRuleCommand(activeRule.id, { expression }),
            );
          }}
        />

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="sticky top-0 z-10 bg-[#f6f8fa] text-[10px] text-[#59606c]">
              <tr className="border-b border-evidence-line">
                <th className="w-10 px-3 py-2 font-normal">#</th>
                <th className="w-52 px-3 py-2 font-normal">属性标识符</th>
                <th className="w-52 px-3 py-2 font-normal">业务名称</th>
                <th className="w-28 px-3 py-2 font-normal">数据类型</th>
                <th className="w-16 px-3 py-2 font-normal">必填</th>
                <th className="w-28 px-3 py-2 font-normal">关键数据</th>
                <th className="px-3 py-2 font-normal">派生规则</th>
              </tr>
            </thead>
            <tbody>
              {attributes.map((attribute, index) => (
                <LedgerRow
                  key={attribute.name}
                  index={index}
                  entity={entity}
                  graph={graph}
                  session={session}
                  attribute={attribute}
                  selected={attribute.name === active}
                  onSelect={() => setActive(attribute.name)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const LedgerRow = ({
  index,
  entity,
  graph,
  session,
  attribute,
  selected,
  onSelect,
}: {
  index: number;
  entity: EntityAST;
  graph: DomainGraph;
  session: ModelSession;
  attribute: AttributeAST;
  selected: boolean;
  onSelect: () => void;
}) => {
  const rule =
    attribute.derivedByRuleRef === undefined
      ? undefined
      : graph.getRule(attribute.derivedByRuleRef);

  return (
    <tr
      data-ledger-row={attribute.name}
      data-selected={selected ? 'true' : 'false'}
      onClick={onSelect}
      className={[
        'cursor-pointer border-b border-evidence-line/60 align-middle',
        selected ? 'bg-[#eef2f7]' : 'hover:bg-[#fbfbfc]',
      ].join(' ')}
    >
      <td className="px-3 py-2 font-mono text-[10px] text-[#8c959f]">
        {index + 1}
      </td>
      <td className="px-3 py-2 font-mono font-medium text-evidence-ink">
        {attribute.name}
        {attribute.required === true ? (
          <span className="ml-0.5 text-evidence-evidence">*</span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-evidence-ink">{attribute.label}</td>
      <td className="px-3 py-2">
        <label className="block">
          <span className="sr-only">{`${attribute.name} 数据类型`}</span>
          <select
            aria-label={`${attribute.name} 数据类型`}
            value={attribute.valueType ?? 'string'}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              session.dispatch(
                new UpdateAttributeCommand(entity.id, attribute.name, {
                  valueType: event.target.value as ValueType,
                }),
              )
            }
            className="rounded border border-evidence-line bg-white px-1 py-0.5 font-mono text-[10px] text-evidence-accent"
          >
            {VALUE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          aria-label={`${attribute.name} 必填`}
          checked={attribute.required === true}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) =>
            session.dispatch(
              new UpdateAttributeCommand(entity.id, attribute.name, {
                required: event.target.checked || undefined,
              }),
            )
          }
        />
      </td>
      <td className="px-3 py-2">
        {attribute.keyData === true ? (
          <span className="rounded bg-[#eaf3ee] px-1.5 py-0.5 text-[10px] font-medium text-evidence-participant">
            关键数据
          </span>
        ) : (
          <span className="text-[10px] text-[#8c959f]">普通</span>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-[10px]">
        {rule === undefined ? (
          <span className="text-[#8c959f]">--</span>
        ) : (
          <span className="text-evidence-accent">
            {rule.expression === '' ? '(空公式)' : rule.expression}
          </span>
        )}
      </td>
    </tr>
  );
};
