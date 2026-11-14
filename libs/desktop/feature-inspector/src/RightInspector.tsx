import { useEffect, useMemo, useState } from 'react';

import {
  type EntityAST,
  type InspectorPropertyDefinition,
  type InspectorReferenceConstraint,
  getInspectorGroups,
  getReferenceConstraint,
} from '@evidence-poc/evidence-schema';
import {
  UpdateEntityCommand,
  type DomainGraph,
  type ModelSelection,
  type ModelSession,
} from '@evidence-poc/evidence-model-core/browser';

import { AttributeDataGrid } from './inspector/AttributeDataGrid';
import { FulfillmentPairSection } from './inspector/FulfillmentPairSection';
import { KeyDataLedgerStudio } from './inspector/KeyDataLedgerStudio';

interface RightInspectorProps {
  graph: DomainGraph;
  session: ModelSession;
  selection: ModelSelection;
}

const fieldValue = (entity: EntityAST, field: string): unknown =>
  (entity as unknown as Record<string, unknown>)[field];

const referenceOptions = (
  graph: DomainGraph,
  entity: EntityAST,
  constraint: InspectorReferenceConstraint | undefined,
): readonly EntityAST[] => {
  if (constraint === undefined) {
    return [];
  }

  return graph.entities().filter((candidate) => {
    if (!constraint.categories.includes(candidate.category)) {
      return false;
    }

    if (
      constraint.kinds !== undefined &&
      !constraint.kinds.includes(candidate.kind)
    ) {
      return false;
    }

    if (constraint.sameContext === true) {
      const candidateContext =
        'contextRef' in candidate ? candidate.contextRef : undefined;
      const entityContext =
        'contextRef' in entity ? entity.contextRef : undefined;

      return candidateContext === entityContext;
    }

    return true;
  });
};

/**
 * Right-hand inspector generated from the Phase 1 registry, so a new category
 * field only has to be declared once in `evidence-schema`.
 */
export const RightInspector = ({
  graph,
  session,
  selection,
}: RightInspectorProps) => {
  const entity =
    selection.nodeId === null ? undefined : graph.getEntity(selection.nodeId);
  const [studioOpen, setStudioOpen] = useState(false);

  // Alt+L opens the wide ledger, but only while an object is being inspected:
  // the studio has nothing to show without one.
  useEffect(() => {
    if (entity === undefined) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.code !== 'KeyL') {
        return;
      }

      event.preventDefault();
      setStudioOpen(true);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entity]);

  if (entity === undefined) {
    return <InspectorShell>选择画布上的业务对象查看属性。</InspectorShell>;
  }

  return (
    <>
      <InspectorShell>
        <InspectorBody
          key={entity.id}
          graph={graph}
          session={session}
          entity={entity}
          onOpenStudio={() => setStudioOpen(true)}
        />
      </InspectorShell>

      {studioOpen ? (
        <KeyDataLedgerStudio
          entity={entity}
          graph={graph}
          session={session}
          initialAttribute={selection.attributeName}
          onClose={() => setStudioOpen(false)}
        />
      ) : null}
    </>
  );
};

const InspectorShell = ({ children }: { children: React.ReactNode }) => (
  <aside className="flex h-full min-h-0 w-full flex-col bg-white/70">
    <div className="border-b border-evidence-line px-3 py-2 text-[10px] tracking-wide text-evidence-muted uppercase">
      检视器
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[11px]">
      {children}
    </div>
  </aside>
);

