import { useEffect, useMemo, useRef, useState } from 'react';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { AttributeAST } from '@evidence-poc/evidence-schema';
import {
  UpdateAttributeCommand,
  type ModelSession,
} from '@evidence-poc/evidence-model-core/browser';

import type { DiagnosticIndex } from '../../state/diagnosticIndex';
import {
  filterLedgerRows,
  projectDocumentToLedgerRows,
  summarizeLedger,
  type LedgerRow,
} from './domainLedgerAdapter';
import { createLedgerColumns } from './domainLedgerColumns';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

export interface DomainLedgerTableProps {
  document: DomainModelDocument;
  session: ModelSession;
  diagnostics?: DiagnosticIndex | null;
  selectedNodeId: string | null;
  /** Attribute the canvas or inspector selected, highlighted on its row. */
  selectedAttributeName?: string | null;
  /** Entity the table should scroll to when it mounts or the target changes. */
  focusNodeId?: string | null;
  /** Pans the graph to the object and leaves the table mode. */
  onRevealOnGraph?: (entityId: string) => void;
}

const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 34;
const CONTEXT_ROW_HEIGHT = 30;

/**
 * The whole model as one dense ledger.
 *
 * A canvas answers "how does this business hold together"; forty fields on eight
 * objects answer a different question — "which contract is still missing a
 * provider". The table reads the same session the canvas reads, so editing a
 * label here is the same command (and the same undo step) as editing it in the
 * inspector; the context line and the entity line are summaries that keep the
 * list navigable without a second outline.
 */
