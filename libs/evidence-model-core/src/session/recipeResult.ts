import { current, isDraft, type Draft } from 'immer';

/** Snapshot draft results before Immer revokes proxies, including nested results. */
export const snapshotRecipeResult = <T>(
  value: T,
  seen = new WeakMap<object, unknown>(),
): T => {
  if (isDraft(value)) return current(value as Draft<T>) as T;
  if (value === null || typeof value !== 'object') return value;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return value;
  if (seen.has(value)) return seen.get(value) as T;
  const snapshot: Record<string, unknown> | unknown[] = Array.isArray(value)
    ? []
    : {};
  seen.set(value, snapshot);
  for (const key of Object.keys(value)) {
    Object.defineProperty(snapshot, key, {
      value: snapshotRecipeResult(
        (value as Record<string, unknown>)[key],
        seen,
      ),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return snapshot as T;
};
