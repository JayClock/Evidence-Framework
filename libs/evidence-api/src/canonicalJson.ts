import { compactCanonicalJson } from '@evidence-poc/evidence-schema';

export { prettyCanonicalJson as canonicalJson } from '@evidence-poc/evidence-schema';

/** Compatibility API: normalize through the shared stable JSON serializer. */
export const sortedKeys = (value: unknown): unknown =>
  JSON.parse(compactCanonicalJson(value));
