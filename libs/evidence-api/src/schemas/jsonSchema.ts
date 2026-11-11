import { Ajv2020 } from 'ajv/dist/2020.js';
import type {
  ErrorObject,
  Options,
  ValidateFunction,
} from 'ajv/dist/2020.js';

/**
 * JSON Schema 2020-12 validation with the format checks the FM contracts use.
 *
 * `ajv` walks `properties`, `oneOf` and `if`/`then` for us; the only thing worth
 * owning is which `format` names mean something. Python's `FormatChecker`
 * validates the formats it knows and silently ignores the rest, so a design that
 * declares a project-specific format keeps working — it just is not enforced.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

const URI_REFERENCE = /^(?:[A-Za-z][A-Za-z0-9+.-]*:[^\s]*|\/[^\s]*|#[^\s]*|$)/;

const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Formats this engine enforces, mirroring the ones the FM contracts declare. */
const KNOWN_FORMATS: Readonly<Record<string, (value: string) => boolean>> = {
  date: (value) => ISO_DATE.test(value),
  'date-time': (value) => ISO_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value)),
  'uri-reference': (value) => URI_REFERENCE.test(value),
  uri: (value) => /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/.test(value),
  uuid: (value) => UUID.test(value),
  email: (value) => EMAIL.test(value),
  regex: (value) => {
    try {
      new RegExp(value, 'u');

      return true;
    } catch {
      return false;
    }
  },
  'json-pointer': (value) => value === '' || /^(?:\/(?:[^~/]|~[01])*)+$/.test(value),
};

/** Every `format` name a schema mentions, so unknown ones can be tolerated. */
const formatNamesIn = (schema: unknown, into: Set<string>): Set<string> => {
  if (Array.isArray(schema)) {
    schema.forEach((item) => formatNamesIn(item, into));

    return into;
  }

  if (typeof schema !== 'object' || schema === null) {
    return into;
  }

  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'format' && typeof value === 'string') {
      into.add(value);
      continue;
    }

    formatNamesIn(value, into);
  }

  return into;
};

export interface CompiledSchema {
  validate: ValidateFunction;
  /** Why the last {@link CompiledSchema.validate} call failed, if it did. */
  errors(): readonly ErrorObject[];
}

const createAjv = (options: Options = {}): Ajv2020 => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    // The schemas are data, not code: an unknown keyword in a document written
    // for a newer draft must not abort the compile.
    validateSchema: false,
    ...options,
  });

  for (const [name, check] of Object.entries(KNOWN_FORMATS)) {
    ajv.addFormat(name, { type: 'string', validate: check });
  }

  return ajv;
};

/** Compiles a schema, tolerating any format name it declares. */
export const compileSchema = (
  schema: unknown,
  options: Options = {},
): CompiledSchema => {
  const ajv = createAjv(options);

  for (const name of formatNamesIn(schema, new Set<string>())) {
    if (name in KNOWN_FORMATS) {
      continue;
    }

    // Unknown formats are carried, not enforced — the same reading Python's
    // format checker gives a name it has no validator for.
    ajv.addFormat(name, { type: 'string', validate: () => true });
  }

  const validate = ajv.compile(schema as object);

  return {
    validate,
    errors: () => validate.errors ?? [],
  };
};

/** Rejects a schema that is not valid JSON Schema at all. */
export const checkSchema = (schema: unknown): string | null => {
  try {
    compileSchema(schema);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  // A schema that references something outside itself cannot be checked locally;
  // the design contract forbids those references in payloads.
  return hasUnsupportedReference(schema)
    ? '只支持本地内联 JSON Schema，不解析引用'
    : null;
};

const hasUnsupportedReference = (schema: unknown): boolean => {
  if (Array.isArray(schema)) {
    return schema.some(hasUnsupportedReference);
  }

  if (typeof schema !== 'object' || schema === null) {
    return false;
  }

  return Object.entries(schema as Record<string, unknown>).some(
    ([key, value]) =>
      key === '$ref' || key === '$dynamicRef' || key === '$id'
        ? true
        : hasUnsupportedReference(value),
  );
};

/**
 * Messages for an instance, sorted so two runs report the same findings.
 *
 * An empty list means the instance satisfies the schema.
 */
export const instanceErrors = (schema: unknown, value: unknown): string[] => {
  if (hasUnsupportedReference(schema)) {
    return ['只支持本地内联 JSON Schema，不解析引用'];
  }

  let compiled: CompiledSchema;

  try {
    compiled = compileSchema(schema);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  if (compiled.validate(value)) {
    return [];
  }

  return compiled
    .errors()
    .map((item) => item.message ?? 'invalid')
    .sort();
};
