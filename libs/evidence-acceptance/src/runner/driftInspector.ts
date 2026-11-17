import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export interface DriftIssue {
  readonly type:
    | 'extraneous_field'
    | 'missing_required'
    | 'type_mismatch'
    | 'schema_mismatch';
  /** RFC 6901 JSON Pointer, including the offending property when available. */
  readonly path: string;
  readonly message: string;
  readonly keyword: string;
}
export interface DriftReport {
  readonly hasDrift: boolean;
  readonly issues: readonly DriftIssue[];
}
const pointer = (name: string) => name.replace(/~/g, '~0').replace(/\//g, '~1');
function issue(error: ErrorObject): DriftIssue {
  const property: unknown =
    error.params['additionalProperty'] ??
    error.params['missingProperty'] ??
    error.params['unevaluatedProperty'];
  return {
    type: ['additionalProperties', 'unevaluatedProperties'].includes(
      error.keyword,
    )
      ? 'extraneous_field'
      : error.keyword === 'required'
        ? 'missing_required'
        : ['type', 'format'].includes(error.keyword)
          ? 'type_mismatch'
          : 'schema_mismatch',
    path:
      error.instancePath +
      (typeof property === 'string' ? `/${pointer(property)}` : ''),
    message: error.message ?? error.keyword,
    keyword: error.keyword,
  };
}

/** Standard JSON Schema 2020-12 semantics; open maps remain open, no payload mutation. */
export function createDriftInspector(
  schema: Record<string, unknown>,
): (payload: unknown) => DriftReport {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  addFormats.default(ajv);
  // Local references are resolved by AJV. Remote references are never fetched.
  const validate = ajv.compile(schema);
  return (payload) => {
    const valid = validate(payload);
    return { hasDrift: !valid, issues: (validate.errors ?? []).map(issue) };
  };
}

export function inspectPayloadDrift(
  schema: Record<string, unknown>,
  payload: unknown,
): DriftReport {
  return createDriftInspector(schema)(payload);
}