const InspectorBody = ({
  graph,
  session,
  entity,
  onOpenStudio,
}: {
  graph: DomainGraph;
  session: ModelSession;
  entity: EntityAST;
  onOpenStudio?: () => void;
}) => {
  const groups = useMemo(
    () => getInspectorGroups(entity.category),
    [entity.category],
  );

  const patch = (fields: Readonly<Partial<EntityAST>>) => {
    session.dispatch(new UpdateEntityCommand(entity.id, fields));
  };

  return (
    <div className="space-y-4">
      {entity.category === 'evidence' &&
      entity.kind === 'fulfillment_request' ? (
        <FulfillmentPairSection
          entity={entity}
          graph={graph}
          session={session}
        />
      ) : null}

      {groups.map((group) => (
        <section key={group.id}>
          <h3 className="mb-1.5 text-[10px] font-semibold tracking-wide text-[#59606c] uppercase">
            {group.label}
          </h3>
          <div className="space-y-1.5">
            {group.properties.map((property) => (
              <PropertyRow
                key={property.field}
                graph={graph}
                entity={entity}
                property={property}
                constraint={getReferenceConstraint(
                  entity.category,
                  property.field,
                )}
                onPatch={patch}
                session={session}
                {...(onOpenStudio === undefined ? {} : { onOpenStudio })}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

interface PropertyRowProps {
  graph: DomainGraph;
  entity: EntityAST;
  property: InspectorPropertyDefinition;
  constraint: InspectorReferenceConstraint | undefined;
  session: ModelSession;
  onPatch: (fields: Readonly<Partial<EntityAST>>) => void;
  onOpenStudio?: () => void;
}

const PropertyRow = ({
  graph,
  entity,
  property,
  constraint,
  session,
  onPatch,
  onOpenStudio,
}: PropertyRowProps) => {
  const value = fieldValue(entity, property.field);

  switch (property.editor) {
    case 'readonly-id':
      return (
        <Labeled label={property.label} helper={property.helper}>
          <code className="block truncate font-mono text-[10px] text-evidence-muted">
            {String(value ?? '')}
          </code>
        </Labeled>
      );
    case 'text':
      return (
        <Labeled label={property.label} helper={property.helper}>
          <TextInput
            value={typeof value === 'string' ? value : ''}
            onCommit={(next) => onPatch({ [property.field]: next })}
          />
        </Labeled>
      );
    case 'select':
      return (
        <Labeled label={property.label} helper={property.helper}>
          <select
            aria-label={property.label}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) =>
              onPatch({ [property.field]: event.target.value })
            }
            className="w-full rounded border border-evidence-line bg-white px-1.5 py-1 text-[11px]"
          >
            {(property.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Labeled>
      );
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-[11px] text-[#414751]">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) =>
              onPatch({ [property.field]: event.target.checked })
            }
          />
          {property.label}
        </label>
      );
    case 'reference-picker':
      return (
        <Labeled label={property.label} helper={property.helper}>
          <select
            aria-label={property.label}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) =>
              onPatch({
                [property.field]:
                  event.target.value === '' ? undefined : event.target.value,
              })
            }
            className="w-full rounded border border-evidence-line bg-white px-1.5 py-1 text-[11px]"
          >
            <option value="">未声明</option>
            {referenceOptions(graph, entity, constraint).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Labeled>
      );
    case 'reference-list':
      return (
        <Labeled label={property.label} helper={property.helper}>
          <div className="flex flex-wrap gap-1">
            {referenceOptions(graph, entity, constraint).map((option) => {
              const list = Array.isArray(value) ? (value as string[]) : [];
              const active = list.includes(option.id);

              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onPatch({
                      [property.field]: active
                        ? list.filter((item) => item !== option.id)
                        : [...list, option.id],
                    })
                  }
                  className={[
                    'rounded border px-1.5 py-0.5 text-[10px]',
                    active
                      ? 'border-evidence-accent bg-[#e8eef6] text-evidence-ink'
                      : 'border-evidence-line text-evidence-muted hover:border-evidence-accent',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </Labeled>
      );
    case 'attribute-table':
      return (
        <AttributeDataGrid
          entity={entity}
          graph={graph}
          session={session}
          {...(onOpenStudio === undefined ? {} : { onOpenStudio })}
        />
      );
    case 'cel-editor':
      return (
        <span className="text-[10px] text-evidence-muted">
          在属性台账中编辑。
        </span>
      );
    default:
      return null;
  }
};

const Labeled = ({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) => (
  <div>
    <p className="text-[10px] text-[#5b6270]">{label}</p>
    {children}
    {helper !== undefined ? (
      <p className="mt-0.5 text-[9px] leading-snug text-[#9aa1ac]">{helper}</p>
    ) : null}
  </div>
);

const TextInput = ({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) => {
  const [draft, setDraft] = useState(value);

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) {
          onCommit(draft);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      className="w-full rounded border border-evidence-line bg-white px-1.5 py-1 text-[11px]"
    />
  );
};
