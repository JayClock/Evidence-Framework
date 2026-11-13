import { useId } from 'react';
import type { ContextLayoutGroup } from '@evidence-poc/evidence-canvas-interaction';

export const ScopeFilterControl = ({
  contextGroups,
  selectedScope,
  onScopeChange,
}: {
  contextGroups: readonly ContextLayoutGroup[];
  selectedScope: string | null;
  onScopeChange: (id: string | null) => void;
}) => {
  const id = useId();
  return (
    <div
      data-canvas-control=""
      data-evidence-capture-hide=""
      className="absolute top-9 left-9 z-30 flex max-w-[calc(100%-48px)] items-center gap-2 rounded-md border border-evidence-line bg-white/95 px-2 py-1 text-[11px] shadow-sm"
    >
      <label htmlFor={id} className="shrink-0 text-evidence-muted">
        聚焦范围
      </label>
      <select
        id={id}
        value={selectedScope ?? ''}
        onChange={(event) => onScopeChange(event.target.value || null)}
        className="min-w-0 max-w-64 rounded border border-evidence-line bg-white px-1 py-0.5 text-evidence-ink"
      >
        <option value="">全部业务边界（全景）</option>
        {contextGroups.map((group) => (
          <option key={group.contextId} value={group.contextId}>
            {'　'.repeat(group.depth)}
            {group.entity.label}
          </option>
        ))}
      </select>
    </div>
  );
};