export const DomainLedgerTable = ({
  document,
  session,
  diagnostics = null,
  selectedNodeId,
  selectedAttributeName = null,
  focusNodeId = null,
  onRevealOnGraph,
}: DomainLedgerTableProps) => {
  const [query, setQuery] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const projected = useMemo(
    () => projectDocumentToLedgerRows(document, diagnostics),
    [document, diagnostics],
  );
  const summary = useMemo(() => summarizeLedger(projected), [projected]);

  const visibleRows = useMemo(
    () =>
      filterLedgerRows(projected, {
        query,
        onlyIssues,
        collapsedContextIds: collapsed,
      }),
    [projected, query, onlyIssues, collapsed],
  );

  const toggleContext = (rowId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const updateAttribute = (
    entityId: string,
    attributeName: string,
    patch: Partial<AttributeAST>,
  ) => {
    session.dispatch(
      new UpdateAttributeCommand(entityId, attributeName, patch),
    );
  };

  const columns = useMemo(
    () =>
      createLedgerColumns({
        onSelect: (row) => {
          if (row.entityId === null) return;
          session.selectAttribute(row.entityId, row.attribute?.name ?? null);
        },
        ...(onRevealOnGraph === undefined ? {} : { onRevealOnGraph }),
        onUpdateAttribute: updateAttribute,
      }),
    // `session` is the stable accessor the columns dispatch through.
    [session, onRevealOnGraph],
  );

  const table = useReactTable({
    data: visibleRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const columnWidth =
    table
      .getVisibleLeafColumns()
      .reduce((total, column) => total + column.getSize(), 0) + 24;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      rows[index]?.original.rowKind === 'context'
        ? CONTEXT_ROW_HEIGHT
        : ROW_HEIGHT,
    overscan: 12,
    // jsdom has no layout, and the first paint before the observer reports one
    // should already show rows instead of an empty scroll surface.
    initialRect: { width: 1200, height: 640 },
  });

  // Opening the ledger from a canvas selection lands on the object that was
  // selected, not at the top of the source tree.
  useEffect(() => {
    if (focusNodeId === null) return;

    const index = rows.findIndex(
      (row) =>
        row.original.rowKind === 'entity' &&
        row.original.entityId === focusNodeId,
    );

    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'center' });
    // Scrolling belongs to the target, not to every re-render of the rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeId]);

  const selected = (row: LedgerRow): boolean => {
    if (row.entityId === null || row.entityId !== selectedNodeId) return false;
    if (row.rowKind === 'entity') return selectedAttributeName === null;
    return row.attribute?.name === selectedAttributeName;
  };

  return (
    <section
      aria-label="领域模型总台账"
      data-region="domain-ledger"
      className="flex h-full w-full min-h-0 flex-col bg-white"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-evidence-line bg-evidence-surface/60 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-semibold text-evidence-ink">
            领域总台账
          </span>
          <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-evidence-muted">
            {summary.entities} 个实体 · {summary.attributes} 个字段
          </span>
          {summary.decisionOwed === 0 ? (
            <span className="rounded-full bg-[#eaf3ee] px-2 py-0.5 text-[10px] text-evidence-participant">
              台账已闭合
            </span>
          ) : (
            <span className="rounded-full bg-[#fdeef2] px-2 py-0.5 text-[10px] font-medium text-evidence-evidence">
              {summary.decisionOwed} 项待决
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type="search"
            value={query}
            aria-label="台账筛选"
            placeholder="按实体、属性或上下文筛选…"
            onChange={(event) => setQuery(event.target.value)}
            className="w-56 rounded border border-evidence-line bg-white px-2 py-1 text-[11px] text-evidence-ink placeholder:text-evidence-muted focus:border-evidence-accent focus:outline-none"
          />
          <button
            type="button"
            aria-pressed={onlyIssues}
            onClick={() => setOnlyIssues((current) => !current)}
            className={[
              'rounded border px-2 py-1 text-[11px]',
              onlyIssues
                ? 'border-[#b42318] bg-[#fdf3f1] text-[#b42318]'
                : 'border-evidence-line text-evidence-muted hover:text-evidence-ink',
            ].join(' ')}
          >
            {onlyIssues ? '● 仅看门禁发现' : '全部门禁'}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ minWidth: columnWidth }}>
          <div
            role="row"
            className="sticky top-0 z-10 grid border-b border-evidence-line bg-[#f6f8fa]"
            style={{
              gridTemplateColumns: table
                .getVisibleLeafColumns()
                .map((column) => `${column.getSize()}px`)
                .join(' '),
              height: HEADER_HEIGHT,
            }}
          >
            {table.getFlatHeaders().map((header) => (
              <div
                key={header.id}
                role="columnheader"
                className="flex items-center overflow-hidden px-2 text-[10px] font-medium tracking-wide text-evidence-muted uppercase"
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]?.original;
              if (row === undefined) return null;

              const gridStyle = {
                gridTemplateColumns: table
                  .getVisibleLeafColumns()
                  .map((column) => `${column.getSize()}px`)
                  .join(' '),
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              };

              if (row.rowKind === 'context') {
                const isCollapsed = collapsed.has(row.rowId);

                return (
                  <button
                    key={row.rowId}
                    type="button"
                    role="row"
                    aria-expanded={!isCollapsed}
                    data-ledger-row={row.rowId}
                    onClick={() => toggleContext(row.rowId)}
                    style={gridStyle}
                    className="absolute top-0 left-0 flex w-full items-center gap-2 border-b border-evidence-line/60 bg-[#fbfcfd] px-2 text-left hover:bg-[#f2f5f9]"
                  >
                    <span className="w-3 text-[9px] text-evidence-muted">
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                    <span className="truncate text-[11px] font-semibold text-evidence-ink">
                      {row.contextLabel}
                    </span>
                    <span className="text-[10px] text-evidence-muted">
                      {row.childCount} 个实体
                    </span>
                    {row.decisionOwedCount > 0 ? (
                      <span className="text-[10px] text-evidence-evidence">
                        {row.decisionOwedCount} 项待决
                      </span>
                    ) : null}
                    {row.issueCount > 0 ? (
                      <span className="text-[10px] text-[#8d6200]">
                        {row.issueCount} 项发现
                      </span>
                    ) : null}
                  </button>
                );
              }

              const cells = rows[virtualRow.index]?.getVisibleCells() ?? [];

              return (
                <div
                  key={row.rowId}
                  role="row"
                  data-ledger-row={row.rowId}
                  onClick={() => {
                    if (row.entityId !== null) {
                      session.selectAttribute(
                        row.entityId,
                        row.attribute?.name ?? null,
                      );
                    }
                  }}
                  style={gridStyle}
                  className={[
                    'absolute top-0 left-0 grid w-full cursor-default items-center border-b border-evidence-line/40',
                    selected(row)
                      ? 'bg-evidence-accent/10'
                      : row.rowKind === 'entity'
                        ? 'bg-white hover:bg-evidence-surface/70'
                        : 'bg-white hover:bg-evidence-surface/40',
                  ].join(' ')}
                >
                  {cells.map((cell) => (
                    <div
                      key={cell.id}
                      role="gridcell"
                      className="flex min-w-0 items-center px-2 py-1"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {visibleRows.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] text-evidence-muted">
            没有匹配的实体或字段。
          </p>
        ) : null}
      </div>
    </section>
  );
};
