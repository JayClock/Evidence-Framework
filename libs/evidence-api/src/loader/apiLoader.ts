import { readFileSync } from 'node:fs';

import { API_PROJECTION_SCHEMA } from '../schemas/apiProjectionSchema.js';
import { API_SCHEMA } from '../schemas/apiSchema.js';
import { compileSchema, type CompiledSchema } from '../schemas/jsonSchema.js';
import { errorDiagnostic, type Diagnostic } from '../diagnostics.js';

/**
 * The two contracts a projection is checked against.
 *
 * `api.schema.json` describes what a designer may write; `api-projection.schema.json`
 * describes what this engine must produce. Validating against the second is what
 * stops the renderer from silently inventing a shape a consumer cannot read.
 */

/** The design file must be one JSON object of this shape. */
export interface DesignDocument {
  [key: string]: unknown;
}

export const API_DESIGN_SECTIONS = [
  'sources',
  'decisions',
  'resources',
  'bindings',
  'scenarios',
  'capabilities',
  'journeys',
] as const;

const SEPARATORS = new Set(['.yaml', '.yml']);

let designValidator: CompiledSchema | undefined;
let projectionValidator: CompiledSchema | undefined;

const validatorFor = (which: 'design' | 'projection'): CompiledSchema => {
  if (which === 'design') {
    designValidator ??= compileSchema(API_SCHEMA);

    return designValidator;
  }

  projectionValidator ??= compileSchema(API_PROJECTION_SCHEMA);

  return projectionValidator;
};

/** `$` plus `["items"][0]["id"]`, the location form the reports print. */
const pointerOf = (instancePath: string): string => {
  if (instancePath === '') {
    return '$';
  }

  const parts = instancePath
    .split('/')
    .slice(1)
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));

  return `$${parts
    .map((part) => (/^\d+$/.test(part) ? `[${part}]` : `[${JSON.stringify(part)}]`))
    .join('')}`;
};

const messagesOf = (
  validator: CompiledSchema,
): { message: string; location: string }[] =>
  validator
    .errors()
    .map((item) => ({
      message: item.message ?? 'invalid',
      location: pointerOf(item.instancePath),
    }))
    .sort((left, right) => left.location.localeCompare(right.location));

/** Raised when a design file has two keys with the same name. */
export class DesignJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignJsonError';
  }
}

/**
 * Parses JSON while refusing what `JSON.parse` silently accepts.
 *
 * A duplicated key means one decision overwrote another, and `NaN` is not JSON:
 * both would let a design pass review with content nobody wrote.
 */
export const parseStrictJson = (text: string): unknown => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text, (key, value: unknown) => value);
  } catch (error) {
    throw new DesignJsonError(
      error instanceof Error ? error.message : String(error),
    );
  }

  return parsed;
};

/** Scans the raw text for duplicate keys, which `JSON.parse` collapses. */
const duplicateKeyOf = (text: string): string | null => {
  const stack: { keys: Set<string>; expectKey: boolean }[] = [];
  let index = 0;

  while (index < text.length) {
    const character = text[index] as string;

    if (character === '"') {
      let cursor = index + 1;
      let value = '';

      while (cursor < text.length) {
        const current = text[cursor] as string;

        if (current === '\\') {
          value += text.slice(cursor, cursor + 2);
          cursor += 2;
          continue;
        }
        if (current === '"') {
          break;
        }

        value += current;
        cursor += 1;
      }

      const frame = stack.at(-1);

      if (frame?.expectKey === true) {
        let decoded = value;

        try {
          decoded = JSON.parse(`"${value}"`) as string;
        } catch {
          decoded = value;
        }

        if (frame.keys.has(decoded)) {
          return decoded;
        }

        frame.keys.add(decoded);
        frame.expectKey = false;
      }

      index = cursor + 1;
      continue;
    }

    if (character === '{') {
      stack.push({ keys: new Set<string>(), expectKey: true });
      index += 1;
      continue;
    }

    if (character === '[') {
      // Array members are values, so the enclosing object is not expecting a key.
      stack.push({ keys: new Set<string>(), expectKey: false });
      index += 1;
      continue;
    }

    if (character === '}' || character === ']') {
      stack.pop();
      index += 1;
      continue;
    }

    if (character === ',') {
      const frame = stack.at(-1);

      if (frame !== undefined) {
        frame.expectKey = frame.expectKey || frame.keys.size > 0;
      }

      index += 1;
      continue;
    }

    index += 1;
  }

  return null;
};

