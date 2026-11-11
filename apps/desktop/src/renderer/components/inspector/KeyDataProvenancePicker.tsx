import {
  KEY_DATA_SOURCE_LABELS,
  type AttributeAST,
  type EntityAST,
} from '@evidence-poc/evidence-schema';
import type { DomainGraph, KeyDataEntry } from '@evidence-poc/evidence-model-core/browser';

interface KeyDataProvenancePickerProps {
  entity: EntityAST;
  attribute: AttributeAST;
  graph: DomainGraph;
  entry: KeyDataEntry | undefined;
  onBindDerivation: () => void;
  onClearKeyData: () => void;
}

const providerLabel = (
  graph: DomainGraph,
  provider: KeyDataEntry['providers'][number],
): string => {
  if (provider.ref === '') {
    return `${provider.alias} → 运行时 ${provider.valueType ?? 'dynamic'}`;
  }

  const entity = graph.getEntity(provider.ref);
  const suffix =
    provider.cardinality === 'many'
      ? '（集合）'
      : '';

  return `${provider.alias} → ${entity?.label ?? provider.ref}${suffix}`;
};

/**
 * Shows how one key data item is provided.
 *
 * The verdict comes from the same classification the pinned checker uses, so a
 * green badge means "the ledger accepts this source", never "someone filled a
 * field". Nothing here is persisted: changing the source means changing the
 * model (binding a derivation rule) or retracting the key-data claim.
 */
export const KeyDataProvenancePicker = ({
  entity,
  attribute,
  graph,
  entry,
  onBindDerivation,
  onClearKeyData,
}: KeyDataProvenancePickerProps) => {
  if (attribute.keyData !== true) {
    return null;
  }

  const source = entry?.source ?? 'needs-decision';
  const resolved = entry?.decisionOwed === false;

  return (
    <div
      data-provenance-for={attribute.name}
      className="mt-1 rounded border border-evidence-line bg-[#fbfbfc] px-2 py-1"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] text-[#59606c]">提供方</span>
        <span
          className={[
            'rounded px-1 text-[8px]',
            resolved
              ? 'bg-[#eaf3ee] text-evidence-participant'
              : 'bg-[#fdeef2] text-evidence-evidence',
          ].join(' ')}
        >
          {KEY_DATA_SOURCE_LABELS[source]}
        </span>
      </div>

      {entry !== undefined && entry.providers.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {entry.providers.map((provider) => (
            <li
              key={`${attribute.name}-${provider.alias}`}
              className="truncate font-mono text-[8px] text-[#6b7280]"
            >
              {providerLabel(graph, provider)}
            </li>
          ))}
        </ul>
      ) : null}

      {entry === undefined || entry.decisionOwed ? (
        <div className="mt-1 space-y-1">
          <p className="text-[8px] leading-snug text-evidence-evidence">
            {entity.label}.{attribute.name} 仍待决策：金额、期限、数量与时间差必须有
            合同参数、前序凭证属性、派生规则或结果事实作为提供方。
          </p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={onBindDerivation}
              className="rounded border border-evidence-line px-1.5 py-0.5 text-[9px] text-evidence-accent hover:border-evidence-accent"
            >
              绑定派生规则
            </button>
            <button
              type="button"
              onClick={onClearKeyData}
              className="rounded border border-evidence-line px-1.5 py-0.5 text-[9px] text-evidence-muted hover:border-evidence-accent"
              title="仅当该字段确实不是金额、期限、数量或时间差时使用。"
            >
              并非关键数据
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
