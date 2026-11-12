import {
  type DomainModelDocument,
  type KeyDataSourceKind,
  type RuleBinding,
  type ValueType,
  classifyKeyDataSource,
  isKeyDataDecisionOwed,
} from '@evidence-poc/evidence-schema';

/** One modeled input that provides a derived value. */
export interface KeyDataProvider {
  /** Binding alias used inside the CEL expression. */
  alias: string;
  /** Modeled object the alias resolves to, or a runtime value type. */
  ref: string;
  /** Attribute read from the bound object when the alias names one. */
  attribute?: string;
  /** Runtime value type when the alias is not a modeled object. */
  valueType?: ValueType;
  /** Set when the provider is a collection binding. */
  cardinality?: 'one' | 'many';
}

/** One key data item, classified by the shared key data vocabulary. */
export interface KeyDataEntry {
  entityRef: string;
  entityLabel: string;
  entityKind: string;
  /** `category.kind` signature, used for grouping in the inspector. */
  entitySignature: string;
  contextRef?: string;
  attribute: string;
  label: string;
  meaning: string;
  valueType?: ValueType;
  source: KeyDataSourceKind;
  /** Derivation rule that produces the value, when the source is `derived`. */
  ruleRef?: string;
  expression?: string;
  providers: readonly KeyDataProvider[];
  /** True while the business decision is still owed for this item. */
  decisionOwed: boolean;
}

export interface KeyDataLedger {
  entries: readonly KeyDataEntry[];
  counts: Readonly<Record<KeyDataSourceKind, number>>;
  /** Items the checker lists as still owed, in document order. */
  decisionOwed: readonly KeyDataEntry[];
  derived: readonly KeyDataEntry[];
}

const emptyCounts = (): Record<KeyDataSourceKind, number> => ({
  derived: 0,
  'contract-term': 0,
  'domain-source': 0,
  'negotiation-source': 0,
  'result-fact': 0,
  'request-input': 0,
  'needs-decision': 0,
  other: 0,
});

const bindingProviders = (
  bindings: Readonly<Record<string, RuleBinding>>,
): KeyDataProvider[] =>
  Object.entries(bindings).map(([alias, binding]) =>
    'ref' in binding
      ? {
          alias,
          ref: binding.ref,
          ...(binding.cardinality === undefined
            ? {}
            : { cardinality: binding.cardinality }),
        }
      : { alias, ref: '', valueType: binding.type },
  );

/**
 * Builds the key data ledger for one document.
 *
 * Only attributes marked `keyData` enter the ledger; other attributes stay out
 * so the ledger never implies a provider requirement the checkers do not make.
 */
export const buildKeyDataLedger = (
  document: DomainModelDocument,
): KeyDataLedger => {
  const ruleById = new Map(document.rules.map((rule) => [rule.id, rule]));
  const counts = emptyCounts();
  const entries: KeyDataEntry[] = [];

  for (const entity of document.entities) {
    for (const attribute of entity.attributes ?? []) {
      if (attribute.keyData !== true) {
        continue;
      }

      const source = classifyKeyDataSource(entity, attribute);
      const rule =
        attribute.derivedByRuleRef === undefined
          ? undefined
          : ruleById.get(attribute.derivedByRuleRef);
      counts[source] += 1;

      entries.push({
        entityRef: entity.id,
        entityLabel: entity.label,
        entityKind: entity.kind,
        entitySignature: `${entity.category}.${entity.kind}`,
        ...('contextRef' in entity && entity.contextRef !== undefined
          ? { contextRef: entity.contextRef }
          : {}),
        attribute: attribute.name,
        label: attribute.label,
        meaning: attribute.meaning,
        ...(attribute.valueType === undefined
          ? {}
          : { valueType: attribute.valueType }),
        source,
        ...(rule === undefined
          ? { providers: [] as readonly KeyDataProvider[] }
          : {
              ruleRef: rule.id,
              expression: rule.expression,
              providers: bindingProviders(rule.bindings),
            }),
        decisionOwed: isKeyDataDecisionOwed(source),
      });
    }
  }

  return {
    entries,
    counts,
    decisionOwed: entries.filter((entry) => entry.decisionOwed),
    derived: entries.filter((entry) => entry.source === 'derived'),
  };
};

/** Reads one key data entry, or `undefined` when the attribute is not key data. */
export const keyDataEntryOf = (
  document: DomainModelDocument,
  entityRef: string,
  attributeName: string,
): KeyDataEntry | undefined =>
  buildKeyDataLedger(document).entries.find(
    (entry) =>
      entry.entityRef === entityRef && entry.attribute === attributeName,
  );
