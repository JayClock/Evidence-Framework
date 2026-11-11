/** Value types accepted by FM v5 attributes, CEL rule results and bindings. */
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

export type ValueType = (typeof VALUE_TYPES)[number];

export function isValueType(value: unknown): value is ValueType {
  return (
    typeof value === 'string' &&
    (VALUE_TYPES as readonly string[]).includes(value)
  );
}

/** How a CEL binding is consumed: a single modeled instance or a collection. */
export type BindingCardinality = 'one' | 'many';

export function isBindingCardinality(
  value: unknown,
): value is BindingCardinality {
  return value === 'one' || value === 'many';
}
