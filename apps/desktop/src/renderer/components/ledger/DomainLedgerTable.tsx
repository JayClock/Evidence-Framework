import { useEffect, useId, useMemo, useRef } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@evidence-poc/desktop-ui-kit';

import { createLedgerColumns } from './domainLedgerColumns';
import type { useEntityLedger } from './useEntityLedger';
import type { LedgerCategory } from './entityLedgerProjection';

const CATEGORY_OPTIONS = [
  ['all', '全部实体'],
  ['evidence', '核心凭证 Evidence'],
  ['participant', '参与角色 Participant'],
  ['thread', '履约线索 Thread'],
] as const satisfies readonly (readonly [LedgerCategory, string])[];
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 48;

interface DomainLedgerTableProps {
  ledger: ReturnType<typeof useEntityLedger>;
  selectedNodeId: string | null;
  onRevealOnGraph: (entityId: string) => void;
}

export const DomainLedgerTable = ({
  ledger,
  selectedNodeId,
  onRevealOnGraph,
}: DomainLedgerTableProps) => {
  const { category, setCategory, query, setQuery, counts, rows } = ledger;
  const categoryGroup = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(
    () => createLedgerColumns(onRevealOnGraph),
    [onRevealOnGraph],
  );
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });
  const bodyRows = table.getRowModel().rows;
  const leaves = table.getVisibleLeafColumns();
  const virtualizer = useVirtualizer({
    count: bodyRows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => bodyRows[index]?.id ?? index,
    estimateSize: () => ROW_HEIGHT,
    paddingStart: HEADER_HEIGHT,
    scrollPaddingStart: HEADER_HEIGHT,
    overscan: 10,
    initialRect: { width: 1200, height: 640 },
  });
  const selectedIndex = rows.findIndex(({ id }) => id === selectedNodeId);
  useEffect(() => {
    if (selectedIndex >= 0)
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
    else virtualizer.scrollToOffset(0);
  }, [category, query, selectedIndex, virtualizer]);

  const items = virtualizer.getVirtualItems();
  const before = (items[0]?.start ?? HEADER_HEIGHT) - HEADER_HEIGHT;
  const after =
    virtualizer.getTotalSize() - (items.at(-1)?.end ?? HEADER_HEIGHT);

  return (
    <section
      aria-label="领域模型总台账"
      data-region="domain-ledger"
      className="flex h-full min-h-0 w-full min-w-0 flex-col gap-4 bg-workbench-background px-4 py-6 lg:px-8"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <fieldset className="flex min-w-0 flex-wrap gap-1.5">
          <legend className="sr-only">实体分类</legend>
          {CATEGORY_OPTIONS.map(([value, label]) => (
            <label key={value} className="inline-flex cursor-pointer">
              <input
                type="radio"
                name={categoryGroup}
                checked={category === value}
                onChange={() => setCategory(value)}
                className="peer sr-only"
              />
              <span className="inline-flex h-8 items-center rounded-md border border-workbench-border bg-white px-3 text-[11px] text-evidence-ink hover:bg-workbench-subtle peer-checked:border-evidence-accent peer-checked:bg-evidence-accent peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-evidence-ring">
                {label} ({counts[value]})
              </span>
            </label>
          ))}
        </fieldset>
        <input
          type="search"
          aria-label="过滤实体或 CEL 规则"
          placeholder="过滤实体或 CEL 规则..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 w-60 max-w-full rounded-md border border-workbench-border bg-white px-2.5 text-[11px] text-evidence-ink placeholder:text-workbench-muted focus-visible:border-evidence-accent focus-visible:ring-2 focus-visible:ring-evidence-ring focus-visible:outline-none"
        />
      </div>

      <div
        ref={scrollRef}
        role="region"
        aria-label="实体表格滚动区域"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto scroll-pt-10 rounded-lg border border-workbench-border bg-white focus-visible:ring-2 focus-visible:ring-evidence-ring focus-visible:outline-none"
      >
        <table
          aria-rowcount={rows.length + 1}
          className="w-full table-fixed border-separate border-spacing-0 text-left text-xs text-evidence-ink"
          style={{ minWidth: table.getTotalSize() }}
        >
          <caption className="sr-only">领域实体与门禁发现</caption>
          <colgroup>
            {leaves.map((column) => (
              <col
                key={column.id}
                style={
                  column.id === 'invariants'
                    ? undefined
                    : { width: column.getSize() }
                }
              />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-workbench-background">
            {table.getHeaderGroups().map((group) => (
              <tr
                key={group.id}
                aria-rowindex={1}
                style={{ height: HEADER_HEIGHT }}
              >
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className={cn(
                      'border-b border-workbench-border px-4 text-[11px] font-semibold text-workbench-muted',
                      header.column.id === 'id' &&
                        'sticky left-0 z-10 bg-workbench-background',
                    )}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            <SpacerRow height={before} columns={leaves.length} />
            {items.map((item) => {
              const row = bodyRows[item.index];
              if (row === undefined) return null;
              const selected = row.id === selectedNodeId;
              return (
                <tr
                  key={row.id}
                  aria-rowindex={item.index + 2}
                  data-ledger-row={row.id}
                  data-selected={selected || undefined}
                  className={cn(
                    selected
                      ? 'bg-evidence-active'
                      : item.index % 2 === 0
                        ? 'bg-white'
                        : 'bg-[#fcfcfd]',
                    !selected && 'hover:bg-workbench-background',
                  )}
                  style={{ height: ROW_HEIGHT }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isId = cell.column.id === 'id';
                    const Cell = isId ? 'th' : 'td';
                    return (
                      <Cell
                        key={cell.id}
                        scope={isId ? 'row' : undefined}
                        className={cn(
                          'truncate border-b border-workbench-subtle px-4',
                          isId && 'sticky left-0 z-10 bg-inherit font-normal',
                          isId &&
                            selected &&
                            'shadow-[inset_2px_0_var(--color-evidence-accent)]',
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </Cell>
                    );
                  })}
                </tr>
              );
            })}
            <SpacerRow height={after} columns={leaves.length} />
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-workbench-muted">
            {category === 'thread'
              ? '当前履约模型没有独立的 Thread 实体。'
              : query.trim() === ''
                ? '此分类暂无实体。'
                : '未找到匹配的实体或 CEL 规则。'}
          </p>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {rows.length} 个匹配实体
      </p>
    </section>
  );
};

const SpacerRow = ({ height, columns }: { height: number; columns: number }) =>
  height > 0 ? (
    <tr aria-hidden="true">
      <td colSpan={columns} className="p-0" style={{ height }} />
    </tr>
  ) : null;
