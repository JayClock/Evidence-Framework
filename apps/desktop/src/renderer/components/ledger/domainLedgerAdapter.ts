import {
  ENTITY_CATEGORY_LABELS,
  classifyKeyDataSource,
  isKeyDataDecisionOwed,
  type AttributeAST,
  type ContextEntityAST,
  type DomainModelDocument,
  type EntityAST,
  type KeyDataSourceKind,
  type ValueType,
} from '@evidence-poc/evidence-schema';
import type { SensorSeverity } from '@evidence-poc/evidence-agent/browser';

import {
  entityKindLabel,
  type DiagnosticIndex,
} from '@evidence-poc/desktop-feature-canvas';

export type LedgerRowKind = 'context' | 'entity' | 'attribute';

/** One attribute as the ledger reads it, including the rule that writes it. */
export interface LedgerAttribute {
  name: string;
  label: string;
  meaning: string;
  valueType: ValueType | null;
  required: boolean;
  keyData: boolean;
  derivedByRuleRef: string | null;
  /** CEL expression of the derivation, already resolved from the rule. */
  expression: string | null;
  /** How the value is established, for key data items. */
  keyDataSource: KeyDataSourceKind | null;
  /** True while a key data item still owes its business decision. */
  decisionOwed: boolean;
}

/**
 * One line of the model ledger.
 *
 * Contexts and entities are summary lines so the table can be read top-down the
 * way the outline is; attributes are the leaves that carry the contract. Keeping
 * all three in one ordered stream is what lets a single virtual list scroll the
 * whole model without a second tree component beside it.
 */
export interface LedgerRow {
  rowId: string;
  rowKind: LedgerRowKind;
  contextId: string | null;
  contextLabel: string;
  /** Root-to-context labels, used by search and by the context column. */
  contextPath: readonly string[];
  entityId: string | null;
  entityLabel: string | null;
  entityKindLabel: string | null;
  entityCategoryLabel: string | null;
  /** `category.kind`, so two same-named kinds stay distinguishable. */
  entitySignature: string | null;
  attribute: LedgerAttribute | null;
  issueCount: number;
  issueSeverity: SensorSeverity | null;
  /** Entities in a context line, attributes in an entity line. */
  childCount: number;
  /** Key data items still owing a decision, aggregated for a summary line. */
  decisionOwedCount: number;
}

export interface LedgerFilter {
  query?: string;
  /** Keeps only lines that carry a sensor finding. */
  onlyIssues?: boolean;
  collapsedContextIds?: ReadonlySet<string>;
}

const UNASSIGNED_CONTEXT_ID = '__unscoped__';
const UNASSIGNED_CONTEXT_LABEL = '未归属上下文';

const severityRank: Record<SensorSeverity, number> = {
  info: 0,
  warn: 1,
  block: 2,
};

const stronger = (
  left: SensorSeverity | null,
  right: SensorSeverity | null,
): SensorSeverity | null => {
  if (left === null) return right;
  if (right === null) return left;
  return severityRank[right] > severityRank[left] ? right : left;
};

const contextPaths = (
  document: DomainModelDocument,
): ReadonlyMap<string, readonly string[]> => {
  const contexts = new Map(
    document.entities
      .filter(
        (entity): entity is ContextEntityAST => entity.category === 'context',
      )
      .map((entity) => [entity.id, entity] as const),
  );
  const paths = new Map<string, readonly string[]>();

  const resolve = (contextId: string, seen: Set<string>): readonly string[] => {
    const known = paths.get(contextId);
    if (known !== undefined) return known;

    const context = contexts.get(contextId);
    if (context === undefined || seen.has(contextId)) return [];

    seen.add(contextId);
    const parent =
      context.parentContextRef === undefined
        ? []
        : resolve(context.parentContextRef, seen);

    const path = [...parent, context.label];
    paths.set(contextId, path);

    return path;
  };

  for (const contextId of contexts.keys()) resolve(contextId, new Set());

  return paths;
};

const attributeOf = (
  attribute: AttributeAST,
  entity: EntityAST,
  expressionByRule: ReadonlyMap<string, string>,
): LedgerAttribute => {
  const ruleRef = attribute.derivedByRuleRef ?? null;
  const keyDataSource =
    attribute.keyData === true
      ? classifyKeyDataSource(entity, attribute)
      : null;

  return {
    name: attribute.name,
    label: attribute.label,
    meaning: attribute.meaning,
    valueType: attribute.valueType ?? null,
    required: attribute.required === true,
    keyData: attribute.keyData === true,
    derivedByRuleRef: ruleRef,
    expression:
      ruleRef === null ? null : (expressionByRule.get(ruleRef) ?? null),
    keyDataSource,
    decisionOwed:
      keyDataSource !== null && isKeyDataDecisionOwed(keyDataSource),
  };
};

/**
 * Counts findings that point at the object itself, not at one of its attributes.
 *
 * The diagnostics index folds `entity#attribute` targets back onto the entity so
 * the canvas can ring it; the ledger has a row per attribute, so it must keep the
 * two apart instead of charging the entity and the attribute for one finding.
 */
