import { useEffect, useState } from 'react';

import {
  KEY_DATA_SOURCE_LABELS,
  VALUE_TYPES,
  type AttributeAST,
  type ValueType,
} from '@evidence-poc/evidence-schema';
import { createColumnHelper } from '@tanstack/react-table';

import { diagnosticColor } from '../../state/diagnosticIndex';
import type { LedgerRow } from './domainLedgerAdapter';

export interface LedgerColumnOptions {
  /** Selects the entity, and the attribute when the row is a field. */
  onSelect: (row: LedgerRow) => void;
  /** Pans the canvas to the object; the table asks the stage to switch back. */
  onRevealOnGraph?: (entityId: string) => void;
  onUpdateAttribute: (
    entityId: string,
    attributeName: string,
    patch: Partial<AttributeAST>,
  ) => void;
}

const columnHelper = createColumnHelper<LedgerRow>();

const headerClass =
  'px-2 py-1.5 text-left text-[10px] font-medium tracking-wide text-evidence-muted uppercase';

/**
 * A text cell that commits on blur or Enter.
 *
 * The document is the only copy of the value, so the draft is dropped as soon as
 * the cell loses focus; if an undo from the canvas changes the value while the
 * cell is idle, the effect adopts it instead of showing a stale draft.
 */
const LedgerTextCell = ({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (next: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  return (
    <input
      value={draft}
      placeholder={placeholder}
      aria-label={`${placeholder}: ${value}`}
      onFocus={() => setEditing(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        const next = draft.trim();
        if (next !== '' && next !== value) onCommit(next);
        else setDraft(value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-evidence-ink hover:border-evidence-line focus:border-evidence-accent focus:bg-white focus:outline-none"
    />
  );
};

const severityDot = (severity: LedgerRow['issueSeverity']): string =>
  severity === null ? 'bg-[#c4c9d2]' : '';

/**
 * The ledger's columns.
 *
 * Fields are edited where they are read: a label and a value type are one click
 * away instead of two panels deep, and every commit is the same command the
 * inspector dispatches, so undo and the sensors stay in step.
 */
export const createLedgerColumns = (options: LedgerColumnOptions) => [
  columnHelper.accessor('contextLabel', {
    header: '上下文',
    size: 132,
    cell: (info) => {
      const row = info.row.original;
      if (row.rowKind !== 'entity') return null;

      return (
        <span className="truncate text-[10px] text-evidence-muted">
          {row.contextPath.length > 0 ? row.contextPath.join(' / ') : '—'}
        </span>
      );
    },
  }),
  columnHelper.accessor('entityLabel', {
    header: '实体 / 构造型',
    size: 200,
    cell: (info) => {
      const row = info.row.original;

      if (row.rowKind === 'attribute') {
        return <span className="pl-4 text-[10px] text-evidence-line">└─</span>;
      }

      if (row.rowKind !== 'entity') return null;

      return (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded bg-[#eef2f7] px-1 py-0.5 text-[9px] text-evidence-muted">
            {row.entityKindLabel}
          </span>
          <span className="min-w-0 truncate text-[11px] font-medium text-evidence-ink">
            {row.entityLabel}
          </span>
          {options.onRevealOnGraph === undefined ? null : (
            <button
              type="button"
              title="在拓扑图中定位"
              aria-label={`在拓扑图中定位 ${row.entityLabel ?? ''}`}
              onClick={(event) => {
                event.stopPropagation();
                if (row.entityId !== null)
                  options.onRevealOnGraph?.(row.entityId);
              }}
              className="shrink-0 rounded border border-transparent px-1 text-[10px] text-evidence-muted hover:border-evidence-line hover:text-evidence-accent"
            >
              定位
            </button>
          )}
        </div>
      );
    },
  }),
  columnHelper.accessor('rowId', {
    header: '属性名',
    size: 148,
    cell: (info) => {
      const row = info.row.original;

      if (row.rowKind === 'attribute' && row.attribute !== null) {
        return (
          <code className="truncate font-mono text-[11px] text-evidence-ink">
            {row.attribute.name}
          </code>
        );
      }

      if (row.rowKind === 'entity') {
        return (
          <span className="text-[10px] text-evidence-muted">
            {row.childCount} 个字段
          </span>
        );
      }

      return null;
    },
  }),
  columnHelper.accessor((row) => row.attribute?.label ?? '', {
    id: 'attributeLabel',
    header: '业务名',
    size: 156,
    cell: (info) => {
      const row = info.row.original;

      if (row.rowKind !== 'attribute' || row.attribute === null) return null;

      return (
        <LedgerTextCell
          value={row.attribute.label}
          placeholder="业务名"
          onCommit={(label) =>
            options.onUpdateAttribute(row.entityId!, row.attribute!.name, {
              label,
            })
          }
        />
      );
    },
  }),
  columnHelper.accessor((row) => row.attribute?.valueType ?? '', {
    id: 'valueType',
    header: '类型',
    size: 104,
    cell: (info) => {
      const row = info.row.original;

      if (row.rowKind !== 'attribute' || row.attribute === null) return null;

      return (
        <select
          value={row.attribute.valueType ?? ''}
          aria-label={`${row.attribute.name} 类型`}
          onChange={(event) =>
            options.onUpdateAttribute(row.entityId!, row.attribute!.name, {
              valueType: event.target.value as ValueType,
            })
          }
          className="max-w-full rounded border border-transparent bg-transparent px-0.5 py-0.5 font-mono text-[10px] text-evidence-ink hover:border-evidence-line focus:border-evidence-accent focus:bg-white focus:outline-none"
        >
          <option value="" disabled>
            未声明
          </option>
          {VALUE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      );
    },
  }),
  columnHelper.accessor((row) => row.attribute?.expression ?? '', {
    id: 'expression',
    header: 'CEL 派生',
    size: 236,
    cell: (info) => {
      const row = info.row.original;

      if (row.rowKind !== 'attribute' || row.attribute === null) return null;

      if (row.attribute.expression === null) {
        return (
          <span className="text-[10px] text-evidence-muted/70 select-none">
            —— 事实录入 ——
          </span>
        );
      }

      return (
        <code
          title={row.attribute.expression}
          className="min-w-0 truncate rounded bg-evidence-surface px-1.5 py-0.5 font-mono text-[10px] text-evidence-accent"
        >
          = {row.attribute.expression}
        </code>
      );
    },
  }),
  columnHelper.accessor((row) => row.attribute?.keyDataSource ?? '', {
    id: 'keyDataSource',
    header: '关键数据',
    size: 118,
    cell: (info) => {
      const row = info.row.original;

      if (row.rowKind === 'entity') {
        return row.decisionOwedCount === 0 ? null : (
          <span className="rounded-full bg-[#fdeef2] px-1.5 py-0.5 text-[9px] font-medium text-evidence-evidence">
            {row.decisionOwedCount} 项待决
          </span>
        );
      }

      if (row.rowKind !== 'attribute' || row.attribute === null) return null;

      if (row.attribute.keyDataSource === null) {
        return <span className="text-[10px] text-evidence-muted/60">—</span>;
      }

      return (
        <span
          className={[
            'truncate rounded px-1 py-0.5 text-[9px]',
            row.attribute.decisionOwed
              ? 'bg-[#fdeef2] font-medium text-evidence-evidence'
              : 'bg-[#eaf3ee] text-evidence-participant',
          ].join(' ')}
        >
          {KEY_DATA_SOURCE_LABELS[row.attribute.keyDataSource]}
        </span>
      );
    },
  }),
  columnHelper.accessor('issueCount', {
    header: '门禁',
    size: 88,
    cell: (info) => {
      const row = info.row.original;

      if (row.rowKind === 'context') return null;

      if (row.issueCount === 0) {
        return (
          <span className="flex items-center gap-1 text-[10px] text-evidence-participant">
            <span className="h-1.5 w-1.5 rounded-full bg-evidence-participant" />
            通过
          </span>
        );
      }

      return (
        <span
          className={[
            'flex items-center gap-1 text-[10px]',
            row.issueSeverity === 'block'
              ? 'text-[#b42318]'
              : row.issueSeverity === 'warn'
                ? 'text-[#8d6200]'
                : 'text-evidence-muted',
          ].join(' ')}
        >
          <span
            className={[
              'h-1.5 w-1.5 rounded-full',
              severityDot(row.issueSeverity),
            ].join(' ')}
            style={
              row.issueSeverity === null
                ? undefined
                : { backgroundColor: diagnosticColor(row.issueSeverity) }
            }
          />
          {row.issueCount} 项
        </span>
      );
    },
  }),
];

export { headerClass };
