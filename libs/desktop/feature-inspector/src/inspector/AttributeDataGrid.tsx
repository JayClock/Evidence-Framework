import { Fragment, useMemo, useState } from 'react';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type ExpandedState,
} from '@tanstack/react-table';

import {
  VALUE_TYPES,
  type AttributeAST,
  type EntityAST,
  type ValueType,
} from '@evidence-poc/evidence-schema';
import {
  AddAttributeCommand,
  RemoveAttributeCommand,
  UpdateAttributeCommand,
  buildKeyDataLedger,
  type DomainGraph,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';

import { ApiFieldBadge } from './ApiFieldBadge';
import { DerivedRuleSection } from './DerivedRuleSection';
import { KeyDataProvenancePicker } from './KeyDataProvenancePicker';
import { cn } from '@evidence-poc/desktop-ui-kit';

interface AttributeDataGridProps {
  entity: EntityAST;
  graph: DomainGraph;
  session: ModelSession;
  /** Opens the wide ledger studio; the compact grid stays for the rail. */
  onOpenStudio?: () => void;
}

const columnHelper = createColumnHelper<AttributeAST>();

const nextAttributeName = (
  attributes: readonly AttributeAST[],
): { name: string; index: number } => {
  let index = attributes.length + 1;
  let name = `attribute_${index}`;

  while (attributes.some((attribute) => attribute.name === name)) {
    index += 1;
    name = `attribute_${index}`;
  }

  return { name, index };
};

/**
 * The key data ledger of one entity, as a grid with expandable rows.
 *
 * Provenance and the derivation rule belong to their attribute, so they open
 * underneath it instead of piling up as a second list nobody can match back to a
 * row. Editing always goes through a command, so every committed change is one
 * undo step and the badge beside it is derived from the document, not a flag
 * someone could forget to clear.
 */
export const AttributeDataGrid = ({
  entity: selected,
  graph,
  session,
  onOpenStudio,
}: AttributeDataGridProps) => {
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [bindingAttribute, setBindingAttribute] = useState<string | null>(null);

  // The parent re-reads the session on every document change, so the graph is
  // the freshest view of this object; the id keeps it stable across edits.
  const entity = graph.getEntity(selected.id) ?? selected;
  const attributes = useMemo(
    () => entity.attributes ?? [],
    [entity.attributes],
  );

  const ledger = useMemo(
    () => buildKeyDataLedger(session.getDocument()),
    // The document identity changes on every dispatch, which is exactly when the
    // ledger has to be recomputed.
    [session, session.getDocument()],
  );
  const entriesForEntity = ledger.entries.filter(
    (entry) => entry.entityRef === entity.id,
  );
  const decisionOwed = entriesForEntity.filter((entry) => entry.decisionOwed);

  const patchAttribute = (
    attribute: AttributeAST,
    patch: Readonly<Partial<AttributeAST>>,
  ) => {
    session.dispatch(
      new UpdateAttributeCommand(entity.id, attribute.name, patch),
    );
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: '属性名',
        cell: (info) => {
          const attribute = info.row.original;
          const open = info.row.getIsExpanded();

          return (
            <div className="flex items-start gap-1 py-0.5">
              <button
                type="button"
                aria-label={`${attribute.name} 展开`}
                aria-expanded={open}
                onClick={info.row.getToggleExpandedHandler()}
                className="mt-0.5 shrink-0 text-[9px] text-[#8c959f] hover:text-evidence-ink"
                title="展开提供方决策与派生规则"
              >
                {open ? '▼' : '▶'}
              </button>
              <div className="min-w-0 flex-1">
                <code className="block truncate font-mono text-[10px] font-medium text-evidence-ink">
                  {attribute.name}
                  {attribute.required === true ? (
                    <span
                      aria-label="必填"
                      className="ml-0.5 text-evidence-evidence"
                    >
                      *
                    </span>
                  ) : null}
                </code>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <ApiFieldBadge
                    attribute={attribute}
                    entityRef={entity.id}
                    graph={graph}
                  />
                  {attribute.derivedByRuleRef !== undefined ? (
                    <span className="rounded bg-[#eef2f7] px-1 text-[8px] text-evidence-accent">
                      派生
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor('label', {
        header: '业务名称 / 类型',
        cell: (info) => {
          const attribute = info.row.original;

          return (
            <div className="space-y-0.5 py-0.5">
              <CommitInput
                ariaLabel={`${attribute.name} 业务名称`}
                value={attribute.label}
                onCommit={(label) => patchAttribute(attribute, { label })}
              />
              <label className="block">
                <span className="sr-only">{`${attribute.name} 数据类型`}</span>
                <select
                  aria-label={`${attribute.name} 数据类型`}
                  value={attribute.valueType ?? 'string'}
                  onChange={(event) =>
                    patchAttribute(attribute, {
                      valueType: event.target.value as ValueType,
                    })
                  }
                  className="w-full rounded border border-evidence-line bg-[#fbfbfc] px-1 py-0.5 text-[9px] text-[#57606a]"
                >
                  {VALUE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'keyData',
        header: '关键',
        cell: (info) => {
          const attribute = info.row.original;
          const keyData = attribute.keyData === true;

          return (
            <label className="flex cursor-pointer items-center gap-1 py-0.5 text-[9px]">
              <input
                type="checkbox"
                aria-label={`${attribute.name} 关键数据`}
                checked={keyData}
                onChange={(event) =>
                  patchAttribute(attribute, { keyData: event.target.checked })
                }
              />
              <span
                className={keyData ? 'text-evidence-role' : 'text-[#8c959f]'}
              >
                {keyData ? '关键数据' : '普通'}
              </span>
            </label>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '操作',
        cell: (info) => {
          const attribute = info.row.original;

          return (
            <button
              type="button"
              aria-label={`删除属性 ${attribute.name}`}
              onClick={() =>
                session.dispatch(
                  new RemoveAttributeCommand(entity.id, attribute.name, {
                    cascade: true,
                  }),
                )
              }
              className="rounded border border-evidence-line px-1 py-0.5 text-[9px] text-evidence-muted hover:border-evidence-evidence hover:text-evidence-evidence"
            >
              删除
            </button>
          );
        },
      }),
    ],
    [entity.id, graph, session],
  );

  const table = useReactTable({
    data: attributes,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getRowId: (row) => row.name,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1 text-[9px] text-[#8a929e]">
        <span>属性清单</span>
        <div className="flex items-center gap-1.5">
          <span data-ledger-summary={entity.id}>
            关键数据 {entriesForEntity.length} 项
            {decisionOwed.length > 0 ? ` · 待决 ${decisionOwed.length} 项` : ''}
          </span>
          {onOpenStudio === undefined ? null : (
            <button
              type="button"
              onClick={onOpenStudio}
              className="shrink-0 rounded border border-evidence-line px-1.5 py-0.5 text-[9px] text-evidence-muted hover:border-evidence-accent hover:text-evidence-ink"
              title="在台账工作台中编辑全部字段（Alt+L）"
            >
              ⛶ 工作台
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded border border-evidence-line bg-white">
        <table className="w-full table-fixed border-collapse text-left text-[10px]">
          <thead className="bg-[#f6f8fa] text-[9px] text-[#59606c]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'border-b border-evidence-line px-1.5 py-1 font-normal',
                      header.column.id === 'name' && 'w-[38%]',
                      header.column.id === 'label' && 'w-[36%]',
                      header.column.id === 'keyData' && 'w-[14%]',
                      header.column.id === 'actions' && 'w-[12%]',
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
            {table.getRowModel().rows.map((row) => {
              const attribute = row.original;
              const open = row.getIsExpanded();

              return (
                <Fragment key={row.id}>
                  <tr
                    data-attribute-name={attribute.name}
                    className={cn(
                      'border-t border-evidence-line/70 align-top',
                      open && 'bg-[#fbfbfc]',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-1.5 py-1">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                  {open ? (
                    <tr>
                      <td
                        colSpan={row.getVisibleCells().length}
                        className="border-t border-evidence-line bg-[#fbfbfc] px-2 py-1.5"
                      >
                        <div className="space-y-1">
                          <KeyDataProvenancePicker
                            entity={entity}
                            attribute={attribute}
                            graph={graph}
                            entry={entriesForEntity.find(
                              (entry) => entry.attribute === attribute.name,
                            )}
                            onBindDerivation={() =>
                              setBindingAttribute(attribute.name)
                            }
                            onClearKeyData={() =>
                              patchAttribute(attribute, { keyData: false })
                            }
                          />
                          <DerivedRuleSection
                            entity={entity}
                            graph={graph}
                            session={session}
                            attribute={attribute}
                            forceBinding={bindingAttribute === attribute.name}
                            onBindingClose={() => setBindingAttribute(null)}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => {
          const next = nextAttributeName(attributes);

          session.dispatch(
            new AddAttributeCommand(entity.id, {
              name: next.name,
              label: `新属性（New Attribute ${next.index}）`,
              meaning: '待补充提供方与算法。',
              valueType: 'string',
            }),
          );
        }}
        className="w-full rounded border border-dashed border-evidence-line py-1 text-[10px] text-evidence-muted hover:border-evidence-accent hover:text-evidence-ink"
      >
        添加属性
      </button>
    </div>
  );
};

const CommitInput = ({
  value,
  ariaLabel,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  onCommit: (next: string) => void;
}) => {
  const [draft, setDraft] = useState(value);

  return (
    <input
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setDraft(value)}
      onBlur={() => {
        if (draft !== value) {
          onCommit(draft);
        }
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
      className="w-full rounded border border-evidence-line bg-white px-1.5 py-1 text-[11px]"
    />
  );
};
