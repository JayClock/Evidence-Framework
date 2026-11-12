import {
  FM_SCHEMA_VERSION,
  type DomainModelDocument,
  type DomainModelManifest,
  type EntityAST,
  type RelationshipAST,
  type RuleAST,
  strictValidateDomainModel,
} from '@evidence-poc/evidence-schema';

import {
  EMPTY_MODEL_ISSUE_CODE,
  serializeDomainModel,
  stringifyModelJson,
  type ModelSourceFile,
  type ModelSourceIssue,
  type ParseOptions,
  type SerializeOptions,
  parseModelSourceFiles,
} from './modelSourceFiles.js';

/** Discriminator of the single-file model bundle. */
export const MODEL_BUNDLE_TYPE = 'fm_bundle';

/**
 * Suffix of the single-file model bundle.
 *
 * A bundle is one JSON object holding what `.evidence/fm/` keeps in a tree, so
 * it can be mailed, dragged onto the desktop app or read by a script without a
 * directory walk.
 */
export const MODEL_BUNDLE_EXTENSION = '.evidence.json';

/** Bundle name `pack` uses when the caller does not pass one. */
export const DEFAULT_MODEL_BUNDLE_FILE = `model${MODEL_BUNDLE_EXTENSION}`;

/** Source tree holding Evidence Instances. */
export const VALIDATION_INSTANCE_TREE = 'validation/instances';

/** Source tree holding Scenarios. */
export const VALIDATION_SCENARIO_TREE = 'validation/scenarios';

/** Prose the FM skill keeps next to the model sources. */
export const MODEL_README_PATH = 'README.md';

type JsonObject = Record<string, unknown>;

/**
 * Validation inputs carried by a bundle.
 *
 * They are not model types: the bundle only spares a reader the second tree.
 */
export interface ModelBundleValidation {
  instances: readonly JsonObject[];
  scenarios: readonly JsonObject[];
}

/**
 * One-file form of a `.evidence/fm/` tree.
 *
 * The model part is exactly `DomainModelDocument`, so a bundle can feed a
 * `ModelSession` unchanged; the extra keys only exist so packing and unpacking
 * a directory is lossless.
 */
export interface DomainModelBundle extends DomainModelDocument {
  type: typeof MODEL_BUNDLE_TYPE;
  schemaVersion: typeof FM_SCHEMA_VERSION;
  validation?: ModelBundleValidation;
  /** Contents of `.evidence/fm/README.md`, when the tree had one. */
  readme?: string;
}

export interface ModelBundleParseResult {
  document: DomainModelBundle;
  issues: ModelSourceIssue[];
}

export interface PackResult {
  bundle: DomainModelBundle;
  issues: ModelSourceIssue[];
}

export interface SerializeBundleOptions extends SerializeOptions {
  /**
   * Sort entities, relationships and rules by id.
   *
   * A single file is diffed as a whole, so a stable order matters more than the
   * order the objects were authored in. Defaults to `true`.
   */
  sortItems?: boolean;
}

const normalizePath = (path: string): string =>
  path.replaceAll('\\', '/').replace(/^\.\//, '');

/** True when `path` names a single-file model bundle. */
export const isModelBundlePath = (path: string): boolean =>
  normalizePath(path).toLowerCase().endsWith(MODEL_BUNDLE_EXTENSION);

/** Cheap shape guard used before strict validation runs. */
export const isModelBundleShape = (
  value: unknown,
): value is DomainModelBundle => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate['type'] === MODEL_BUNDLE_TYPE &&
    typeof candidate['manifest'] === 'object' &&
    candidate['manifest'] !== null &&
    Array.isArray(candidate['entities']) &&
    Array.isArray(candidate['relationships']) &&
    Array.isArray(candidate['rules'])
  );
};

export const createEmptyModelBundle = (
  manifest: Partial<DomainModelManifest> = {},
): DomainModelBundle => ({
  type: MODEL_BUNDLE_TYPE,
  schemaVersion: FM_SCHEMA_VERSION,
  manifest: {
    type: 'fm_model',
    schemaVersion: FM_SCHEMA_VERSION,
    id: 'untitled',
    name: 'Untitled model',
    version: '0.1.0',
    ruleLanguage: 'CEL',
    entryContextRefs: [],
    ...manifest,
  },
  entities: [],
  relationships: [],
  rules: [],
});

const failure = (
  path: string,
  message: string,
  code?: string,
): ModelSourceIssue => ({
  path,
  message,
  ...(code === undefined ? {} : { code }),
});

const readJsonObject = (
  value: unknown,
  path: string,
  issues: ModelSourceIssue[],
): JsonObject | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.push(failure(path, 'expected a JSON object.'));
    return undefined;
  }

  return value as JsonObject;
};

