import { useEffect, useMemo, useState } from 'react';
import { Button } from '@evidence-poc/desktop-ui-kit';

import {
  type EntityAST,
  type InspectorPropertyDefinition,
  type InspectorReferenceConstraint,
  getInspectorGroups,
  getReferenceConstraint,
} from '@evidence-poc/evidence-schema';
import {
  updateEntityMutator,
  type DomainGraph,
  type ModelSelection,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';

import { RelationshipFlowSection } from './inspector/RelationshipFlowSection';
import { AttributeDataGrid } from './inspector/AttributeDataGrid';
import { FulfillmentPairSection } from './inspector/FulfillmentPairSection';
import { KeyDataLedgerSheet } from './inspector/KeyDataLedgerSheet';
import { InvariantRulesSection } from './inspector/InvariantRulesSection';

interface RightInspectorProps {
  /** The workspace shell can provide its own heading/switcher. */
  showHeading?: boolean;
  active?: boolean;
  graph: DomainGraph;
  session: ModelSession;
  selection: ModelSelection;
  evidenceActions?: { onTrace: () => void; onWhatIf?: () => void };
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

/** Schema-driven entity editor inside the workbench's existing right pane. */
export const RightInspector = ({
  showHeading = true,
  active = true,
  graph,
  session,
  selection,
  evidenceActions,
}: RightInspectorProps) => {
  const entity =
    selection.nodeId === null ? undefined : graph.getEntity(selection.nodeId);
  return entity === undefined ? (
    <InspectorShell showHeading={showHeading}>
      选择画布上的业务对象查看属性。
    </InspectorShell>
  ) : (
    <SelectedInspector
      key={entity.id}
      entity={entity}
      showHeading={showHeading}
      active={active}
      graph={graph}
      session={session}
      selection={selection}
      evidenceActions={evidenceActions}
    />
  );
};

const SelectedInspector = ({
  entity,
  showHeading,
  active,
  graph,
  session,
  selection,
  evidenceActions,
}: RightInspectorProps & {
  entity: EntityAST;
  showHeading: boolean;
  active: boolean;
}) => {
  const [studioOpen, setStudioOpen] = useState(false);
  const attributeCount = entity.attributes?.length ?? 0;

  useEffect(() => {
    if (!active || attributeCount === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !event.altKey ||
        event.code !== 'KeyL' ||
        (target instanceof Element &&
          target.closest(
            'input, textarea, select, [contenteditable="true"], [role="dialog"]',
          ))
      )
        return;
      event.preventDefault();
      setStudioOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, attributeCount]);

  return (
    <>
      <InspectorShell
        showHeading={showHeading}
        footer={
          attributeCount === 0 ? undefined : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full justify-between"
              onClick={() => setStudioOpen(true)}
            >
              <span className="truncate">展开数据台账与 CEL 规则</span>
              <kbd className="shrink-0 text-[10px] text-workbench-muted">
                Alt+L
              </kbd>
            </Button>
          )
        }
      >
        <div className="flex min-w-0 items-baseline gap-2 text-workbench-muted">
          <span>ID:</span>
          <code title={entity.id} className="min-w-0 truncate">
            {entity.id}
          </code>
        </div>
        {evidenceActions === undefined ? null : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={evidenceActions.onTrace}
            >
              AI 追溯关键数据
            </Button>
            {evidenceActions.onWhatIf === undefined ? null : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={evidenceActions.onWhatIf}
              >
                探问 What-If
              </Button>
            )}
          </div>
        )}
        {entity.sourceSnippet === undefined ? null : (
          <section
            aria-label="依据条款原文"
            className="flex flex-col gap-1.5 rounded-md border border-workbench-border bg-workbench-background p-3"
          >
            <h3 className="font-semibold">依据条款原文</h3>
            <p className="text-workbench-body wrap-anywhere whitespace-pre-wrap">
              {entity.sourceSnippet.text}
            </p>
            <p className="wrap-anywhere text-workbench-muted">
              {entity.sourceSnippet.locator ?? '未记录定位信息'}
            </p>
          </section>
        )}
        <InspectorBody
          graph={graph}
          session={session}
          entity={entity}
          selectedAttribute={selection.attributeName}
          onOpenStudio={() => setStudioOpen(true)}
        />
      </InspectorShell>
      {active && studioOpen ? (
        <KeyDataLedgerSheet
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

const InspectorShell = ({
  children,
  footer,
  showHeading,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  showHeading: boolean;
}) => (
  <aside className="flex h-full min-h-0 w-full flex-col bg-white">
    {showHeading ? (
      <div className="border-b border-evidence-line px-3 py-2 text-[10px] tracking-wide text-evidence-muted uppercase">
        检视器
      </div>
    ) : null}
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3 text-xs">
      {children}
    </div>
    {footer === undefined ? null : (
      <div className="flex h-12 shrink-0 items-center border-t border-workbench-border px-4">
        {footer}
      </div>
    )}
  </aside>
);

const InspectorBody = ({
  graph,
  session,
  entity,
  selectedAttribute,
  onOpenStudio,
}: {
  graph: DomainGraph;
  session: ModelSession;
  entity: EntityAST;
  selectedAttribute: string | null;
  onOpenStudio: () => void;
}) => {
  const groups = useMemo(
    () => getInspectorGroups(entity.category),
    [entity.category],
  );
  const patch = (fields: Readonly<Partial<EntityAST>>) => {
    session.mutate(
      (draft) => updateEntityMutator(draft, entity.id, fields),
      'update-entity',
    );
  };

  const renderGroup = (group: (typeof groups)[number]) => {
    const properties = group.properties.filter(
      (property) =>
        property.editor !== 'readonly-id' &&
        property.editor !== 'attribute-table',
    );
    if (properties.length === 0) return null;
    return (
      <section key={group.id} className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold text-workbench-label">
          {group.label}
        </h3>
        {properties.map((property) => (
          <PropertyRow
            key={property.field}
            graph={graph}
            entity={entity}
            property={property}
            constraint={getReferenceConstraint(entity.category, property.field)}
            onPatch={patch}
          />
        ))}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {groups.filter((group) => group.id === 'general').map(renderGroup)}
      {groups.some((group) =>
        group.properties.some(
          (property) => property.editor === 'attribute-table',
        ),
      ) ? (
        <section aria-label="模型属性" className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold text-workbench-label">
            业务属性与关键数据（{entity.attributes?.length ?? 0} 个字段）
          </h3>
          <AttributeDataGrid
            entity={entity}
            graph={graph}
            session={session}
            selectedAttribute={selectedAttribute}
            onOpenStudio={onOpenStudio}
          />
        </section>
      ) : null}
      <InvariantRulesSection
        entityId={entity.id}
        graph={graph}
        session={session}
      />
      {groups.filter((group) => group.id !== 'general').map(renderGroup)}
      <RelationshipFlowSection
        entityId={entity.id}
        graph={graph}
        session={session}
      />
      {entity.category === 'evidence' &&
      entity.kind === 'fulfillment_request' ? (
        <FulfillmentPairSection
          entity={entity}
          graph={graph}
          session={session}
        />
      ) : null}
    </div>
  );
};

interface PropertyRowProps {
  graph: DomainGraph;
  entity: EntityAST;
  property: InspectorPropertyDefinition;
  constraint: InspectorReferenceConstraint | undefined;
  onPatch: (fields: Readonly<Partial<EntityAST>>) => void;
}

const PropertyRow = ({
  graph,
  entity,
  property,
  constraint,
  onPatch,
}: PropertyRowProps) => {
  const value = fieldValue(entity, property.field);

  switch (property.editor) {
    case 'text':
      return (
        <Labeled label={property.label} helper={property.helper}>
          <TextInput
            key={String(value ?? '')}
            label={property.label}
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
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
}) => {
  const [draft, setDraft] = useState(value);

  return (
    <input
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) {
          onCommit(draft);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.currentTarget.blur();
        }
      }}
      className="w-full rounded border border-evidence-line bg-white px-1.5 py-1 text-[11px]"
    />
  );
};