const issuesFor = (
  diagnostics: DiagnosticIndex | null | undefined,
  entityId: string,
  attributeName?: string,
): { count: number; severity: SensorSeverity | null } => {
  const status = diagnostics?.get(entityId);
  if (status === undefined) return { count: 0, severity: null };

  const issues = status.issues.filter((issue) => {
    const target = issue.targetNodeId;

    if (attributeName === undefined) {
      return target === undefined || !target.startsWith(`${entityId}#`);
    }

    return target === `${entityId}#${attributeName}`;
  });

  return {
    count: issues.length,
    severity: issues.reduce<SensorSeverity | null>(
      (current, issue) => stronger(current, issue.severity),
      null,
    ),
  };
};

interface EntityBlock {
  entity: EntityAST;
  attributes: LedgerAttribute[];
}

/**
 * Projects the AST into the flat, ordered row stream the ledger renders.
 *
 * Pure and memo-friendly: the same document and diagnostics always produce the
 * same rows, so the table never owns a second copy of the model it could drift
 * from. Contexts are summary lines, entities group their attributes, and the
 * attributes themselves are the leaves a modeler edits.
 */
export const projectDocumentToLedgerRows = (
  document: DomainModelDocument,
  diagnostics?: DiagnosticIndex | null,
): LedgerRow[] => {
  const paths = contextPaths(document);
  const expressionByRule = new Map(
    document.rules.map((rule) => [rule.id, rule.expression] as const),
  );
  const blocksByContext = new Map<string | null, EntityBlock[]>();

  for (const entity of document.entities) {
    if (entity.category === 'context') continue;

    const contextId =
      'contextRef' in entity && entity.contextRef !== undefined
        ? entity.contextRef
        : null;
    const block: EntityBlock = {
      entity,
      attributes: (entity.attributes ?? []).map((attribute) =>
        attributeOf(attribute, entity, expressionByRule),
      ),
    };
    const bucket = blocksByContext.get(contextId);

    if (bucket === undefined) blocksByContext.set(contextId, [block]);
    else bucket.push(block);
  }

  const rows: LedgerRow[] = [];

  const appendContext = (
    contextId: string | null,
    blocks: readonly EntityBlock[],
  ) => {
    const path = contextId === null ? [] : (paths.get(contextId) ?? []);
    const contextLabel =
      contextId === null
        ? UNASSIGNED_CONTEXT_LABEL
        : (path.at(-1) ?? contextId);
    const contextIssues =
      contextId === null
        ? { count: 0, severity: null as SensorSeverity | null }
        : issuesFor(diagnostics, contextId);

    const entityRows: LedgerRow[] = [];
    let decisionOwedCount = 0;
    let issueCount = contextIssues.count;
    let issueSeverity = contextIssues.severity;

    for (const block of blocks) {
      const entityIssues = issuesFor(diagnostics, block.entity.id);
      const attributeRows: LedgerRow[] = block.attributes.map((attribute) => {
        const attributeIssues = issuesFor(
          diagnostics,
          block.entity.id,
          attribute.name,
        );

        return {
          rowId: `${block.entity.id}#${attribute.name}`,
          rowKind: 'attribute',
          contextId,
          contextLabel,
          contextPath: path,
          entityId: block.entity.id,
          entityLabel: block.entity.label,
          entityKindLabel: entityKindLabel(block.entity),
          entityCategoryLabel: ENTITY_CATEGORY_LABELS[block.entity.category],
          entitySignature: `${block.entity.category}.${block.entity.kind}`,
          attribute,
          issueCount: attributeIssues.count,
          issueSeverity: attributeIssues.severity,
          childCount: 0,
          decisionOwedCount: attribute.decisionOwed ? 1 : 0,
        } satisfies LedgerRow;
      });

      const blockDecisionOwed = attributeRows.filter(
        (row) => row.decisionOwedCount > 0,
      ).length;
      const blockIssues = attributeRows.reduce(
        (total, row) => total + row.issueCount,
        entityIssues.count,
      );
      const blockSeverity = attributeRows.reduce<SensorSeverity | null>(
        (current, row) => stronger(current, row.issueSeverity),
        entityIssues.severity,
      );

      decisionOwedCount += blockDecisionOwed;
      issueCount += blockIssues;
      issueSeverity = stronger(issueSeverity, blockSeverity);

      entityRows.push(
        {
          rowId: block.entity.id,
          rowKind: 'entity',
          contextId,
          contextLabel,
          contextPath: path,
          entityId: block.entity.id,
          entityLabel: block.entity.label,
          entityKindLabel: entityKindLabel(block.entity),
          entityCategoryLabel: ENTITY_CATEGORY_LABELS[block.entity.category],
          entitySignature: `${block.entity.category}.${block.entity.kind}`,
          attribute: null,
          issueCount: blockIssues,
          issueSeverity: blockSeverity,
          childCount: attributeRows.length,
          decisionOwedCount: blockDecisionOwed,
        },
        ...attributeRows,
      );
    }

    if (entityRows.length === 0) {
      return;
    }

    rows.push(
      {
        rowId: contextId === null ? UNASSIGNED_CONTEXT_ID : contextId,
        rowKind: 'context',
        contextId,
        contextLabel,
        contextPath: path,
        entityId: null,
        entityLabel: null,
        entityKindLabel: null,
        entityCategoryLabel: null,
        entitySignature: null,
        attribute: null,
        issueCount,
        issueSeverity,
        childCount: blocks.length,
        decisionOwedCount,
      },
      ...entityRows,
    );
  };

  // Contexts keep the order they were written in the source tree; objects that
  // belong to no context follow, because a party is not a boundary.
  for (const context of document.entities) {
    if (context.category !== 'context') continue;
    const blocks = blocksByContext.get(context.id);
    if (blocks !== undefined) appendContext(context.id, blocks);
  }

  const unassigned = blocksByContext.get(null);
  if (unassigned !== undefined) appendContext(null, unassigned);

  return rows;
};

