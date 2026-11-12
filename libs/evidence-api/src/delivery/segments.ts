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

/**
 * Allocates one segment per id, inside each id category.
 *
 * Two categories may share a word without sharing an address: `request.payment`
 * and `confirmation.payment` are both `payment` under different parents, so the
 * category is the namespace rather than a prefix on every segment. Only a clash
 * inside one category needs a suffix, and then the full id keeps it readable.
 */
export const createSegmentAllocator = (
  ids: readonly string[],
): SegmentAllocator => {
  const taken = new Map<string, string>();
  const assignment = new Map<string, string>();

  for (const id of [...ids].sort()) {
    const category = id.split('.')[0] ?? 'resource';
    const base = rawSegmentOf(id);
    const addressOf = (segment: string): string => `${category}\u0000${segment}`;
    let candidate = base;
    let attempt = 0;

    while (taken.has(addressOf(candidate)) && taken.get(addressOf(candidate)) !== id) {
      candidate =
        attempt === 0 ? `${base}-${category}` : `${base}-${category}-${attempt}`;
      attempt += 1;
    }

    taken.set(addressOf(candidate), id);
    assignment.set(id, candidate);
  }

  return {
    segmentOf: (id) => assignment.get(id) ?? rawSegmentOf(id),
  };
};

/** `{param}` from a plain word. */
export const pathParameter = (name: string): string => `{${name}}`;

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
