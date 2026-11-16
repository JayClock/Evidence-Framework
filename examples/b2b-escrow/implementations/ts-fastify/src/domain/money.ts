import { z } from 'zod';

export const MAX_INT64 = (1n << 63n) - 1n;
export const MIN_INT64 = -(1n << 63n);
export const integer = z
  .union([
    z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    z.string().regex(/^(?:0|-?[1-9][0-9]*)$/),
  ])
  .transform((value) => BigInt(value))
  .refine(
    (value) => value >= MIN_INT64 && value <= MAX_INT64,
    'Integer is outside signed int64',
  );
export const positive = integer.refine((n) => n > 0n, 'Must be positive');
export const basisPoints = integer.refine(
  (n) => n >= 0n && n <= 10000n,
  'Invalid basis points',
);
export const id = z.string().min(1).max(200);
export const utcTime = z.iso.datetime({ precision: 0 });
export const agreementInput = z.strictObject({
  id,
  quantity: positive,
  tier_threshold: positive,
  tier1_unit_price_minor: positive,
  tier2_unit_price_minor: positive,
  tax_bps: basisPoints,
  retention_bps: basisPoints,
  daily_penalty_bps: basisPoints,
  delivery_deadline: utcTime,
});
export type Terms = z.infer<typeof agreementInput>;

export function checked(n: bigint): bigint {
  if (n < MIN_INT64 || n > MAX_INT64)
    throw new RangeError('Result is outside signed int64');
  return n;
}

// All amounts are nonnegative integer fen. No binary floating-point conversion.
export function roundBps(amount: bigint, bps: bigint): bigint {
  return checked((amount * bps + 5000n) / 10000n);
}

export function price(terms: Terms) {
  const unit =
    terms.quantity >= terms.tier_threshold
      ? terms.tier2_unit_price_minor
      : terms.tier1_unit_price_minor;
  const subtotal = checked(terms.quantity * unit);
  return {
    subtotal_minor: subtotal,
    gross_amount_minor: roundBps(subtotal, 10000n + terms.tax_bps),
  };
}

export function settle(
  gross: bigint,
  retentionBps: bigint,
  dailyBps: bigint,
  lateDays: bigint,
) {
  const retention = roundBps(gross, retentionBps);
  // Intermediate arithmetic uses unbounded BigInt; cap before narrowing to int64.
  const raw = (gross * lateDays * dailyBps + 5000n) / 10000n;
  const penalty = raw > gross - retention ? gross - retention : raw;
  return {
    gross_amount_minor: gross,
    retention_minor: retention,
    late_penalty_minor: penalty,
    payout_minor: gross - retention - penalty,
  };
}

export function lateDays(now: Date, deadline: string): bigint {
  return BigInt(
    Math.max(0, Math.ceil((now.getTime() - Date.parse(deadline)) / 86400000)),
  );
}

export function jsonValue(value: unknown): unknown {
  if (typeof value === 'bigint')
    return value <= BigInt(Number.MAX_SAFE_INTEGER) &&
      value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonValue(item)]),
    );
  return value;
}
