import type { EntityAST, ValueType } from '@evidence-poc/evidence-schema';

import type { FmIndex } from '../adapter/fmAdapter.js';
import { errorDiagnostic, type Diagnostic } from '../diagnostics.js';
import { instanceErrors } from '../schemas/jsonSchema.js';

/**
 * The declared request and response bodies, and whether they agree with the model.
 *
 * A field that names an FM attribute is a promise about where the value comes
 * from: a derived attribute must be declared derived, a timestamp must be
 * declared as such, and a client must not be allowed to post a value the server
 * computes. Those three are the checks that stop an API from quietly becoming a
 * second model.
 */

type JsonObject = Record<string, unknown>;

/** FM value type → the JSON Schema type it must be declared as. */
const EXPECTED_JSON_TYPE: Readonly<Record<string, string>> = {
  string: 'string',
  id: 'string',
  timestamp: 'string',
  date: 'string',
  bool: 'boolean',
  int: 'integer',
  uint: 'integer',
};

/** FM value type → the JSON Schema format it must declare. */
const EXPECTED_FORMAT: Readonly<Record<string, string>> = {
  timestamp: 'date-time',
  date: 'date',
};

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordsOf = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

/** One declared field of a request or a representation. */
export interface PayloadField extends JsonObject {
  name: string;
  required: boolean;
  origin: string;
  schema: JsonObject;
  fmAttributeRef?: string;
}

/** A body a design declares. */
export interface Payload extends JsonObject {
  mediaType: string;
  fields: readonly PayloadField[];
  example: unknown;
}

/** The JSON Schema a payload implies, without ever resolving a remote reference. */
export const payloadSchema = (payload: Payload): JsonObject => ({
  type: 'object',
  properties: Object.fromEntries(
    payload.fields.map((field) => [field.name, field.schema]),
  ),
  required: payload.fields
    .filter((field) => field.required === true)
    .map((field) => field.name),
  additionalProperties: false,
});

/**
 * Whether a schema stays local.
 *
 * A `$ref` would point outside the declared contract, and resolving it would let
 * an API document import a shape nobody reviewed.
 */
export const schemaSupported = (schema: unknown): boolean => {
  if (Array.isArray(schema)) {
    return schema.every(schemaSupported);
  }

  if (!isRecord(schema)) {
    return true;
  }

  return Object.entries(schema).every(
    ([key, value]) =>
      key !== '$ref' && key !== '$dynamicRef' && key !== '$id' && schemaSupported(value),
  );
};

/** Sorted messages for an example that does not satisfy a payload's schema. */
export const exampleErrors = (schema: unknown, value: unknown): string[] =>
  instanceErrors(schema, value);

const attributeOf = (
  index: FmIndex,
  reference: string,
): { entity: EntityAST | undefined; attribute: { name: string; valueType?: ValueType; derivedByRuleRef?: string } | undefined } => {
  const separator = reference.indexOf('#');
  const entityId = separator < 0 ? reference : reference.slice(0, separator);
  const name = separator < 0 ? '' : reference.slice(separator + 1);
  const entity = index.entities.get(entityId) as EntityAST | undefined;

  return {
    entity,
    attribute: entity?.attributes?.find((item) => item.name === name),
  };
};

/** Why one field contradicts the model, if it does. */
const fieldOriginDiagnostics = (
  field: PayloadField,
  index: FmIndex,
  target: string,
  request: boolean,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  if (request && field.origin !== 'client' && field.origin !== 'reference') {
    diagnostics.push(
      errorDiagnostic(
        'CONTRACT_FIELD_ORIGIN',
        '请求不能将服务端记录或派生值当作客户端输入',
        target,
      ),
    );
  }

  const reference = field.fmAttributeRef;

  if (reference === undefined || reference === '') {
    return diagnostics;
  }

  const { entity, attribute } = attributeOf(index, reference);

  if (entity === undefined || attribute === undefined) {
    diagnostics.push(
      errorDiagnostic('CONTRACT_FM_REF', `字段来源不存在: ${reference}`, target),
    );

    return diagnostics;
  }

  const derived = attribute.derivedByRuleRef;

  if (
    (derived !== undefined && field.origin !== 'derived') ||
    (field.origin === 'derived' && derived === undefined)
  ) {
    diagnostics.push(
      errorDiagnostic('CONTRACT_FIELD_ORIGIN', `派生口径与 FM 不一致: ${reference}`, target),
    );
  }

  const expected = EXPECTED_JSON_TYPE[attribute.valueType ?? ''];
  const declared = field.schema['type'];
  const acceptable =
    declared === expected ||
    (Array.isArray(declared) &&
      declared.length === 2 &&
      declared.includes(expected as string) &&
      declared.includes('null'));

  if (expected !== undefined && !acceptable) {
    diagnostics.push(
      errorDiagnostic('CONTRACT_FIELD_TYPE', `字段类型与 FM 不一致: ${reference}`, target),
    );
  }

  const format = EXPECTED_FORMAT[attribute.valueType ?? ''];

  if (format !== undefined && field.schema['format'] !== format) {
    diagnostics.push(
      errorDiagnostic(
        'CONTRACT_FIELD_TYPE',
        `业务时间需声明 ${format}: ${reference}`,
        target,
      ),
    );
  }

  return diagnostics;
};

/**
 * Checks one declared body.
 *
 * `request` matters because a request and a response are allowed to name
 * different origins: a server may return a derived value, a client may not send
 * one as if it were input.
 */
export const validatePayload = (
  payload: Payload,
  index: FmIndex,
  target: string,
  request = false,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const field of payload.fields) {
    if (seen.has(field.name)) {
      diagnostics.push(
        errorDiagnostic('CONTRACT_DUPLICATE', '字段名称重复', target),
      );
    }

    seen.add(field.name);

    if (!schemaSupported(field.schema)) {
      diagnostics.push(
        errorDiagnostic('CONTRACT_SCHEMA_UNSUPPORTED', '禁止外部或递归 Schema 引用', target),
      );
    }

    diagnostics.push(...fieldOriginDiagnostics(field, index, target, request));
  }

  for (const message of exampleErrors(payloadSchema(payload), payload.example)) {
    diagnostics.push(
      errorDiagnostic('CONTRACT_EXAMPLE_INVALID', message, target),
    );
  }

  return diagnostics;
};

/** Reads a declared body from the design without trusting its shape. */
export const payloadOf = (value: unknown): Payload => {
  const object = isRecord(value) ? value : {};

  return {
    ...object,
    mediaType: String(object['mediaType'] ?? ''),
    fields: recordsOf(object['fields']).map((field) => ({
      ...field,
      name: String(field['name'] ?? ''),
      required: field['required'] === true,
      origin: String(field['origin'] ?? ''),
      schema: isRecord(field['schema']) ? field['schema'] : {},
      ...(typeof field['fmAttributeRef'] === 'string'
        ? { fmAttributeRef: field['fmAttributeRef'] }
        : {}),
    })),
    example: object['example'],
  };
};