/** Rejects the non-standard constants `JSON.parse` refuses but YAML allows. */
const NON_STANDARD_CONSTANTS = /\b(?:NaN|Infinity|-Infinity|undefined)\b/;

export interface LoadDesignResult {
  design: DesignDocument | null;
  diagnostics: readonly Diagnostic[];
}

/**
 * Reads one API design document and validates it against the design contract.
 *
 * Duplicate ids inside a section are reported here rather than later: a shadowed
 * decision would otherwise be referenced by an id that resolves to the wrong
 * record.
 */
export const loadDesign = (
  path: string,
  content?: string,
): LoadDesignResult => {
  const suffix = path.slice(path.lastIndexOf('.'));

  if (SEPARATORS.has(suffix.toLowerCase())) {
    return {
      design: null,
      diagnostics: [
        errorDiagnostic(
          'DESIGN_INVALID',
          'API 设计必须使用 .json 文件，不再接受 YAML',
          undefined,
          path,
        ),
      ],
    };
  }

  let text = content;

  if (text === undefined) {
    try {
      text = readFileSync(path, 'utf8');
    } catch (error) {
      return {
        design: null,
        diagnostics: [
          errorDiagnostic(
            'DESIGN_INVALID',
            error instanceof Error ? error.message : String(error),
            undefined,
            path,
          ),
        ],
      };
    }
  }

  let design: unknown;

  try {
    const duplicate = duplicateKeyOf(text);

    if (duplicate !== null) {
      throw new DesignJsonError(`设计包含重复 JSON key: ${duplicate}`);
    }

    if (NON_STANDARD_CONSTANTS.test(text)) {
      throw new DesignJsonError('设计包含非 JSON 常量');
    }

    design = parseStrictJson(text);
  } catch (error) {
    return {
      design: null,
      diagnostics: [
        errorDiagnostic(
          'DESIGN_INVALID',
          `设计不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          path,
        ),
      ],
    };
  }

  if (typeof design !== 'object' || design === null || Array.isArray(design)) {
    return {
      design: null,
      diagnostics: [
        errorDiagnostic('DESIGN_INVALID', '设计必须是单个 JSON 对象', undefined, path),
      ],
    };
  }

  const document = design as DesignDocument;
  const validate = validatorFor('design');

  if (!validate.validate(document)) {
    const diagnostics = messagesOf(validate).map((item) =>
      errorDiagnostic('DESIGN_INVALID', item.message, undefined, item.location),
    );

    return { design: document, diagnostics };
  }

  const diagnostics: Diagnostic[] = [];

  for (const section of API_DESIGN_SECTIONS) {
    const items = document[section];
    const seen = new Set<string>();

    if (!Array.isArray(items)) {
      continue;
    }

    items.forEach((item, index) => {
      if (typeof item !== 'object' || item === null) {
        return;
      }

      const id = (item as Record<string, unknown>)['id'];

      if (typeof id !== 'string') {
        return;
      }

      if (seen.has(id)) {
        diagnostics.push(
          errorDiagnostic(
            'DUPLICATE_ID',
            `${section} 中 ID 重复: ${id}`,
            id,
            `$.${section}[${index}]`,
          ),
        );
      }

      seen.add(id);
    });
  }

  return { design: document, diagnostics };
};

/** Validates a produced document against the projection contract. */
export const validateProjection = (
  document: unknown,
): readonly Diagnostic[] => {
  const validate = validatorFor('projection');

  if (validate.validate(document)) {
    return [];
  }

  return messagesOf(validate).map((item) =>
    errorDiagnostic('PROJECTION_INVALID', item.message, undefined, item.location),
  );
};
