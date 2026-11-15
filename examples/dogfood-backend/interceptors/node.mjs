import { AsyncLocalStorage } from 'node:async_hooks';

const clock = new AsyncLocalStorage();
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
export function parseAsOf(value) {
  if (
    typeof value !== 'string' ||
    !timestamp.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return undefined;
  const now = new Date(value);
  return now.toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z')
    ? now
    : undefined;
}

// The caller must explicitly enable this ONLY for isolated test environments.
// Do not trust arbitrary public headers in production, even on authenticated APIs.
export function withEvidenceClock(request, enabled, next) {
  const now = enabled
    ? parseAsOf(request.headers['x-evidence-asof'])
    : undefined;
  return clock.run(now?.getTime(), next);
}
export function getBusinessTime() {
  const millis = clock.getStore();
  return millis === undefined ? new Date() : new Date(millis);
}