const collectItems = <T>(
  value: unknown,
  tree: string,
  expectedType: string,
  issues: ModelSourceIssue[],
): T[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    issues.push(failure(tree, `${tree} must be an array.`));
    return [];
  }

  const items: T[] = [];

  value.forEach((entry, index) => {
    const path = `${tree}[${index}]`;
    const item = readJsonObject(entry, path, issues);

    if (item === undefined) {
      return;
    }

    if (item['type'] !== expectedType) {
      issues.push(
        failure(
          path,
          `type must be '${expectedType}', found ${JSON.stringify(item['type'])}.`,
        ),
      );
      return;
    }

    items.push(item as T);
  });

  return items;
};

const collectValidation = (
  value: unknown,
  issues: ModelSourceIssue[],
): ModelBundleValidation | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const validation = readJsonObject(value, 'validation', issues);

  if (validation === undefined) {
    return undefined;
  }

  return {
    instances: collectValidationItems(
      validation['instances'],
      `${VALIDATION_INSTANCE_TREE}/`,
      issues,
    ),
    scenarios: collectValidationItems(
      validation['scenarios'],
      `${VALIDATION_SCENARIO_TREE}/`,
      issues,
    ),
  };
};

const collectValidationItems = (
  value: unknown,
  tree: string,
  issues: ModelSourceIssue[],
): JsonObject[] => {
  if (value === undefined) {
    issues.push(failure(tree, `${tree} must be an array.`));
    return [];
  }

  if (!Array.isArray(value)) {
    issues.push(failure(tree, `${tree} must be an array.`));
    return [];
  }

  const items: JsonObject[] = [];

  value.forEach((entry, index) => {
    const item = readJsonObject(entry, `${tree}[${index}]`, issues);

    if (item !== undefined) {
      items.push(item);
    }
  });

  return items;
};

/**
 * Parses a single-file bundle.
 *
 * Like `parseModelSourceFiles`, structural problems are reported as issues and
 * parsing never throws. `validate: true` additionally runs the static FM checks.
 */
