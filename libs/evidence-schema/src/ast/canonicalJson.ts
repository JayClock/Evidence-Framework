import stringify from 'fast-json-stable-stringify';

/** Stable, compact JSON for synchronous hashes; non-JSON root values become null. */
export const compactCanonicalJson = (value: unknown): string =>
  stringify(value) ?? 'null';

/** Stable persisted JSON: two-space indentation and exactly one final newline. */
export const prettyCanonicalJson = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(compactCanonicalJson(value)), null, 2)}\n`;
