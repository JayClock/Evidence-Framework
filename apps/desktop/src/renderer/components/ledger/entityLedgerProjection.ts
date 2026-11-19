import type { DiagnosticIndex } from '@evidence-poc/desktop-feature-canvas';
import type {
  DomainModelDocument,
  EntityCategory,
} from '@evidence-poc/evidence-schema';

export type LedgerCategory = 'all' | 'evidence' | 'participant' | 'thread';
export type LedgerGate = 'unchecked' | 'clear' | 'info' | 'warn' | 'block';

export const LEDGER_GATE_LABELS: Record<LedgerGate, string> = {
  unchecked: '待检查',
  clear: '通过',
  info: '信息',
  warn: '警告',
  block: '阻断',
};

interface LedgerInvariant {
  id: string;
  expression: string;
}

export interface LedgerEntityRow {
  id: string;
  label: string;
  category: Exclude<EntityCategory, 'context'>;
  contextId: string | null;
  contextLabel: string | null;
  fieldCount: number;
  invariants: readonly LedgerInvariant[];
  gate: LedgerGate;
}

export const LEDGER_CATEGORY_LABELS: Record<
  LedgerEntityRow['category'],
  string
> = {
  evidence: 'Evidence',
  participant: 'Participant',
  role: 'Role',
};

/** An absent index is not a clean scan. A present index describes one revision. */
export const projectEntityLedger = (
  document: DomainModelDocument,
  diagnostics: DiagnosticIndex | null,
): LedgerEntityRow[] => {
  const contexts = new Map(
    document.entities
      .filter((entity) => entity.category === 'context')
      .map(({ id, label }) => [id, label] as const),
  );
  const byEntity = new Map<string, LedgerInvariant[]>();
  for (const rule of document.rules) {
    if (rule.kind !== 'invariant') continue;
    // Scalar bindings have a type, not a ref. Two aliases may bind one entity.
    const refs = new Set<string>();
    for (const binding of Object.values(rule.bindings)) {
      if ('ref' in binding) refs.add(binding.ref);
    }
    const invariant = { id: rule.id, expression: rule.expression };
    for (const ref of refs) {
      const previous = byEntity.get(ref);
      if (previous === undefined) byEntity.set(ref, [invariant]);
      else previous.push(invariant);
    }
  }

  const rows: LedgerEntityRow[] = [];
  for (const entity of document.entities) {
    if (entity.category === 'context') continue;
    const contextId = entity.contextRef ?? null;
    rows.push({
      id: entity.id,
      label: entity.label,
      category: entity.category,
      contextId,
      contextLabel:
        contextId === null ? null : (contexts.get(contextId) ?? null),
      fieldCount: entity.attributes?.length ?? 0,
      invariants: byEntity.get(entity.id) ?? [],
      gate:
        diagnostics === null
          ? 'unchecked'
          : (diagnostics.get(entity.id)?.severity ?? 'clear'),
    });
  }
  return rows;
};

export const countLedgerCategories = (
  rows: readonly LedgerEntityRow[],
): Record<LedgerCategory, number> => {
  const counts = { all: rows.length, evidence: 0, participant: 0, thread: 0 };
  for (const row of rows) {
    if (row.category === 'evidence') counts.evidence += 1;
    else counts.participant += 1;
  }
  // Thread is in the design, but not an FM v6 entity category.
  return counts;
};

export const filterEntityLedger = (
  rows: readonly LedgerEntityRow[],
  category: LedgerCategory,
  query: string,
): LedgerEntityRow[] => {
  const needle = query.trim().toLowerCase();
  const matches = (value: string | null) =>
    value?.toLowerCase().includes(needle);
  return rows.filter((row) => {
    if (category === 'thread') return false;
    if (category === 'evidence' && row.category !== 'evidence') return false;
    if (category === 'participant' && row.category === 'evidence') return false;
    return (
      needle === '' ||
      [row.id, row.label, row.contextId, row.contextLabel].some(matches) ||
      row.invariants.some(
        ({ id, expression }) => matches(id) || matches(expression),
      )
    );
  });
};
