import type {
  ContextScope,
  DomainGraphLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import type { SensorIssue } from '@evidence-poc/evidence-agent/browser';
import { diagnosticColor, type DiagnosticIndex } from './diagnosticIndex';
import { pointOnRoute } from './edgeLabels';

/** Sibling controls avoid nested buttons and leave selection/patch rings intact. */
export const DiagnosticMarkers = ({
  index,
  layout,
  scope,
  onOpen,
}: {
  index: DiagnosticIndex;
  layout: DomainGraphLayout;
  scope: ContextScope | null;
  onOpen: (issues: readonly SensorIssue[]) => void;
}) => (
  <>
    {[...index].map(([id, status]) => {
      const node = layout.nodes.find((item) => item.nodeId === id);
      const context = layout.contextGroups.find(
        (item) => item.contextId === id,
      );
      const edge = layout.edges.find((item) => item.relationshipId === id);
      if (
        scope &&
        !(
          scope.nodeIds.has(id) ||
          scope.contextIds.has(id) ||
          scope.edgeIds.has(id)
        )
      )
        return null;
      const box = node?.box ?? context?.box;
      const point = box
        ? { x: box.x + box.width - 16, y: box.y + box.height - 10 }
        : edge
          ? pointOnRoute(edge.points, 0.5)
          : null;
      if (!point) return null;
      const color = diagnosticColor(status.severity);
      return (
        <div key={id} data-diagnostic-for={id} data-severity={status.severity}>
          {box ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded"
              style={{
                left: box.x - 5,
                top: box.y - 5,
                width: box.width + 10,
                height: box.height + 10,
                border: `2px dotted ${color}`,
              }}
            />
          ) : null}
          <button
            type="button"
            data-canvas-control="diagnostic"
            aria-label={`${id}：${status.severity === 'block' ? '阻塞' : status.severity === 'warn' ? '警告' : '提示'} ${status.issues.length} 项`}
            title={status.issues.map((item) => item.message).join('\n')}
            className="absolute z-30 rounded-full px-1.5 text-[10px] font-bold text-white shadow"
            style={{ left: point.x, top: point.y, backgroundColor: color }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(status.issues);
            }}
          >
            {status.severity === 'info' ? 'i' : '!'} {status.issues.length}
          </button>
        </div>
      );
    })}
  </>
);
