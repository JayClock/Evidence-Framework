/**
 * Where a draft element came from.
 *
 * The lecture gave the model one rule about its own origin: a business fact is
 * only worth keeping if it can be traced back to the clause, document or
 * blueprint row that established it. `ProvenanceSnippet` is that link: the
 * ingestion pipeline copies the verbatim sentence next to every element it
 * produces, so a reviewer can check the reading instead of trusting it.
 */
export const INGESTION_SOURCE_KINDS = [
  'contract',
  'prd',
  'interview',
  'blueprint',
  'unknown',
] as const;

export type IngestionSourceKind = (typeof INGESTION_SOURCE_KINDS)[number];

export function isIngestionSourceKind(
  value: unknown,
): value is IngestionSourceKind {
  return (
    typeof value === 'string' &&
    (INGESTION_SOURCE_KINDS as readonly string[]).includes(value)
  );
}

export interface ProvenanceSnippet {
  /** Verbatim source sentence the element was read from. */
  text: string;
  /**
   * Human-readable position inside the source: a sentence number, a table row
   * (`row 4`) or the stage an activity belonged to.
   */
  locator?: string;
  /** Which input form the snippet came from. */
  source?: IngestionSourceKind;
}
