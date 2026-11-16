export class BusinessError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail: string,
  ) {
    super(detail);
  }
}

export function requireFact(
  condition: unknown,
  detail: string,
): asserts condition {
  if (!condition) throw new BusinessError(409, 'CONFLICT', detail);
}

export function notFound(detail: string): never {
  throw new BusinessError(404, 'NOT_FOUND', detail);
}
