import { createColumnHelper } from '@tanstack/react-table';
import { Button, cn } from '@evidence-poc/desktop-ui-kit';

import {
  LEDGER_CATEGORY_LABELS,
  LEDGER_GATE_LABELS,
  type LedgerEntityRow,
  type LedgerGate,
} from './entityLedgerProjection';

const column = createColumnHelper<LedgerEntityRow>();
const gateTone: Record<LedgerGate, { className: string; mark: string }> = {
  unchecked: {
    className: 'bg-workbench-subtle text-workbench-label',
    mark: '—',
  },
  clear: { className: 'bg-green-50 text-green-800', mark: '✓' },
  info: { className: 'bg-blue-50 text-blue-800', mark: 'ℹ' },
  warn: { className: 'bg-yellow-50 text-yellow-800', mark: '⚠' },
  block: { className: 'bg-red-50 text-red-800', mark: '✕' },
};

export const createLedgerColumns = (onRevealOnGraph: (id: string) => void) => [
  column.accessor('id', {
    header: '实体标识 (ID)',
    size: 180,
    cell: ({ getValue }) => (
      <code className="font-semibold" title={getValue()}>
        {getValue()}
      </code>
    ),
  }),
  column.accessor('label', {
    header: '中文名称 / 分类',
    size: 180,
    cell: ({ row }) => {
      const label = `${row.original.label} · ${LEDGER_CATEGORY_LABELS[row.original.category]}`;
      return (
        <span className="text-workbench-body" title={label}>
          {label}
        </span>
      );
    },
  }),
  column.accessor('contextId', {
    header: '所属上下文 (Context)',
    size: 160,
    cell: ({ row, getValue }) => (
      <code
        className="text-[11px] text-workbench-muted"
        title={row.original.contextLabel ?? getValue() ?? undefined}
      >
        {getValue() ?? '—'}
      </code>
    ),
  }),
  column.accessor('fieldCount', {
    header: '字段数',
    size: 90,
    cell: ({ getValue }) => (
      <span className="text-[11px]">{getValue()} 个字段</span>
    ),
  }),
  column.accessor('invariants', {
    header: '业务不变量 (CEL 规则)',
    size: 340,
    cell: ({ getValue }) => {
      const rules = getValue();
      const first = rules[0];
      if (first === undefined)
        return <span className="text-workbench-muted">—</span>;
      return (
        <div
          className="flex items-center gap-1.5 text-[11px] text-workbench-label"
          title={rules
            .map(({ id, expression }) => `${id}: ${expression}`)
            .join('\n')}
        >
          <code className="truncate">{first.expression}</code>
          {rules.length > 1 ? (
            <span
              className="shrink-0"
              aria-label={`另有 ${rules.length - 1} 条规则`}
            >
              +{rules.length - 1}
            </span>
          ) : null}
        </div>
      );
    },
  }),
  column.accessor('gate', {
    header: '门禁状态',
    size: 120,
    cell: ({ getValue }) => {
      const gate = getValue();
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium',
            gateTone[gate].className,
          )}
          title={
            gate === 'clear'
              ? '本次扫描没有指向该实体的发现，不代表项目门禁通过'
              : undefined
          }
        >
          <span aria-hidden="true">{gateTone[gate].mark}</span>
          {LEDGER_GATE_LABELS[gate]}
        </span>
      );
    },
  }),
  column.display({
    id: 'actions',
    header: '操作',
    size: 100,
    cell: ({ row }) => (
      <Button
        type="button"
        size="xs"
        variant="secondary"
        className="h-[26px] border-transparent bg-workbench-subtle px-2"
        aria-label={`在画布中定位 ${row.original.label}`}
        onClick={() => onRevealOnGraph(row.original.id)}
      >
        定位画布
      </Button>
    ),
  }),
];
