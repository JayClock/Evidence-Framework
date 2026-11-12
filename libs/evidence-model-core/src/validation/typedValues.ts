import { ATTRIBUTE_NAME_PATTERN, DOMAIN_ID_PATTERN } from '@evidence-poc/evidence-schema';

/**
 * Typed-value rules shared by the scenario simulator and the trace reader.
 *
 * They are the one reading of a typed value: the scenario simulator and the
 * trace reader accept exactly the same values, and a value either satisfies its
 * declared `valueType` or fails with the reason.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

const DURATION_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?[hms])+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** True when `value` is an RFC 3339 timestamp with an explicit offset. */
export const isTimestampText = (value: unknown): value is string =>
  typeof value === 'string' &&
  ISO_TIMESTAMP_PATTERN.test(value) &&
  !Number.isNaN(Date.parse(value));

/**
 * Returns the reason `value` does not satisfy `valueType`, or null when it does.
 *
 * `dynamic` and unknown value types accept anything: only the declared FM types
 * carry a rule.
 */
export const validateTypedValue = (
  value: unknown,
  valueType: string,
): string | null => {
  switch (valueType) {
    case 'bool':
      return typeof value === 'boolean' ? null : 'must be a boolean';
    case 'int':
      return typeof value === 'number' && Number.isInteger(value)
        ? null
        : 'must be an integer';
    case 'uint':
      return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0
        ? null
        : 'must be a non-negative integer';
    case 'double':
    case 'decimal': {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? null : 'must be finite';
      }
      if (typeof value === 'string' && value.trim() !== '') {
        return Number.isFinite(Number(value))
          ? null
          : 'must be numeric or a decimal string';
      }

      return 'must be numeric or a decimal string';
    }
    case 'string':
    case 'bytes':
    case 'enum':
      return typeof value === 'string' ? null : 'must be a string';
    case 'timestamp':
      return isTimestampText(value) ? null : 'must be an RFC 3339 timestamp';
    case 'date':
      return typeof value === 'string' && ISO_DATE_PATTERN.test(value)
        ? null
        : 'must be an ISO date';
    case 'duration':
      return typeof value === 'string' && DURATION_PATTERN.test(value)
        ? null
        : 'must be a CEL duration string';
    case 'id':
      return typeof value === 'string' && DOMAIN_ID_PATTERN.test(value)
        ? null
        : 'must be a stable FM id';
    case 'list':
      return Array.isArray(value) ? null : 'must be a list';
    case 'map':
      return isRecord(value) ? null : 'must be an object';
    case 'money': {
      if (!isRecord(value)) {
        return 'must be an object with minorUnits and currency';
      }
      if (
        typeof value['minorUnits'] !== 'number' ||
        !Number.isInteger(value['minorUnits'])
      ) {
        return 'minorUnits must be an integer';
      }
      if (
        typeof value['currency'] !== 'string' ||
        value['currency'].length === 0
      ) {
        return 'currency must be a non-empty string';
      }

      return null;
    }
    default:
      return null;
  }
};

const toUtcSeconds = (text: string): string | null => {
  if (!isTimestampText(text)) {
    return null;
  }

  const iso = new Date(text).toISOString();

  return `${iso.slice(0, 19)}Z`;
};

/**
 * Normalizes a JSON value the way the reports print it: UTC timestamps become
 * `...Z`, a whole double prints as an integer, and containers stay JSON.
 */
export const normalizeJsonValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const normalized = toUtcSeconds(value);

    return normalized ?? value;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeJsonValue(item)]),
    );
  }

  return value;
};

/** True when `name` is a lower snake_case attribute name. */
export const isAttributeName = (name: string): boolean =>
  ATTRIBUTE_NAME_PATTERN.test(name);

/**
 * Structural equality over normalized JSON, independent of key order.
 *
 * Two derivations of the same object can print their keys in different orders;
 * comparing their text would call them different values.
 */
export const jsonValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => jsonValuesEqual(item, right[index]))
    );
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] && jsonValuesEqual(left[key], right[key]),
      )
    );
  }

  return left === right;
};