const rowMatches = (
  row: LedgerRow,
  query: string,
  onlyIssues: boolean,
): boolean => {
  if (onlyIssues && row.issueCount === 0) return false;
  if (query === '') return true;

  const haystack = [
    row.contextLabel,
    ...row.contextPath,
    row.entityLabel,
    row.entityKindLabel,
    row.entitySignature,
    row.attribute?.name,
    row.attribute?.label,
    row.attribute?.meaning,
    row.attribute?.expression,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
};

/**
 * Applies the ledger's toolbar to the projected rows.
 *
 * A match on a field reveals the object that owns it, but not its siblings: a
 * search for one amount should not print every other field of the same request.
 * A match on the object itself (or its context) reveals the whole block, because
 * that is the object the modeler asked for. Collapsing a context hides its
 * children while keeping the line that says how much it holds.
 */
export const filterLedgerRows = (
  rows: readonly LedgerRow[],
  filter: LedgerFilter = {},
): LedgerRow[] => {
  const query = filter.query?.trim().toLowerCase() ?? '';
  const onlyIssues = filter.onlyIssues === true;
  const collapsed = filter.collapsedContextIds ?? new Set<string>();
  const visible: LedgerRow[] = [];

  // Rows arrive grouped: one context line followed by its entity blocks.
  const groups = new Map<string, LedgerRow[]>();

  for (const row of rows) {
    const key =
      row.rowKind === 'context'
        ? row.rowId
        : (row.contextId ?? UNASSIGNED_CONTEXT_ID);
    const bucket = groups.get(key);

    if (bucket === undefined) groups.set(key, [row]);
    else bucket.push(row);
  }

  for (const [contextKey, contextRows] of groups) {
    const contextRow = contextRows[0];

    if (contextRow === undefined || contextRow.rowKind !== 'context') continue;

    const contextMatches =
      query !== '' &&
      [contextRow.contextLabel, ...contextRow.contextPath]
        .join(' ')
        .toLowerCase()
        .includes(query);

    const blocks: LedgerRow[][] = [];
    for (const row of contextRows.slice(1)) {
      if (row.rowKind === 'entity') {
        blocks.push([row]);
      } else if (row.rowKind === 'attribute') {
        const current = blocks.at(-1);
        if (current !== undefined) current.push(row);
      }
    }

    const keptBlocks: LedgerRow[][] = [];

    for (const block of blocks) {
      const [entityRow, ...attributeRows] = block;

      if (entityRow === undefined) continue;

      // The entity line is a summary: its count already includes its attributes,
      // so a finding anywhere in the block keeps the block visible.
      if (onlyIssues && entityRow.issueCount === 0) continue;

      const entityMatches =
        contextMatches || rowMatches(entityRow, query, false);
      const matchedAttributes = attributeRows.filter((row) =>
        rowMatches(row, query, onlyIssues),
      );

      if (!entityMatches && matchedAttributes.length === 0) continue;

      if (onlyIssues) {
        keptBlocks.push([
          entityRow,
          ...attributeRows.filter((row) => row.issueCount > 0),
        ]);
      } else if (entityMatches) {
        keptBlocks.push(block);
      } else {
        keptBlocks.push([entityRow, ...matchedAttributes]);
      }
    }

    if (keptBlocks.length === 0) continue;
    if (onlyIssues && contextRow.issueCount === 0) continue;

    visible.push(contextRow);

    if (collapsed.has(contextKey)) continue;

    for (const block of keptBlocks) visible.push(...block);
  }

  return visible;
};

/** Aggregates the toolbar counters over every projected row. */
export const summarizeLedger = (
  rows: readonly LedgerRow[],
): { entities: number; attributes: number; decisionOwed: number } => ({
  entities: rows.filter((row) => row.rowKind === 'entity').length,
  attributes: rows.filter((row) => row.rowKind === 'attribute').length,
  decisionOwed: rows.reduce(
    (total, row) =>
      total + (row.rowKind === 'attribute' ? row.decisionOwedCount : 0),
    0,
  ),
});