export function parseModelBundleText(
  text: string,
  options: ParseOptions = {},
): ModelBundleParseResult {
  const issues: ModelSourceIssue[] = [];
  const document = createEmptyModelBundle();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    issues.push(
      failure(
        MODEL_BUNDLE_EXTENSION,
        `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );

    return { document, issues };
  }

  const root = readJsonObject(parsed, MODEL_BUNDLE_EXTENSION, issues);

  if (root === undefined) {
    return { document, issues };
  }

  if (root['type'] !== MODEL_BUNDLE_TYPE) {
    issues.push(
      failure(
        'type',
        `bundle type must be '${MODEL_BUNDLE_TYPE}', found ${JSON.stringify(root['type'])}.`,
      ),
    );
  }

  const schemaVersion = root['schemaVersion'];

  if (schemaVersion !== undefined && schemaVersion !== FM_SCHEMA_VERSION) {
    issues.push(
      failure(
        'schemaVersion',
        `bundle schemaVersion must be '${FM_SCHEMA_VERSION}', found ${JSON.stringify(schemaVersion)}.`,
      ),
    );
  }

  const manifest = readJsonObject(root['manifest'], 'manifest', issues);
  const entities = collectItems<EntityAST>(
    root['entities'],
    'entities',
    'entity',
    issues,
  );
  const relationships = collectItems<RelationshipAST>(
    root['relationships'],
    'relationships',
    'relationship',
    issues,
  );
  const rules = collectItems<RuleAST>(root['rules'], 'rules', 'rule', issues);
  const validation = collectValidation(root['validation'], issues);
  const readme = root['readme'];

  if (readme !== undefined && typeof readme !== 'string') {
    issues.push(failure('readme', 'readme must be a string.'));
  }

  if (manifest === undefined) {
    issues.push(failure('manifest', 'bundle requires a manifest object.'));
  } else {
    document.manifest = manifest as unknown as DomainModelManifest;
  }

  document.entities = entities;
  document.relationships = relationships;
  document.rules = rules;

  if (validation !== undefined) {
    document.validation = validation;
  }

  if (typeof readme === 'string') {
    document.readme = readme;
  }

  const seen = new Map<string, string>();

  for (const [tree, items] of [
    ['entities', entities],
    ['relationships', relationships],
    ['rules', rules],
  ] as const) {
    items.forEach((item, index) => {
      const previous = seen.get(item.id);

      if (previous !== undefined) {
        issues.push(
          failure(
            `${tree}[${index}]`,
            `duplicate id '${item.id}' also defined in ${previous}.`,
          ),
        );
        return;
      }

      seen.set(item.id, `${tree}[${index}]`);
    });
  }

  if (entities.length === 0) {
    issues.push(
      failure(
        'entities',
        'model must contain at least one entity.',
        EMPTY_MODEL_ISSUE_CODE,
      ),
    );
  }

  if (options.validate === true) {
    // Static checks consume the model part only, so bundle extras never leak
    // into a validator that does not know them.
    for (const issue of strictValidateDomainModel({
      manifest: document.manifest,
      entities: document.entities,
      relationships: document.relationships,
      rules: document.rules,
    }).issues) {
      issues.push({
        path: issue.path,
        message: issue.message,
        ...(issue.code === undefined ? {} : { code: issue.code }),
      });
    }
  }

  return { document, issues };
}

const byId = (left: { id: string }, right: { id: string }): number =>
  left.id.localeCompare(right.id);

/**
 * Serializes a document as one bundle.
 *
 * Bundle extras (`validation`, `readme`) survive: a document that came from
 * `parseModelBundleText` writes back exactly what the author kept, which is what
 * makes an edit-then-save round trip lossless.
 */
export function serializeModelBundle(
  document: DomainModelDocument | DomainModelBundle,
  options: SerializeBundleOptions = {},
): string {
  const bundle = document as Partial<DomainModelBundle>;
  const sortItems = options.sortItems ?? true;
  const sort = <T extends { id: string }>(items: readonly T[]): T[] =>
    sortItems ? [...items].sort(byId) : [...items];
  const envelope: Record<string, unknown> = {
    type: MODEL_BUNDLE_TYPE,
    schemaVersion: FM_SCHEMA_VERSION,
    manifest: document.manifest,
    entities: sort(document.entities),
    relationships: sort(document.relationships),
    rules: sort(document.rules),
  };

  if (bundle.validation !== undefined) {
    envelope['validation'] = {
      instances: [...bundle.validation.instances],
      scenarios: [...bundle.validation.scenarios],
    };
  }

  if (typeof bundle.readme === 'string') {
    envelope['readme'] = bundle.readme;
  }

  return stringifyModelJson(envelope, options);
}

const isValidationDocument = (path: string, tree: string): boolean =>
  path.startsWith(`${tree}/`) && path.endsWith('.json');

/**
 * Collects `validation/instances/**` and `validation/scenarios/**`.
 *
 * A malformed file is reported instead of dropped: packing must never silently
 * lose the scenarios an author wrote.
 */
const collectValidationSources = (
  files: readonly ModelSourceFile[],
  issues: ModelSourceIssue[],
): ModelBundleValidation | undefined => {
  const instances: JsonObject[] = [];
  const scenarios: JsonObject[] = [];
  let present = false;

  for (const file of files) {
    const path = normalizePath(file.path);
    const isInstance = isValidationDocument(path, VALIDATION_INSTANCE_TREE);
    const isScenario = isValidationDocument(path, VALIDATION_SCENARIO_TREE);

    if (!isInstance && !isScenario) {
      continue;
    }

    present = true;

    let parsed: unknown;

    try {
      parsed = JSON.parse(file.content);
    } catch (error) {
      issues.push(
        failure(
          path,
          `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      continue;
    }

    const item = readJsonObject(parsed, path, issues);

    if (item !== undefined) {
      (isInstance ? instances : scenarios).push(item);
    }
  }

  return present ? { instances, scenarios } : undefined;
};

/**
 * Packs a directory's source files into one bundle.
 *
 * The model part is parsed with the same rules as `.evidence/fm/`, so a tree the
 * FM checks accept packs into a bundle the checks accept too.
 */
export function packModelSourceFiles(
  files: readonly ModelSourceFile[],
): PackResult {
  const { document, issues } = parseModelSourceFiles(files);
  const validation = collectValidationSources(files, issues);
  const readme = files.find(
    (file) => normalizePath(file.path) === MODEL_README_PATH,
  );
  const bundle: DomainModelBundle = {
    type: MODEL_BUNDLE_TYPE,
    schemaVersion: FM_SCHEMA_VERSION,
    manifest: document.manifest,
    entities: document.entities,
    relationships: document.relationships,
    rules: document.rules,
  };

  if (validation !== undefined) {
    bundle.validation = validation;
  }

  if (readme !== undefined) {
    bundle.readme = readme.content;
  }

  return { bundle, issues };
}

const fileNameOf = (document: JsonObject, index: number): string => {
  const id = document['id'];

  if (typeof id === 'string' && id !== '') {
    return `${id.split('.').join('--')}.json`;
  }

  return `unnamed-${index + 1}.json`;
};

/**
 * Projects a bundle back onto `.evidence/fm/` files.
 *
 * Ordering matches `serializeDomainModel`: manifest first, then the three model
 * trees, the validation inputs and finally `README.md`.
 */
export function modelBundleSourceFiles(
  bundle: DomainModelDocument | DomainModelBundle,
  options: SerializeBundleOptions = {},
): ModelSourceFile[] {
  const extras = bundle as Partial<DomainModelBundle>;
  const files = serializeDomainModel(bundle, options);

  for (const [tree, items] of [
    [VALIDATION_INSTANCE_TREE, extras.validation?.instances ?? []],
    [VALIDATION_SCENARIO_TREE, extras.validation?.scenarios ?? []],
  ] as const) {
    items.forEach((item, index) => {
      files.push({
        path: `${tree}/${fileNameOf(item, index)}`,
        content: stringifyModelJson(item, options),
      });
    });
  }

  if (typeof extras.readme === 'string') {
    files.push({
      path: MODEL_README_PATH,
      content: extras.readme.endsWith('\n')
        ? extras.readme
        : `${extras.readme}\n`,
    });
  }

  return files;
}
