import { useMemo, useState } from 'react';

import {
  type AttributeAST,
  type EntityAST,
  type InspectorPropertyDefinition,
  type InspectorReferenceConstraint,
  type ValueType,
  getInspectorGroups,
  getReferenceConstraint,
} from '@evidence-poc/evidence-schema';
import {
  BindDerivedRuleCommand,
  UpdateEntityCommand,
  UpdateRuleCommand,
  type DomainGraph,
  type ModelSelection,
  type ModelSession,
} from '@evidence-poc/evidence-model-core/browser';

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

  if (entity === undefined) {
    return <InspectorShell>选择画布上的业务对象查看属性。</InspectorShell>;
  }

  return (
    <InspectorShell>
      <InspectorBody
        key={entity.id}
        graph={graph}
        session={session}
        entity={entity}
      />
    </InspectorShell>
  );
};

const InspectorShell = ({ children }: { children: React.ReactNode }) => (
  <aside className="flex h-full min-h-0 w-[324px] shrink-0 flex-col border-l border-evidence-line bg-white/70">
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
}: {
  graph: DomainGraph;
  session: ModelSession;
  entity: EntityAST;
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
                onAttributeCommit={(attributes) =>
                  patch({ attributes } as Partial<EntityAST>)
                }
                session={session}
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
  onAttributeCommit: (attributes: readonly AttributeAST[]) => void;
}

