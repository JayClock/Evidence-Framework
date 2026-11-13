/**
 * Helpers for a closed vocabulary that is declared once, keyed by the value
 * written to disk.
 *
 * Every FM value such as `fulfillment_request` travels through the JSON Schema,
 * the validator, the inspector and the review page. Declaring the id, the label
 * a surface prints for it and the relations a checker derives from it in one
 * object keeps those copies from drifting apart, and lets a type be read off the
 * declaration instead of being written a second time beside it.
 *
 * A vocabulary is declared as
 *
 * ```ts
 * const KINDS = {
 *   one: { label: '第一个' },
 *   two: { label: '第二个' },
 * } as const satisfies Record<string, { readonly label: string }>;
 * ```
 *
 * and the id union, the ordered id list, the label map and the guard are then
 * derived from it. Declaration order is the reading order callers see.
 */

/** Ordered ids of a vocabulary, in the order it was declared. */
export const vocabularyIds = <Entries extends Record<string, unknown>>(
  entries: Entries,
): readonly (keyof Entries & string)[] =>
  Object.keys(entries) as readonly (keyof Entries & string)[];

/** Labels of a vocabulary, keyed the same way as its declaration. */
export const vocabularyLabels = <Id extends string>(
  entries: Record<Id, { readonly label: string }>,
): Record<Id, string> =>
  Object.fromEntries(
    Object.entries(entries as Record<string, { readonly label: string }>).map(
      ([id, entry]) => [id, entry.label],
    ),
  ) as Record<Id, string>;

/** One field of every entry, keyed by id, for the tables callers import. */
export const vocabularyField = <
  Entries extends Record<string, Record<string, unknown>>,
  Field extends keyof Entries[keyof Entries] & string,
>(
  entries: Entries,
  field: Field,
): { [K in keyof Entries]: Entries[K][Field] } =>
  Object.fromEntries(
    Object.entries(entries).map(([id, entry]) => [id, entry[field]]),
  ) as { [K in keyof Entries]: Entries[K][Field] };

/**
 * Guard for a vocabulary id.
 *
 * Keeps the `(IDS as readonly string[]).includes(value)` cast out of every
 * validator: the declaration already knows its own keys.
 */
export const isVocabularyId = <Id extends string>(
  entries: Record<Id, unknown>,
  value: unknown,
): value is Id => typeof value === 'string' && value in entries;
