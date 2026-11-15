import { z } from 'zod';

/**
 * Identifier grammar shared by every Fulfillment Modeling (FM) v5 source object.
 *
 * These patterns are the single source of truth for the schema package and are
 * reused by the model core and the disk adapter.
 */
/** Entity, Relationship and Rule ids: `context.product-procurement`. */
export const DOMAIN_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

/** Attribute names stay lower snake_case: `confirmed_at`, `total_minor_units`. */
export const ATTRIBUTE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** Model manifest version, e.g. `1.1.0` or `1.1.0-rc.1`. */
export const MODEL_VERSION_PATTERN =
  /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;

/** CEL variable aliases declared in `rule.bindings`, e.g. `request`. */
export const CEL_VARIABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const DomainIdSchema = z.string().regex(DOMAIN_ID_PATTERN);
export const AttributeNameSchema = z.string().regex(ATTRIBUTE_NAME_PATTERN);
export const ModelVersionSchema = z.string().regex(MODEL_VERSION_PATTERN);
export const CelVariableNameSchema = z.string().regex(CEL_VARIABLE_PATTERN);

export function isDomainId(value: unknown): value is string {
  return DomainIdSchema.safeParse(value).success;
}

export function isAttributeName(value: unknown): value is string {
  return AttributeNameSchema.safeParse(value).success;
}

export function isModelVersion(value: unknown): value is string {
  return ModelVersionSchema.safeParse(value).success;
}

export function isCelVariableName(value: unknown): value is string {
  return CelVariableNameSchema.safeParse(value).success;
}
