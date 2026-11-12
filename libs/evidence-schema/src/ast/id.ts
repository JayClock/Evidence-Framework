/**
 * Identifier grammar shared by every Fulfillment Modeling (FM) v5 source object.
 *
 * These patterns are the single source of truth for the schema package and are
 * reused by the model core and the disk adapter.
 */

/** Entity, Relationship and Rule ids: `context.product-procurement`, `request.payment`. */
export const DOMAIN_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

/** Attribute names stay lower snake_case: `confirmed_at`, `total_minor_units`. */
export const ATTRIBUTE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** Model manifest version, e.g. `1.1.0` or `1.1.0-rc.1`. */
export const MODEL_VERSION_PATTERN =
  /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;

/** CEL variable aliases declared in `rule.bindings`, e.g. `request`, `confirmations`. */
export const CEL_VARIABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isDomainId(value: unknown): value is string {
  return typeof value === 'string' && DOMAIN_ID_PATTERN.test(value);
}

export function isAttributeName(value: unknown): value is string {
  return typeof value === 'string' && ATTRIBUTE_NAME_PATTERN.test(value);
}

export function isModelVersion(value: unknown): value is string {
  return typeof value === 'string' && MODEL_VERSION_PATTERN.test(value);
}

export function isCelVariableName(value: unknown): value is string {
  return typeof value === 'string' && CEL_VARIABLE_PATTERN.test(value);
}