const PropertyRow = ({
  graph,
  entity,
  property,
  constraint,
  session,
  onPatch,
  onAttributeCommit,
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
        <AttributeTable
          entity={entity}
          graph={graph}
          session={session}
          onCommit={onAttributeCommit}
        />
      );
    case 'cel-editor':
      return (
        <span className="text-[10px] text-evidence-muted">
          在属性表中编辑。
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

interface AttributeTableProps {
  entity: EntityAST;
  graph: DomainGraph;
  session: ModelSession;
  onCommit: (attributes: readonly AttributeAST[]) => void;
}

const updateAttribute = (
  attributes: readonly AttributeAST[],
  name: string,
  patch: Partial<AttributeAST>,
): AttributeAST[] =>
  attributes.map((attribute) =>
    attribute.name === name ? { ...attribute, ...patch } : attribute,
  );

const AttributeTable = ({
  entity,
  graph,
  session,
  onCommit,
}: AttributeTableProps) => {
  const attributes = entity.attributes ?? [];

  return (
    <div className="space-y-2">
      <table className="w-full table-fixed border-collapse text-[10px]">
        <thead>
          <tr className="text-left text-[#8a929e]">
            <th className="w-[34%] py-0.5 font-normal">属性名</th>
            <th className="w-[26%] py-0.5 font-normal">业务名称</th>
            <th className="w-[20%] py-0.5 font-normal">类型</th>
            <th className="w-[20%] py-0.5 font-normal">关键</th>
          </tr>
        </thead>
        <tbody>
          {attributes.map((attribute) => {
            return (
              <tr
                key={attribute.name}
                data-attribute-name={attribute.name}
                className="border-t border-evidence-line/70 align-top"
              >
                <td className="py-1 pr-1">
                  <code className="block truncate font-mono text-[9px] text-evidence-muted">
                    {attribute.name}
                  </code>
                  {attribute.keyData === true ? (
                    <span className="mt-0.5 inline-block rounded bg-[#fdeef2] px-1 text-[8px] text-evidence-evidence">
                      关键数据
                    </span>
                  ) : null}
                </td>
                <td className="py-1 pr-1">
                  <TextInput
                    value={attribute.label}
                    onCommit={(label) =>
                      onCommit(
                        updateAttribute(attributes, attribute.name, { label }),
                      )
                    }
                  />
                </td>
                <td className="py-1 pr-1">
                  <select
                    aria-label={`${attribute.name} 数据类型`}
                    value={attribute.valueType ?? 'string'}
                    onChange={(event) =>
                      onCommit(
                        updateAttribute(attributes, attribute.name, {
                          valueType: event.target
                            .value as AttributeAST['valueType'],
                        }),
                      )
                    }
                    className="w-full rounded border border-evidence-line bg-white px-1 py-0.5 text-[9px]"
                  >
                    {[
                      'string',
                      'int',
                      'decimal',
                      'money',
                      'bool',
                      'timestamp',
                      'duration',
                    ].map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={attribute.keyData === true}
                      aria-label={`${attribute.name} 关键数据`}
                      onChange={(event) =>
                        onCommit(
                          updateAttribute(attributes, attribute.name, {
                            keyData: event.target.checked,
                          }),
                        )
                      }
                    />
                    <span className="text-[9px] text-evidence-muted">
                      {attribute.required === true ? '必填' : '选填'}
                    </span>
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {attributes.map((attribute) => (
        <DerivedRuleEditor
          key={`${attribute.name}-rule`}
          entity={entity}
          graph={graph}
          session={session}
          attribute={attribute}
          rule={
            attribute.derivedByRuleRef === undefined
              ? undefined
              : graph.getRule(attribute.derivedByRuleRef)
          }
        />
      ))}

      <button
        type="button"
        onClick={() => {
          let index = attributes.length + 1;
          let name = `attribute_${index}`;

          while (attributes.some((attribute) => attribute.name === name)) {
            index += 1;
            name = `attribute_${index}`;
          }

          onCommit([
            ...attributes,
            {
              name,
              label: `新属性（New Attribute ${index}）`,
              meaning: '待补充提供方与算法。',
              valueType: 'string',
            },
          ]);
        }}
        className="rounded border border-evidence-line px-2 py-1 text-[10px] text-evidence-muted hover:border-evidence-accent hover:text-evidence-ink"
      >
        添加属性
      </button>
    </div>
  );
};

interface DerivedRuleEditorProps {
  entity: EntityAST;
  graph: DomainGraph;
  session: ModelSession;
  attribute: AttributeAST;
  rule: ReturnType<DomainGraph['getRule']>;
}

const DerivedRuleEditor = ({
  entity,
  graph,
  session,
  attribute,
  rule,
}: DerivedRuleEditorProps) => {
  const [binding, setBinding] = useState(false);
  const [expression, setExpression] = useState(rule?.expression ?? '');

  if (rule === undefined) {
    return (
      <div className="rounded border border-dashed border-evidence-line px-2 py-1">
        <p className="text-[9px] text-[#8a929e]">
          {attribute.name}：未声明派生规则
        </p>
        {binding ? (
          <BindRuleForm
            entity={entity}
            attribute={attribute}
            onCancel={() => setBinding(false)}
            onBind={(input) => {
              session.dispatch(
                new BindDerivedRuleCommand({
                  entityRef: entity.id,
                  attribute: attribute.name,
                  rule: input,
                }),
              );
              setBinding(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setBinding(true)}
            className="mt-0.5 text-[9px] text-evidence-accent underline decoration-dotted"
          >
            绑定派生规则
          </button>
        )}
      </div>
    );
  }

  const inputs = Object.entries(rule.bindings)
    .map(([alias, value]) =>
      'ref' in value
        ? `${alias} → ${graph.getEntity(value.ref)?.label ?? value.ref}`
        : `${alias} → 运行时 ${value.type}`,
    )
    .join('，');

  return (
    <div className="rounded border border-evidence-line bg-white px-2 py-1">
      <p className="text-[9px] font-medium text-[#59606c]">
        {attribute.name} 派生计算
      </p>
      <p className="mt-0.5 text-[9px] leading-snug text-[#6b7280]">
        {rule.description}
      </p>
      <textarea
        aria-label={`${attribute.name} CEL 表达式`}
        value={expression}
        onChange={(event) => setExpression(event.target.value)}
        onBlur={() => {
          if (expression !== rule.expression) {
            session.dispatch(new UpdateRuleCommand(rule.id, { expression }));
          }
        }}
        rows={2}
        spellCheck={false}
        className="mt-1 w-full rounded border border-evidence-line bg-[#fbfbfc] px-1.5 py-1 font-mono text-[9px]"
      />
      <p className="mt-0.5 text-[8px] text-[#8a929e]">输入：{inputs}</p>
    </div>
  );
};

const BindRuleForm = ({
  entity,
  attribute,
  onBind,
  onCancel,
}: {
  entity: EntityAST;
  attribute: AttributeAST;
  onBind: (rule: {
    id: string;
    label: string;
    description: string;
    bindings: Record<string, { ref: string }>;
    expression: string;
    resultType: ValueType;
  }) => void;
  onCancel: () => void;
}) => {
  const [ruleId, setRuleId] = useState(
    `rule.${entity.id}.${attribute.name}`.replaceAll('_', '-'),
  );
  const [description, setDescription] = useState(
    `${attribute.label} 的派生计算。`,
  );
  const [expression, setExpression] = useState('self.');

  return (
    <div className="mt-1 space-y-1">
      <input
        aria-label="派生规则 ID"
        value={ruleId}
        onChange={(event) => setRuleId(event.target.value)}
        className="w-full rounded border border-evidence-line bg-white px-1.5 py-0.5 font-mono text-[9px]"
      />
      <input
        aria-label="派生规则业务解释"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className="w-full rounded border border-evidence-line bg-white px-1.5 py-0.5 text-[9px]"
      />
      <input
        aria-label="派生规则表达式"
        value={expression}
        onChange={(event) => setExpression(event.target.value)}
        className="w-full rounded border border-evidence-line bg-white px-1.5 py-0.5 font-mono text-[9px]"
      />
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() =>
            onBind({
              id: ruleId,
              label: `${attribute.label} 派生规则`,
              description,
              bindings: { self: { ref: entity.id } },
              expression,
              resultType: attribute.valueType ?? 'dynamic',
            })
          }
          className="rounded bg-evidence-accent px-1.5 py-0.5 text-[9px] text-white"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-evidence-line px-1.5 py-0.5 text-[9px] text-evidence-muted"
        >
          取消
        </button>
      </div>
    </div>
  );
};
