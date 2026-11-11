import { useMemo, useState } from 'react';

import {
  type AttributeAST,
  type EntityAST,
  type ValueType,
} from '@evidence-poc/evidence-schema';
import {
  AddAttributeCommand,
  BindDerivedRuleCommand,
  RemoveAttributeCommand,
  UpdateAttributeCommand,
  UpdateRuleCommand,
  analyzeCelExpression,
  bindingsForAliases,
  buildKeyDataLedger,
  type DomainGraph,
  type ModelSession,
} from '@evidence-poc/evidence-model-core/browser';

import { InlineCelEditor } from './InlineCelEditor';
import { KeyDataProvenancePicker } from './KeyDataProvenancePicker';
import { useCelCompletion } from './useCelCompletion';

interface AttributeTableEditorProps {
  entity: EntityAST;
  graph: DomainGraph;
  session: ModelSession;
}

const VALUE_TYPE_OPTIONS: readonly ValueType[] = [
  'string',
  'int',
  'uint',
  'double',
  'decimal',
  'money',
  'bool',
  'timestamp',
  'duration',
  'date',
  'enum',
  'id',
];

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
 * The key data ledger entry point.
 *
 * Editing an attribute always goes through a command, so every keystroke that
 * lands in the model is one undo step — and the provenance badge next to it is
 * derived from the same document, not from a second flag someone could forget.
 */
