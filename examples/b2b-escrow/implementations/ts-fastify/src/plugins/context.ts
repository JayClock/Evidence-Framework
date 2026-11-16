import { AsyncLocalStorage } from 'node:async_hooks';
import { BusinessError } from '../domain/errors.js';
import { utcTime } from '../domain/money.js';

interface RequestContext {
  now: Date;
  role: string;
}
export const requestContext = new AsyncLocalStorage<RequestContext>();
export function businessContext(): RequestContext {
  const context = requestContext.getStore();
  if (!context) throw new Error('Missing request context');
  return context;
}

export function contextFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  testMode: boolean,
  clock: () => Date,
): RequestContext {
  if (!testMode)
    throw new BusinessError(
      503,
      'TEST_MODE_REQUIRED',
      'This reference server has no production identity provider',
    );
  const header = headers['x-evidence-asof'];
  if (header !== undefined && !utcTime.safeParse(header).success)
    throw new BusinessError(
      400,
      'INVALID_CLOCK',
      'Expected a whole-second UTC timestamp',
    );
  const role = headers['x-evidence-role'];
  if (typeof role !== 'string' || !role)
    throw new BusinessError(401, 'UNAUTHENTICATED', 'Missing test identity');
  return {
    now: header === undefined ? clock() : new Date(header as string),
    role,
  };
}
