import {
  type AttributeAST,
  type DomainModelDocument,
  type EntityAST,
  type KeyDataSourceKind,
  type RelationshipAST,
  type RuleAST,
} from '@evidence-poc/evidence-schema';

import { buildKeyDataLedger } from '../keyData/keyDataLedger.js';

/** How one object changed between two model snapshots. */
export type DiffChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

/** One attribute row inside an entity diff. */
export interface AttributeDiff {
  name: string;
  label: string;
  changeType: DiffChangeType;
  /** Field names that differ when `changeType` is `modified`. */
  fields?: readonly string[];
  base?: AttributeAST;
  target?: AttributeAST;
}

/** One entity (or Context) in a model diff. */
export interface EntityDiff {
  id: string;
  label: string;
  category: EntityAST['category'];
  kind: string;
  changeType: DiffChangeType;
  /** Top-level entity fields that differ when `changeType` is `modified`. */
  fields?: readonly string[];
  /** Only listed when the entity exists on at least one side. */
  attributeDiffs?: readonly AttributeDiff[];
  base?: EntityAST;
  target?: EntityAST;
}

/** One relationship in a model diff. */
export interface RelationshipDiff {
  id: string;
  label: string;
  kind: string;
  changeType: DiffChangeType;
  fields?: readonly string[];
  base?: RelationshipAST;
  target?: RelationshipAST;
}

/** One CEL rule in a model diff. */
export interface RuleDiff {
  id: string;
  label: string;
  kind: string;
  changeType: DiffChangeType;
  fields?: readonly string[];
  baseExpression?: string;
  targetExpression?: string;
  base?: RuleAST;
  target?: RuleAST;
}

/**
 * One key data item whose provider decision changed.
 *
 * `source` is what `audit_key_data.py` would classify, so a branch that trades a
 * contract term for a pending decision shows up here as drift rather than as a
 * silent count change.
 */
export interface KeyDataDiff {
  entityRef: string;
  attribute: string;
  label: string;
  changeType: DiffChangeType;
  baseSource?: KeyDataSourceKind;
  targetSource?: KeyDataSourceKind;
  baseExpression?: string;
  targetExpression?: string;
  baseDecisionOwed?: boolean;
  targetDecisionOwed?: boolean;
}

export interface ModelDiffSummary {
  /** Added, removed and modified objects of every kind. */
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  keyDataChangedCount: number;
  /** True when at least one side still owes a provider decision. */
  hasKeyDataDrift: boolean;
  decisionOwedBase: number;
  decisionOwedTarget: number;
}

/** Structural difference between two `.evidence/fm` snapshots. */
export interface ModelDiff {
  baseModelId: string;
  targetModelId: string;
  summary: ModelDiffSummary;
  /** Context containers, so the panel can announce a new nested boundary. */
  contexts: readonly EntityDiff[];
  entities: readonly EntityDiff[];
  relationships: readonly RelationshipDiff[];
  rules: readonly RuleDiff[];
  keyData: readonly KeyDataDiff[];
}

/** Fields compared per object kind; everything else is copied through. */
const ENTITY_FIELDS = [
  'category',
  'kind',
  'label',
  'aliases',
  'notes',
  'contextRef',
  'responsibleRoleRef',
  'roleRefs',
  'parentContextRef',
  'rootRefs',
] as const;

const RELATIONSHIP_FIELDS = [
  'kind',
  'label',
  'sourceRef',
  'targetRef',
  'sourceCardinality',
  'targetCardinality',
] as const;

const RULE_FIELDS = [
  'kind',
  'label',
  'description',
  'contextRef',
  'bindings',
  'expression',
  'resultType',
  'target',
] as const;

const ATTRIBUTE_FIELDS = [
  'label',
  'meaning',
  'valueType',
  'required',
  'keyData',
  'derivedByRuleRef',
  'notes',
] as const;

/**
 * Stable comparison token for one field value.
 *
 * Model sources are plain JSON, so stringifying is enough; `undefined` must be
 * distinguished from `null` because an omitted optional field is not the same
 * as an explicit one.
 */
const token = (value: unknown): string =>
  value === undefined ? 'undefined' : JSON.stringify(value);

const changedFields = (
  base: Readonly<Record<string, unknown>>,
  target: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): readonly string[] =>
  fields.filter((field) => token(base[field]) !== token(target[field]));

const changeTypeOf = (hasBase: boolean, hasTarget: boolean): DiffChangeType => {
  if (!hasBase) {
    return 'added';
  }

  return hasTarget ? 'unchanged' : 'removed';
};

