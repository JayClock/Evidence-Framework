import { z } from 'zod';

/** JSON facts can arrive over IPC without having passed through JSON.parse.
 * Check ancestors (not a global seen set): aliases are valid, cycles are not.
 * A recursive Zod lazy schema would overflow on such cycles before reporting.
 */
const isJsonValue = (
  value: unknown,
  ancestors = new Set<object>(),
): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  ancestors.add(value);
  const valid = Object.values(value).every((child) =>
    isJsonValue(child, ancestors),
  );
  ancestors.delete(value);
  return valid;
};

export const JsonObjectSchema = z.custom<Record<string, unknown>>(
  (value) =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    isJsonValue(value),
  'must be a JSON object containing only finite, acyclic JSON values',
);