export const AttributeTableEditor = ({
  entity: selected,
  graph,
  session,
}: AttributeTableEditorProps) => {
  const [bindingAttribute, setBindingAttribute] = useState<string | null>(null);
  // The parent re-reads the session on every document change, so the graph prop
  // is the freshest view of this object; the id keeps it stable across edits.
  const entity = graph.getEntity(selected.id) ?? selected;
  const attributes = entity.attributes ?? [];
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[9px] text-[#8a929e]">
        <span>属性清单</span>
        <span data-ledger-summary={entity.id}>
          关键数据 {entriesForEntity.length} 项
          {decisionOwed.length > 0 ? ` · 待决 ${decisionOwed.length} 项` : ''}
        </span>
      </div>

      <table className="w-full table-fixed border-collapse text-[10px]">
        <thead>
          <tr className="text-left text-[#8a929e]">
            <th className="w-[32%] py-0.5 font-normal">属性名</th>
            <th className="w-[26%] py-0.5 font-normal">业务名称</th>
            <th className="w-[18%] py-0.5 font-normal">类型</th>
            <th className="w-[14%] py-0.5 font-normal">关键</th>
            <th className="w-[10%] py-0.5 font-normal">操作</th>
          </tr>
        </thead>
        <tbody>
          {attributes.map((attribute) => (
            <tr
              key={attribute.name}
              data-attribute-name={attribute.name}
              className="border-t border-evidence-line/70 align-top"
            >
              <td className="py-1 pr-1">
                <code className="block truncate font-mono text-[9px] text-evidence-muted">
                  {attribute.name}
                </code>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  <label className="flex items-center gap-1 text-[8px] text-evidence-muted">
                    <input
                      type="checkbox"
                      aria-label={`${attribute.name} 必填`}
                      checked={attribute.required === true}
                      onChange={(event) =>
                        patchAttribute(attribute, {
                          required: event.target.checked || undefined,
                        })
                      }
                    />
                    必填
                  </label>
                  {attribute.derivedByRuleRef !== undefined ? (
                    <span className="rounded bg-[#eef2f7] px-1 text-[8px] text-evidence-accent">
                      派生
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="py-1 pr-1">
                <TextInput
                  value={attribute.label}
                  ariaLabel={`${attribute.name} 业务名称`}
                  onCommit={(label) => patchAttribute(attribute, { label })}
                />
              </td>
              <td className="py-1 pr-1">
                <select
                  aria-label={`${attribute.name} 数据类型`}
                  value={attribute.valueType ?? 'string'}
                  onChange={(event) =>
                    patchAttribute(attribute, {
                      valueType: event.target.value as ValueType,
                    })
                  }
                  className="w-full rounded border border-evidence-line bg-white px-1 py-0.5 text-[9px]"
                >
                  {VALUE_TYPE_OPTIONS.map((type) => (
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
                      patchAttribute(attribute, {
                        keyData: event.target.checked,
                      })
                    }
                  />
                  <span className="text-[9px] text-evidence-muted">
                    {attribute.keyData === true ? '关键数据' : '普通'}
                  </span>
                </label>
              </td>
              <td className="py-1">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {attributes.map((attribute) => (
        <div key={`${attribute.name}-provenance`}>
          <KeyDataProvenancePicker
            entity={entity}
            attribute={attribute}
            graph={graph}
            entry={entriesForEntity.find(
              (entry) => entry.attribute === attribute.name,
            )}
            onBindDerivation={() => setBindingAttribute(attribute.name)}
            onClearKeyData={() => patchAttribute(attribute, { keyData: false })}
          />
          <DerivedRuleEditor
            entity={entity}
            graph={graph}
            session={session}
            attribute={attribute}
            forceBinding={bindingAttribute === attribute.name}
            onBindingClose={() => setBindingAttribute(null)}
          />
        </div>
      ))}

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
        className="rounded border border-evidence-line px-2 py-1 text-[10px] text-evidence-muted hover:border-evidence-accent hover:text-evidence-ink"
      >
        添加属性
      </button>
    </div>
  );
};

const TextInput = ({
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

interface DerivedRuleEditorProps {
  entity: EntityAST;
  graph: DomainGraph;
  session: ModelSession;
  attribute: AttributeAST;
  forceBinding: boolean;
  onBindingClose: () => void;
}

const DerivedRuleEditor = ({
  entity,
  graph,
  session,
  attribute,
  forceBinding,
  onBindingClose,
}: DerivedRuleEditorProps) => {
  const [binding, setBinding] = useState(false);
  const rule =
    attribute.derivedByRuleRef === undefined
      ? undefined
      : graph.getRule(attribute.derivedByRuleRef);
  const candidates = useCelCompletion({
    graph,
    entityRef: entity.id,
    ...(rule === undefined ? {} : { ruleId: rule.id }),
  });
  const showBinding = binding || forceBinding;
  const ariaLabel = `${attribute.name} CEL 表达式`;

  if (rule === undefined) {
    return (
      <div className="mt-1 rounded border border-dashed border-evidence-line px-2 py-1">
        <p className="text-[9px] text-[#8a929e]">
          {attribute.name}：未声明派生规则
        </p>
        {showBinding ? (
          <BindRuleForm
            entity={entity}
            attribute={attribute}
            candidates={candidates}
            onCancel={() => {
              setBinding(false);
              onBindingClose();
            }}
            onBind={(input) => {
              session.dispatch(
                new BindDerivedRuleCommand({
                  entityRef: entity.id,
                  attribute: attribute.name,
                  rule: input,
                }),
              );
              setBinding(false);
              onBindingClose();
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
    <div className="mt-1 rounded border border-evidence-line bg-white px-2 py-1">
      <p className="text-[9px] font-medium text-[#59606c]">
        {attribute.name} 派生计算
      </p>
      <p className="mt-0.5 text-[9px] leading-snug text-[#6b7280]">
        {rule.description}
      </p>
      <InlineCelEditor
        value={rule.expression}
        candidates={candidates}
        ariaLabel={ariaLabel}
        onCommit={(expression) => {
          if (expression !== rule.expression) {
            session.dispatch(new UpdateRuleCommand(rule.id, { expression }));
          }
        }}
      />
      <p className="mt-0.5 text-[8px] text-[#8a929e]">输入：{inputs}</p>
    </div>
  );
};

const BindRuleForm = ({
  entity,
  attribute,
  candidates,
  onBind,
  onCancel,
}: {
  entity: EntityAST;
  attribute: AttributeAST;
  candidates: ReturnType<typeof useCelCompletion>;
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
  const [aliases, setAliases] = useState<readonly string[]>(['self']);
  const analysis = analyzeCelExpression({ expression, candidates });
  const bindings = bindingsForAliases(candidates, aliases);
  const canSave = analysis.ok && Object.keys(bindings).length > 0;

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
      <InlineCelEditor
        value={expression}
        candidates={candidates}
        ariaLabel="派生规则表达式"
        placeholder="contract.unit_price * self.quantity"
        onCommit={(next) => {
          setExpression(next);
          setAliases(analyzeCelExpression({ expression: next, candidates }).identifiers);
        }}
      />
      <div className="flex gap-1">
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onBind({
              id: ruleId,
              label: `${attribute.label} 派生规则`,
              description,
              bindings: bindings as Record<string, { ref: string }>,
              expression,
              resultType: attribute.valueType ?? 'dynamic',
            })
          }
          className="rounded bg-evidence-accent px-1.5 py-0.5 text-[9px] text-white disabled:opacity-40"
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
