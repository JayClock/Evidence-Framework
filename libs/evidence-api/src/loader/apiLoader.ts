import { readFileSync } from 'node:fs';

import { API_PROJECTION_SCHEMA } from '../schemas/apiProjectionSchema.js';
import { API_SCHEMA } from '../schemas/apiSchema.js';
import { compileSchema, type CompiledSchema } from '../schemas/jsonSchema.js';
import { errorDiagnostic, type Diagnostic } from '../diagnostics.js';

/** The local overlay input and generated snapshot are independently validated. */

/** The design file must be one JSON object of this shape. */
export interface RouteOverlay {
  id: string;
  path?: string;
  summary?: string;
}

export interface JourneyOverlay {
  id: string;
  roleRef: string;
  routeId: string;
  nextPossibleSteps?: readonly string[];
}

export interface DesignDocument {
  [key: string]: unknown;
}

/** Validate supplied fields before applying defaults; never erase malformed input. */
export const normalizeDesignDocument = (
  raw: DesignDocument,
): DesignDocument => ({
  schemaVersion: '5.0',
  id: 'default-api',
  routes: [],
  journeys: [],
  ...raw,
});

export const API_DESIGN_SECTIONS = ['routes', 'journeys'] as const;

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
    .map((part) =>
      /^\d+$/.test(part) ? `[${part}]` : `[${JSON.stringify(part)}]`,
    )
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

/** JSON.parse validates syntax; a token walk prevents duplicate overlay keys from disappearing. */
const parseOverlayJson = (text: string): unknown => {
  const parsed: unknown = JSON.parse(text);
  const frames: (Set<string> | null)[] = [];
  for (const match of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\]]/g)) {
    const token = match[0];
    if (token === '{') frames.push(new Set());
    else if (token === '[') frames.push(null);
    else if (token === '}' || token === ']') frames.pop();
    else if (/^\s*:/.test(text.slice(match.index + token.length))) {
      const keys = frames.at(-1);
      const key = JSON.parse(token) as string;
      if (keys?.has(key)) throw new Error(`设计包含重复 JSON key: ${key}`);
      keys?.add(key);
    }
  }
  return parsed;
};

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
    design = parseOverlayJson(text);
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
        errorDiagnostic(
          'DESIGN_INVALID',
          '设计必须是单个 JSON 对象',
          undefined,
          path,
        ),
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

  return { design: normalizeDesignDocument(document), diagnostics };
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
    errorDiagnostic(
      'PROJECTION_INVALID',
      item.message,
      undefined,
      item.location,
    ),
  );
};
