import { hash } from 'fast-sha256';

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

/** Browser-safe, stable model hash. Not a legacy instance timeline. */
export const digestOf = (value: unknown): string => {
  const bytes = new TextEncoder().encode(`${canonicalJson(value)}\n`);
  return `sha256:${Array.from(hash(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};