const markModified = (
  changeType: DiffChangeType,
  fields: readonly string[],
): DiffChangeType =>
  changeType === 'unchanged' && fields.length > 0 ? 'modified' : changeType;

const attributeDiff = (
  base: AttributeAST | undefined,
  target: AttributeAST | undefined,
  name: string,
): AttributeDiff => {
  const fields =
    base === undefined || target === undefined
      ? []
      : changedFields(
          base as unknown as Record<string, unknown>,
          target as unknown as Record<string, unknown>,
          ATTRIBUTE_FIELDS,
        );

  return {
    name,
    label: target?.label ?? base?.label ?? name,
    changeType: markModified(
      changeTypeOf(base !== undefined, target !== undefined),
      fields,
    ),
    ...(fields.length === 0 ? {} : { fields }),
    ...(base === undefined ? {} : { base }),
    ...(target === undefined ? {} : { target }),
  };
};

const attributeDiffs = (
  base: EntityAST | undefined,
  target: EntityAST | undefined,
): readonly AttributeDiff[] => {
  const names = new Set<string>();

  for (const attribute of base?.attributes ?? []) {
    names.add(attribute.name);
  }

  for (const attribute of target?.attributes ?? []) {
    names.add(attribute.name);
  }

  return [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((name) =>
      attributeDiff(
        base?.attributes?.find((attribute) => attribute.name === name),
        target?.attributes?.find((attribute) => attribute.name === name),
        name,
      ),
    );
};

const entityDiff = (
  id: string,
  base: EntityAST | undefined,
  target: EntityAST | undefined,
): EntityDiff => {
  const attributes = attributeDiffs(base, target);
  const attributesChanged = attributes.some(
    (attribute) => attribute.changeType !== 'unchanged',
  );
  const fields =
    base === undefined || target === undefined
      ? []
      : changedFields(
          base as unknown as Record<string, unknown>,
          target as unknown as Record<string, unknown>,
          ENTITY_FIELDS,
        );
  const allFields = attributesChanged ? [...fields, 'attributes'] : fields;

  return {
    id,
    label: target?.label ?? base?.label ?? id,
    category: (target ?? base)!.category,
    kind: (target ?? base)!.kind,
    changeType: markModified(
      changeTypeOf(base !== undefined, target !== undefined),
      allFields,
    ),
    ...(allFields.length === 0 ? {} : { fields: allFields }),
    attributeDiffs: attributes,
    ...(base === undefined ? {} : { base }),
    ...(target === undefined ? {} : { target }),
  };
};

const relationshipDiff = (
  id: string,
  base: RelationshipAST | undefined,
  target: RelationshipAST | undefined,
): RelationshipDiff => {
  const fields =
    base === undefined || target === undefined
      ? []
      : changedFields(
          base as unknown as Record<string, unknown>,
          target as unknown as Record<string, unknown>,
          RELATIONSHIP_FIELDS,
        );

  return {
    id,
    label: target?.label ?? base?.label ?? id,
    kind: (target ?? base)!.kind,
    changeType: markModified(
      changeTypeOf(base !== undefined, target !== undefined),
      fields,
    ),
    ...(fields.length === 0 ? {} : { fields }),
    ...(base === undefined ? {} : { base }),
    ...(target === undefined ? {} : { target }),
  };
};

const ruleDiff = (
  id: string,
  base: RuleAST | undefined,
  target: RuleAST | undefined,
): RuleDiff => {
  const fields =
    base === undefined || target === undefined
      ? []
      : changedFields(
          base as unknown as Record<string, unknown>,
          target as unknown as Record<string, unknown>,
          RULE_FIELDS,
        );

  return {
    id,
    label: target?.label ?? base?.label ?? id,
    kind: (target ?? base)!.kind,
    changeType: markModified(
      changeTypeOf(base !== undefined, target !== undefined),
      fields,
    ),
    ...(fields.length === 0 ? {} : { fields }),
    ...(base.expression === undefined ? {} : { baseExpression: base.expression }),
    ...(target?.expression === undefined
      ? {}
      : { targetExpression: target.expression }),
    ...(base === undefined ? {} : { base }),
    ...(target === undefined ? {} : { target }),
  };
};

const byId = <T extends { id: string }>(
  items: readonly T[],
): ReadonlyMap<string, T> => new Map(items.map((item) => [item.id, item]));

const unionIds = (...maps: readonly ReadonlyMap<string, unknown>[]): string[] => {
  const ids = new Set<string>();

  for (const map of maps) {
    for (const id of map.keys()) {
      ids.add(id);
    }
  }

  return [...ids].sort((left, right) => left.localeCompare(right));
};

/**
 * Lists the key data items whose provider decision differs.
 *
 * Items that exist on only one side are reported as `added`/`removed` so the
 * diff never implies a decision was carried across branches by accident.
 */
const keyDataDiffs = (
  base: DomainModelDocument,
  target: DomainModelDocument,
): readonly KeyDataDiff[] => {
  const keyOf = (entry: {
    entityRef: string;
    attribute: string;
  }): string => `${entry.entityRef}#${entry.attribute}`;
  const baseEntries = new Map(
    buildKeyDataLedger(base).entries.map((entry) => [keyOf(entry), entry]),
  );
  const targetEntries = new Map(
    buildKeyDataLedger(target).entries.map((entry) => [keyOf(entry), entry]),
  );
  const diffs: KeyDataDiff[] = [];

  for (const key of unionIds(baseEntries, targetEntries)) {
    const baseEntry = baseEntries.get(key);
    const targetEntry = targetEntries.get(key);
    const reference = targetEntry ?? baseEntry!;
    const same =
      baseEntry !== undefined &&
      targetEntry !== undefined &&
      baseEntry.source === targetEntry.source &&
      token(baseEntry.expression) === token(targetEntry.expression) &&
      token(baseEntry.ruleRef) === token(targetEntry.ruleRef);

    if (same) {
      continue;
    }

    diffs.push({
      entityRef: reference.entityRef,
      attribute: reference.attribute,
      label: reference.label,
      changeType:
        baseEntry === undefined
          ? 'added'
          : targetEntry === undefined
            ? 'removed'
            : 'modified',
      ...(baseEntry === undefined ? {} : { baseSource: baseEntry.source }),
      ...(targetEntry === undefined ? {} : { targetSource: targetEntry.source }),
      ...(baseEntry?.expression === undefined
        ? {}
        : { baseExpression: baseEntry.expression }),
      ...(targetEntry?.expression === undefined
        ? {}
        : { targetExpression: targetEntry.expression }),
      ...(baseEntry === undefined
        ? {}
        : { baseDecisionOwed: baseEntry.decisionOwed }),
      ...(targetEntry === undefined
        ? {}
        : { targetDecisionOwed: targetEntry.decisionOwed }),
    });
  }

  return diffs;
};

/**
 * Compares two model snapshots object by object.
 *
 * Contexts are reported separately because they are containers: the canvas
 * renders them as boundaries rather than nodes, and a branch that adds a
 * Context has not added a business object.
 */
export const diffDomainModels = (
  base: DomainModelDocument,
  target: DomainModelDocument,
): ModelDiff => {
  const baseEntities = byId(base.entities);
  const targetEntities = byId(target.entities);
  const entityDiffs = unionIds(baseEntities, targetEntities).map((id) =>
    entityDiff(id, baseEntities.get(id), targetEntities.get(id)),
  );
  const baseRelationships = byId(base.relationships);
  const targetRelationships = byId(target.relationships);
  const relationships = unionIds(baseRelationships, targetRelationships).map(
    (id) =>
      relationshipDiff(
        id,
        baseRelationships.get(id),
        targetRelationships.get(id),
      ),
  );
  const baseRules = byId(base.rules);
  const targetRules = byId(target.rules);
  const rules = unionIds(baseRules, targetRules).map((id) =>
    ruleDiff(id, baseRules.get(id), targetRules.get(id)),
  );
  const keyData = keyDataDiffs(base, target);
  const changed = [...entityDiffs, ...relationships, ...rules].filter(
    (item) => item.changeType !== 'unchanged',
  );
  const baseDecisionOwed = buildKeyDataLedger(base).decisionOwed.length;
  const targetDecisionOwed = buildKeyDataLedger(target).decisionOwed.length;

  return {
    baseModelId: base.manifest.id,
    targetModelId: target.manifest.id,
    summary: {
      addedCount: changed.filter((item) => item.changeType === 'added').length,
      removedCount: changed.filter((item) => item.changeType === 'removed')
        .length,
      modifiedCount: changed.filter((item) => item.changeType === 'modified')
        .length,
      keyDataChangedCount: keyData.length,
      hasKeyDataDrift:
        baseDecisionOwed !== targetDecisionOwed || keyData.length > 0,
      decisionOwedBase: baseDecisionOwed,
      decisionOwedTarget: targetDecisionOwed,
    },
    contexts: entityDiffs.filter((diff) => diff.category === 'context'),
    entities: entityDiffs.filter((diff) => diff.category !== 'context'),
    relationships,
    rules,
    keyData,
  };
};
