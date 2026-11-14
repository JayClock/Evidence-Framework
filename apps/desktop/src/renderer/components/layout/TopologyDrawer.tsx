import { useMemo, useState } from 'react';

import type { DomainGraphLayout } from '@evidence-poc/evidence-canvas-interaction';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';

interface TopologyDrawerProps {
  graph: DomainGraph;
  layout: DomainGraphLayout;
  selectedNodeId: string | null;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onFocusNode: (nodeId: string) => void;
}

interface TreeGroup {
  contextId: string;
  label: string;
  depth: number;
  nodeIds: readonly string[];
  scenarioCount: number;
}

/**
 * Context hierarchy plus its objects.
 *
 * Contexts are containers, so they render as collapsible group headers, never as
 * selectable business objects. The drawer holds no chrome of its own: the
 * activity rail decides when it is on screen and whether it floats or is pinned.
 */
export const TopologyDrawer = ({
  graph,
  layout,
  selectedNodeId,
  searchTerm,
  onSearchTermChange,
  searchInputRef,
  onFocusNode,
}: TopologyDrawerProps) => {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const groups = useMemo<TreeGroup[]>(
    () =>
      layout.contextGroups
        .map((group) => ({
          contextId: group.contextId,
          label: group.entity.label,
          depth: group.depth,
          nodeIds: group.nodeIds,
          scenarioCount: 0,
        }))
        .sort((left, right) => left.depth - right.depth),
    [layout.contextGroups],
  );
  const matches = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (term === '') {
      return null;
    }

    return layout.nodes
      .filter(
        (node) =>
          node.entity.label.toLowerCase().includes(term) ||
          node.nodeId.toLowerCase().includes(term),
      )
      .slice(0, 30);
  }, [layout.nodes, searchTerm]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="border-b border-evidence-line p-3">
        <input
          ref={searchInputRef}
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="搜索业务对象（Cmd+F）"
          aria-label="搜索业务对象"
          className="w-full rounded border border-evidence-line bg-white px-2 py-1.5 text-[11px] outline-none focus:border-evidence-accent"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {matches !== null ? (
          <div>
            <p className="px-2 py-1 text-[10px] tracking-wide text-evidence-muted uppercase">
              搜索结果 {matches.length}
            </p>
            {matches.map((node) => (
              <button
                key={node.nodeId}
                type="button"
                onClick={() => onFocusNode(node.nodeId)}
                className={[
                  'block w-full truncate rounded px-2 py-1 text-left text-[11px]',
                  selectedNodeId === node.nodeId
                    ? 'bg-[#e8eef6] text-evidence-ink'
                    : 'text-[#414751] hover:bg-[#f1f3f6]',
                ].join(' ')}
              >
                {node.entity.label}
              </button>
            ))}
            {matches.length === 0 ? (
              <p className="px-2 py-2 text-[11px] text-evidence-muted">
                没有匹配的业务对象。
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <p className="px-2 py-1 text-[10px] tracking-wide text-evidence-muted uppercase">
              业务结构
            </p>
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.contextId);

              return (
                <div key={group.contextId} className="mb-1">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);

                        if (next.has(group.contextId)) {
                          next.delete(group.contextId);
                        } else {
                          next.add(group.contextId);
                        }

                        return next;
                      })
                    }
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[11px] font-medium text-[#3b4250] hover:bg-[#f1f3f6]"
                    style={{ paddingLeft: 8 + group.depth * 10 }}
                  >
                    <span className="text-[9px] text-evidence-muted">
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                    <span className="truncate">{group.label}</span>
                  </button>

                  {isCollapsed
                    ? null
                    : group.nodeIds.map((nodeId) => {
                        const entity = graph.getEntity(nodeId);

                        if (entity === undefined) {
                          return null;
                        }

                        return (
                          <button
                            key={nodeId}
                            type="button"
                            onClick={() => onFocusNode(nodeId)}
                            className={[
                              'block w-full truncate rounded py-1 pr-2 text-left text-[11px]',
                              selectedNodeId === nodeId
                                ? 'bg-[#e8eef6] text-evidence-ink'
                                : 'text-[#4b5563] hover:bg-[#f1f3f6]',
                            ].join(' ')}
                            style={{ paddingLeft: 20 + group.depth * 10 }}
                          >
                            {entity.label}
                          </button>
                        );
                      })}
                </div>
              );
            })}

            {layout.freeNodeIds.length > 0 ? (
              <div className="mb-1">
                <p className="px-2 py-1 text-[10px] tracking-wide text-evidence-muted uppercase">
                  独立参与者
                </p>
                {layout.freeNodeIds.map((nodeId) => {
                  const entity = graph.getEntity(nodeId);

                  return entity === undefined ? null : (
                    <button
                      key={nodeId}
                      type="button"
                      onClick={() => onFocusNode(nodeId)}
                      className={[
                        'block w-full truncate rounded py-1 pr-2 pl-5 text-left text-[11px]',
                        selectedNodeId === nodeId
                          ? 'bg-[#e8eef6] text-evidence-ink'
                          : 'text-[#4b5563] hover:bg-[#f1f3f6]',
                      ].join(' ')}
                    >
                      {entity.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <p className="mt-3 px-2 py-1 text-[10px] tracking-wide text-evidence-muted uppercase">
              验证场景
            </p>
            <p className="px-2 text-[11px] text-evidence-muted">
              尚无验证场景。
            </p>
          </>
        )}
      </div>
    </div>
  );
};
