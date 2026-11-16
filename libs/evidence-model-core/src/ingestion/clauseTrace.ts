import type {
  ClauseCategory,
  DomainModelDocument,
} from '@evidence-poc/evidence-schema';

export interface ClauseTraceRow {
  id: string;
  text: string;
  locator: string;
  category: ClauseCategory | 'unknown';
  entityIds: readonly string[];
  charStart?: number;
  charEnd?: number;
}

/** Authoring-only index. Never resolve a legal citation using fuzzy matching. */
export const collectClauseTrace = (
  model: DomainModelDocument,
): {
  fullText: string | null;
  clauses: readonly ClauseTraceRow[];
  unmatchedEntityIds: readonly string[];
} => {
  const source = model.manifest.sourceDocument;
  const unmatchedEntityIds: string[] = [];
  if (source === undefined) {
    const rows = new Map<string, ClauseTraceRow>();
    for (const entity of model.entities) {
      const snippet = entity.sourceSnippet;
      if (snippet === undefined) continue;
      const key = JSON.stringify([snippet.locator, snippet.text]);
      const row = rows.get(key);
      rows.set(key, {
        id: key,
        text: snippet.text,
        locator: snippet.locator ?? '来源片段',
        category: 'unknown',
        entityIds: [...(row?.entityIds ?? []), entity.id],
      });
    }
    return { fullText: null, clauses: [...rows.values()], unmatchedEntityIds };
  }
  const clauses: ClauseTraceRow[] = source.clauses.map((clause) => ({
    id: `clause-${clause.index}`,
    text: clause.text,
    locator: `第 ${clause.index} 句`,
    category: clause.category,
    charStart: clause.charStart,
    charEnd: clause.charEnd,
    entityIds: [],
  }));
  for (const entity of model.entities) {
    const snippet = entity.sourceSnippet;
    if (snippet === undefined) continue;
    // The exact quotation must agree even when an index or range was saved.
    const matches = clauses.filter((row) => row.text === snippet.text);
    const located = matches.find(
      (row) =>
        row.charStart === snippet.charStart && row.charEnd === snippet.charEnd,
    );
    const indexed =
      snippet.clauseIndex === undefined
        ? undefined
        : clauses[snippet.clauseIndex - 1];
    const row =
      located ??
      (indexed?.text === snippet.text
        ? indexed
        : matches.length === 1
          ? matches[0]
          : undefined);
    if (row === undefined) unmatchedEntityIds.push(entity.id);
    else row.entityIds = [...row.entityIds, entity.id];
  }
  return { fullText: source.text, clauses, unmatchedEntityIds };
};
