import { useMemo } from 'react';
import { Plus } from 'lucide-react';

import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import type { EntityAST } from '@evidence-poc/evidence-schema';
import { Button, cn } from '@evidence-poc/desktop-ui-kit';

const GROUPS = [
  { category: 'evidence', label: '核心事实 (Evidence)' },
  { category: 'participant', label: '参与方 (Participant)' },
  { category: 'role', label: '角色 (Role)' },
] as const;

type DirectoryCategory = (typeof GROUPS)[number]['category'];

interface EntityDrawerProps {
  graph: DomainGraph;
  selectedNodeId: string | null;
  onReveal: (nodeId: string) => void;
  onCreate: () => void;
}

export const EntityDrawer = ({
  graph,
  selectedNodeId,
  onReveal,
  onCreate,
}: EntityDrawerProps) => {
  const { groups, count } = useMemo(() => {
    const groups: Record<DirectoryCategory, EntityAST[]> = {
      evidence: [],
      participant: [],
      role: [],
    };
    let count = 0;
    for (const entity of graph.entities()) {
      // Contexts are containers, not selectable canvas nodes.
      if (entity.category === 'context') continue;
      groups[entity.category].push(entity);
      count += 1;
    }
    return { groups, count };
  }, [graph]);

  return (
    <aside
      aria-label="实体目录"
      data-workbench-chrome=""
      className="flex w-[220px] shrink-0 flex-col border-r border-workbench-border bg-white"
    >
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-workbench-border px-3">
        <h2 className="text-xs font-semibold text-evidence-ink">
          实体目录 ({count})
        </h2>
        <Button type="button" size="xs" variant="ghost" onClick={onCreate}>
          <Plus aria-hidden="true" className="size-3" />
          新建
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {count === 0 ? (
          <p className="px-1.5 py-1 text-xs text-workbench-muted">
            暂无可定位的实体
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {GROUPS.map(({ category, label }) => {
              const entities = groups[category];
              if (entities.length === 0) return null;
              return (
                <section key={category}>
                  <h3 className="px-1.5 py-1 text-[11px] font-medium text-workbench-muted">
                    {label}
                  </h3>
                  <ul>
                    {entities.map((entity) => {
                      const selected = selectedNodeId === entity.id;
                      return (
                        <li key={entity.id}>
                          <button
                            type="button"
                            aria-current={selected || undefined}
                            title={`${entity.label} · ${entity.id}`}
                            onClick={() => onReveal(entity.id)}
                            className={cn(
                              'flex min-h-7 w-full items-center gap-2 rounded px-2 text-start text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-evidence-accent focus-visible:outline-none',
                              selected
                                ? 'bg-workbench-subtle font-medium text-evidence-ink'
                                : 'text-workbench-label hover:bg-workbench-background hover:text-evidence-ink',
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {entity.label}
                            </span>
                            {selected ? (
                              <span
                                aria-hidden="true"
                                className="size-1.5 shrink-0 rounded-full bg-evidence-accent"
                              />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
