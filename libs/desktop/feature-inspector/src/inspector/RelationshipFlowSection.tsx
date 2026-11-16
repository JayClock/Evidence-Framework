import {
  RELATIONSHIP_FLOW_KINDS,
  RELATIONSHIP_FLOW_LABELS,
  type RelationshipFlowKind,
} from '@evidence-poc/evidence-schema';
import {
  setRelationshipFlowMutator,
  type DomainGraph,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';

/** Edit the citation, not the request/confirmation pairing inferred by the canvas. */
export const RelationshipFlowSection = ({
  entityId,
  graph,
  session,
}: {
  entityId: string;
  graph: DomainGraph;
  session: ModelSession;
}) => {
  const edges = graph
    .relationships()
    .filter(
      (edge) => edge.sourceRef === entityId && edge.kind === 'references',
    );
  if (edges.length === 0) return null;
  return (
    <section aria-label="履约引用路径" className="space-y-2">
      <h3 className="font-semibold">履约引用路径</h3>
      <p className="text-evidence-muted">
        补偿请求或升级记录 → 原履约请求。标记不代表已完成履约或法务批准。
      </p>
      {edges.map((edge) => (
        <div key={edge.id} className="block">
          <span>
            {edge.label} →{' '}
            {graph.getEntity(edge.targetRef)?.label ?? edge.targetRef}
          </span>
          <select
            aria-label={`${edge.label} 路径类型`}
            value={edge.flowKind ?? 'primary'}
            onChange={(event) =>
              session.mutate(
                (draft) =>
                  setRelationshipFlowMutator(
                    draft,
                    edge.id,
                    event.target.value as RelationshipFlowKind,
                  ),
                'set-relationship-flow',
              )
            }
            className="mt-1 w-full rounded border border-evidence-line p-1"
          >
            {RELATIONSHIP_FLOW_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {RELATIONSHIP_FLOW_LABELS[kind]}
              </option>
            ))}
          </select>
          {edge.flowKind === 'escalation' ? (
            <textarea
              key={`${edge.id}:${edge.notes ?? ''}`}
              aria-label={`${edge.label} 升级交接说明`}
              defaultValue={edge.notes ?? ''}
              placeholder="说明移交给谁、由什么受理记录证明；不代表司法裁定"
              onBlur={(event) => {
                const notes = event.target.value.trim();
                if (notes === (edge.notes ?? '')) return;
                session.mutate((draft) => {
                  const current = draft.relationships.find(
                    (item) => item.id === edge.id,
                  );
                  if (current === undefined) return;
                  if (notes === '') delete current.notes;
                  else current.notes = notes;
                }, 'update-escalation-notes');
              }}
              className="mt-1 w-full rounded border border-evidence-line p-1"
            />
          ) : null}
        </div>
      ))}
    </section>
  );
};
