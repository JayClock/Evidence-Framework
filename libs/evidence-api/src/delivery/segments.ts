/**
 * Turning business ids into URL segments.
 *
 * A business id is dotted (`request.payment`), and a URL segment cannot be. The
 * last dotted part is the business name the modeler already uses, so folding it
 * into a path keeps the address readable: `/procurement/contracts/payment`.
 */

/** Alias map id → segment, so two objects never answer to one path. */
export interface SegmentAllocator {
  segmentOf(id: string): string;
}

/** The last dotted part of an id, lower-cased and safe inside a path. */
export const rawSegmentOf = (id: string): string => {
  const parts = id.split('.');
  const last = parts[parts.length - 1] ?? id;
  const folded = last
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return folded === '' ? 'resource' : folded;
};

/** English business nouns keep their model spelling, with only the final word pluralized. */
export const pluralSegmentOf = (id: string): string => {
  const segment = rawSegmentOf(id);
  const irregular: Record<string, string> = {
    person: 'people',
    child: 'children',
    analysis: 'analyses',
    status: 'statuses',
  };
  const words = segment.split('-');
  const word = words.pop()!;
  words.push(
    irregular[word] ??
      (/[^aeiou]y$/.test(word)
        ? word.slice(0, -1) + 'ies'
        : /(?:s|x|z|ch|sh)$/.test(word)
          ? word + 'es'
          : word + 's'),
  );
  return words.join('-');
};

/** Instance parameter names follow the business noun; contracts retain their common root key. */
export const itemParameterOf = (id: string): string => {
  const category = id.split('.')[0];
  if (category === 'contract') return 'contractId';
  if (category === 'confirmation') return 'confirmationId';
  return (rawSegmentOf(id).split('-').at(-1) ?? 'item') + 'Id';
};

/** A deterministic suffix depends on identity, never enumeration order or a counter. */
const identitySuffix = (id: string): string => {
  let hash = 2166136261;
  for (const character of id)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
};

/** Allocate within one real URI namespace; callers pass roots or siblings, never metamodel categories. */
export const createSegmentAllocator = (
  ids: readonly string[],
  segmentFor: (id: string) => string = rawSegmentOf,
): SegmentAllocator => {
  const groups = new Map<string, Set<string>>();
  for (const id of ids) {
    const base = segmentFor(id);
    const group = groups.get(base) ?? new Set<string>();
    group.add(id);
    groups.set(base, group);
  }
  const assignment = new Map<string, string>();
  for (const [base, group] of groups) {
    for (const id of group)
      assignment.set(
        id,
        group.size === 1 ? base : base + '-' + identitySuffix(id),
      );
  }
  // Reject even a hash collision instead of silently publishing overlapping addresses.
  if (new Set(assignment.values()).size !== assignment.size)
    throw new Error('API segment allocation collision');
  return { segmentOf: (id) => assignment.get(id) ?? segmentFor(id) };
};

/**
 * The one service a Context becomes.
 *
 * A Context is already a boundary with its own knowledge and its own rate of
 * change, so the service id is derived from it rather than assigned by hand: two
 * runs of the projector name the same services.
 */
export const serviceIdOf = (contextRef: string): string =>
  `service.${contextRef.replace(/^context\./, '')}`;

/** `signContractProductProcurement` — an operation id OpenAPI can key on. */
export const operationIdFor = (verb: string, id: string): string => {
  const words = `${verb} ${id.replaceAll('.', ' ').replaceAll('-', ' ')}`
    .split(/\s+/)
    .filter((word) => word !== '');

  return words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join('');
};
