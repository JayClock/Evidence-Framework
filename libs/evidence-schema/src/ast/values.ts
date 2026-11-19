import { z } from 'zod';

/** Value types accepted by FM v6 attributes, CEL rule results and bindings. */
export const VALUE_TYPES = [
  'bool',
  'int',
  'uint',
  'double',
  'decimal',
  'string',
  'bytes',
  'timestamp',
  'duration',
  'date',
  'money',
  'enum',
  'id',
  'list',
  'map',
  'dynamic',
] as const;

export const ValueTypeSchema = z.enum(VALUE_TYPES);
export type ValueType = z.infer<typeof ValueTypeSchema>;

export function isValueType(value: unknown): value is ValueType {
  return ValueTypeSchema.safeParse(value).success;
}

/** How a CEL binding is consumed: a single modeled instance or a collection. */
export const BindingCardinalitySchema = z.enum(['one', 'many']);
export type BindingCardinality = z.infer<typeof BindingCardinalitySchema>;

export function isBindingCardinality(
  value: unknown,
): value is BindingCardinality {
  return BindingCardinalitySchema.safeParse(value).success;
}
