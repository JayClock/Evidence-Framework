import { AsyncLocalStorage } from 'node:async_hooks';

const clock = new AsyncLocalStorage<number | undefined>();

/** Express/Connect signature; enable only at a trusted acceptance boundary. */
export function evidenceClockMiddleware(enabled = false) {
  return (
    request: { headers: Record<string, string | string[] | undefined> },
    _response: unknown,
    next: () => void,
  ): void => {
    const header = request.headers['x-evidence-asof'];
    const parsed =
      typeof header === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(header)
        ? Date.parse(header)
        : NaN;
    const valid =
      Number.isFinite(parsed) &&
      new Date(parsed).toISOString().replace('.000Z', 'Z') ===
        String(header).replace('.000Z', 'Z');
    clock.run(enabled && valid ? parsed : undefined, next);
  };
}

/** A fresh Date prevents one consumer mutating another consumer's clock. */
export function getBusinessTime(): Date {
  const now = clock.getStore();
  return now === undefined ? new Date() : new Date(now);
}
