import {
  FM_SCHEMA_VERSION,
  strictValidateDomainModel,
  type DomainModelDocument,
  type DomainModelManifest,
  type EntityAST,
  type RelationshipAST,
  type RuleAST,
} from '@evidence-poc/evidence-schema';
import {
  EMPTY_MODEL_ISSUE_CODE,
  serializeDomainModel,
  stringifyModelJson,
  parseModelSourceFiles,
  type ModelSourceFile,
  type ModelSourceIssue,
  type ParseOptions,
  type SerializeOptions,
} from './modelSourceFiles.js';

export const MODEL_BUNDLE_TYPE = 'fm_bundle';
export const MODEL_BUNDLE_EXTENSION = '.evidence.json';
export const DEFAULT_MODEL_BUNDLE_FILE = `model${MODEL_BUNDLE_EXTENSION}`;
export const MODEL_README_PATH = 'README.md';

/** The model, including inline examples, is the only source of acceptance cases. */
export interface DomainModelBundle extends DomainModelDocument {
  type: typeof MODEL_BUNDLE_TYPE;
  schemaVersion: typeof FM_SCHEMA_VERSION;
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
  sortItems?: boolean;
}
type JsonObject = Record<string, unknown>;
const normalizePath = (path: string): string =>
  path.replaceAll('\\', '/').replace(/^\.\//, '');
export const isModelBundlePath = (path: string): boolean =>
  normalizePath(path).toLowerCase().endsWith(MODEL_BUNDLE_EXTENSION);
export const isModelBundleShape = (
  value: unknown,
): value is DomainModelBundle => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as JsonObject;
  return (
    candidate.type === MODEL_BUNDLE_TYPE &&
    typeof candidate.manifest === 'object' &&
    candidate.manifest !== null &&
    Array.isArray(candidate.entities) &&
    Array.isArray(candidate.relationships) &&
    Array.isArray(candidate.rules)
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
const object = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const legacyMessage =
  'Legacy validation scenarios/instances are no longer supported; use entity examples[].test and export-tests.';
const assertNoLegacy = (value: unknown): void => {
  if (object(value) && Object.hasOwn(value, 'validation'))
    throw new Error(legacyMessage);
};

/** No compatibility reader: a legacy bundle produces a blocking source issue. */
export function parseModelBundleText(
  text: string,
  options: ParseOptions = {},
): ModelBundleParseResult {
  const document = createEmptyModelBundle(),
    issues: ModelSourceIssue[] = [];
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (error) {
    return {
      document,
      issues: [
        failure(MODEL_BUNDLE_EXTENSION, `invalid JSON: ${String(error)}`),
      ],
    };
  }
  if (!object(root))
    return {
      document,
      issues: [failure(MODEL_BUNDLE_EXTENSION, 'expected a JSON object.')],
    };
  const keys = new Set([
    'type',
    'schemaVersion',
    'manifest',
    'entities',
    'relationships',
    'rules',
    'readme',
  ]);
  for (const key of Object.keys(root))
    if (!keys.has(key))
      issues.push(
        failure(
          key,
          key === 'validation'
            ? legacyMessage
            : `unsupported bundle field '${key}'.`,
        ),
      );
  if (root.type !== MODEL_BUNDLE_TYPE)
    issues.push(
      failure(
        'type',
        `bundle type must be '${MODEL_BUNDLE_TYPE}', found ${JSON.stringify(root.type)}.`,
      ),
    );
  if (
    root.schemaVersion !== undefined &&
    root.schemaVersion !== FM_SCHEMA_VERSION
  )
    issues.push(
      failure(
        'schemaVersion',
        `bundle schemaVersion must be '${FM_SCHEMA_VERSION}', found ${JSON.stringify(root.schemaVersion)}.`,
      ),
    );
  if (object(root.manifest))
    document.manifest = root.manifest as unknown as DomainModelManifest;
  else issues.push(failure('manifest', 'bundle requires a manifest object.'));
  const collect = <T>(key: string, type: string): T[] => {
    const values = root[key];
    if (values === undefined) return [];
    if (!Array.isArray(values)) {
      issues.push(failure(key, `${key} must be an array.`));
      return [];
    }
    return values.filter((item, index) => {
      if (!object(item)) {
        issues.push(failure(`${key}[${index}]`, 'expected a JSON object.'));
        return false;
      }
      if (item.type !== type) {
        issues.push(
          failure(
            `${key}[${index}]`,
            `type must be '${type}', found ${JSON.stringify(item.type)}.`,
          ),
        );
        return false;
      }
      return true;
    }) as T[];
  };
  document.entities = collect<EntityAST>('entities', 'entity');
  document.relationships = collect<RelationshipAST>(
    'relationships',
    'relationship',
  );
  document.rules = collect<RuleAST>('rules', 'rule');
  if (typeof root.readme === 'string') document.readme = root.readme;
  else if (root.readme !== undefined)
    issues.push(failure('readme', 'readme must be a string.'));
  const seen = new Map<string, string>();
  for (const [tree, items] of [
    ['entities', document.entities],
    ['relationships', document.relationships],
    ['rules', document.rules],
  ] as const) {
    items.forEach((item, index) => {
      const source = `${tree}[${index}]`,
        previous = seen.get(item.id);
      if (previous !== undefined)
        issues.push(
          failure(
            source,
            `duplicate id '${item.id}' (already declared at ${previous}).`,
          ),
        );
      seen.set(item.id, source);
    });
  }
  if (options.validate === true) {
    for (const issue of strictValidateDomainModel({
      manifest: document.manifest,
      entities: document.entities,
      relationships: document.relationships,
      rules: document.rules,
    }).issues)
      issues.push(failure(issue.path, issue.message, issue.code));
  }
  if (document.entities.length === 0)
    issues.push(
      failure(
        'entities',
        'model must contain at least one entity.',
        EMPTY_MODEL_ISSUE_CODE,
      ),
    );
  return { document, issues };
}

export function serializeModelBundle(
  document: DomainModelDocument | DomainModelBundle,
  options: SerializeBundleOptions = {},
): string {
  assertNoLegacy(document);
  const sort = <T extends { id: string }>(items: readonly T[]): T[] =>
    options.sortItems === false
      ? [...items]
      : [...items].sort((a, b) => a.id.localeCompare(b.id));
  const bundle = document as Partial<DomainModelBundle>;
  return stringifyModelJson(
    {
      type: MODEL_BUNDLE_TYPE,
      schemaVersion: FM_SCHEMA_VERSION,
      manifest: document.manifest,
      entities: sort(document.entities),
      relationships: sort(document.relationships),
      rules: sort(document.rules),
      ...(typeof bundle.readme === 'string' ? { readme: bundle.readme } : {}),
    },
    options,
  );
}

export function packModelSourceFiles(
  files: readonly ModelSourceFile[],
): PackResult {
  const { document, issues } = parseModelSourceFiles(files);
  const readme = files.find(
    (file) => normalizePath(file.path) === MODEL_README_PATH,
  );
  return {
    bundle: {
      type: MODEL_BUNDLE_TYPE,
      schemaVersion: FM_SCHEMA_VERSION,
      ...document,
      ...(readme === undefined ? {} : { readme: readme.content }),
    },
    issues,
  };
}

export function modelBundleSourceFiles(
  bundle: DomainModelDocument | DomainModelBundle,
  options: SerializeBundleOptions = {},
): ModelSourceFile[] {
  assertNoLegacy(bundle);
  const files = serializeDomainModel(bundle, options);
  const readme = (bundle as Partial<DomainModelBundle>).readme;
  if (typeof readme === 'string')
    files.push({
      path: MODEL_README_PATH,
      content: readme.endsWith('\n') ? readme : `${readme}\n`,
    });
  return files;
}
