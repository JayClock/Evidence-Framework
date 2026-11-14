import { useState } from 'react';

import type {
  AttributeAST,
  EntityAST,
  ValueType,
} from '@evidence-poc/evidence-schema';
import {
  BindDerivedRuleCommand,
  UpdateRuleCommand,
  analyzeCelExpression,
  bindingsForAliases,
  type DomainGraph,
  type ModelSession,
} from '@evidence-poc/evidence-model-core/browser';

import { CelCodeMirrorEditor } from './cel/CelCodeMirrorEditor';
import { useCelCompletion } from './useCelCompletion';

export interface DerivedRuleSectionProps {
  entity: EntityAST;
  graph: DomainGraph;
  session: ModelSession;
  attribute: AttributeAST;
  /** Opened by the ledger picker rather than by the row itself. */
  forceBinding?: boolean;
  onBindingClose?: () => void;
}

/**
 * The derivation rule of one attribute, and the form that binds a new one.
 *
 * It reads the rule back from the graph every render, so the expression on
 * screen is the expression the model holds — never a draft the schema rejected.
 */
export const DerivedRuleSection = ({
  entity,
  graph,
  session,
  attribute,
  forceBinding = false,
  onBindingClose,
}: DerivedRuleSectionProps) => {
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
  const closeBinding = () => {
    setBinding(false);
    onBindingClose?.();
  };

  if (rule === undefined) {
    return (
      <div
        data-derived-rule-for={attribute.name}
        className="rounded border border-dashed border-evidence-line px-2 py-1"
      >
        <p className="text-[9px] text-[#8a929e]">
          {attribute.name}：未声明派生规则
        </p>
        {showBinding ? (
          <BindRuleForm
            entity={entity}
            attribute={attribute}
            candidates={candidates}
            onCancel={closeBinding}
            onBind={(input) => {
              session.dispatch(
                new BindDerivedRuleCommand({
                  entityRef: entity.id,
                  attribute: attribute.name,
                  rule: input,
                }),
              );
              closeBinding();
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
    <div
      data-derived-rule-for={attribute.name}
      className="rounded border border-evidence-line bg-white px-2 py-1"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[9px] font-medium text-[#59606c]">
          {attribute.name} 派生计算
        </p>
        <code className="truncate font-mono text-[8px] text-[#9aa1ac]">
          {rule.id}
        </code>
      </div>
      <p className="mt-0.5 text-[9px] leading-snug text-[#6b7280]">
        {rule.description}
      </p>
      <div className="mt-1">
        <CelCodeMirrorEditor
          value={rule.expression}
          candidates={candidates}
          ariaLabel={ariaLabel}
          onCommit={(expression) => {
            if (expression !== rule.expression) {
              session.dispatch(new UpdateRuleCommand(rule.id, { expression }));
            }
          }}
        />
      </div>
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
      <CelCodeMirrorEditor
        value={expression}
        candidates={candidates}
        ariaLabel="派生规则表达式"
        placeholder="contract.unit_price * self.quantity"
        autoFocus
        onCommit={(next) => {
          setExpression(next);
          setAliases(
            analyzeCelExpression({ expression: next, candidates }).identifiers,
          );
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
