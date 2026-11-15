import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { compactCanonicalJson } from '@evidence-poc/evidence-schema';

/** Browser-safe, synchronous model hash. Keep the historical final newline. */
export const digestOf = (value: unknown): string => {
  const bytes = new TextEncoder().encode(`${compactCanonicalJson(value)}\n`);
  return `sha256:${bytesToHex(sha256(bytes))}`;
};
