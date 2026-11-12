import {
  type DomainModelDocument,
  type DomainModelManifest,
  type EntityAST,
  type RelationshipAST,
  type RuleAST,
  strictValidateDomainModel,
} from '@evidence-poc/evidence-schema';

export const MODEL_MANIFEST_PATH = 'model.json';

/** Trees that hold model sources and are therefore rewritten by the adapter. */
export const MODEL_SOURCE_TREES = [
  'entities',
  'relationships',
  'rules',
] as const;

/** Sibling trees owned by other skills; the adapter never rewrites them. */
export const MODEL_NON_SOURCE_TREES = [
  'discovery',
  'generated',
  'validation',
] as const;

export interface ModelSourceFile {
  /** POSIX-style path relative to the model root. */
  path: string;
  content: string;
}

export interface ModelSourceIssue {
  path: string;
  message: string;
  code?: string;
}

/**
 * Code of the finding that reports a source tree holding no entity yet.
 *
 * A reader that tolerates a blank start (a freshly created project) filters on
 * this code instead of matching the message, so every other finding stays
 * fatal.
 */
export const EMPTY_MODEL_ISSUE_CODE = 'model.empty';

export interface ModelSourceParseResult {
  document: DomainModelDocument;
  issues: ModelSourceIssue[];
}

export interface SerializeOptions {
  /** Sort object keys so the same document always produces the same bytes. */
  sortKeys?: boolean;
}

export interface ParseOptions {
  /** Run static FM checks after parsing and append their findings. */
  validate?: boolean;
}

const normalizePath = (path: string): string =>
  path.replaceAll('\\', '/').replace(/^\.\//, '');

const isManagedJsonPath = (path: string): boolean => {
  const parts = path.split('/');

  if (parts.length < 2 || !path.endsWith('.json')) {
    return false;
  }

  const tree = parts[0] as (typeof MODEL_SOURCE_TREES)[number];

  return (
    (MODEL_SOURCE_TREES as readonly string[]).includes(tree) &&
    !parts.some((part) => part.startsWith('.') || part === '__pycache__')
  );
};

const isIgnoredPath = (path: string): boolean => {
  const parts = path.split('/');

  return parts.some(
    (part) =>
      part.startsWith('.') ||
      part === '__pycache__' ||
      (MODEL_NON_SOURCE_TREES as readonly string[]).includes(part),
  );
};

const fileNameSegment = (value: string): string =>
  value.replaceAll('_', '-').replaceAll(/[^a-z0-9-]/g, '-');

const slugOf = (id: string): string => {
  const parts = id.split('.');
  const tail = parts.length > 1 ? parts.slice(1).join('-') : parts[0];

  return fileNameSegment(tail);
};

type ModelItem = EntityAST | RelationshipAST | RuleAST;

const relativePathFor = (item: ModelItem): string => {
  const slug = slugOf(item.id);

  if (item.type === 'entity') {
    return `${MODEL_SOURCE_TREES[0]}/${fileNameSegment(item.category)}-${fileNameSegment(item.kind)}--${slug}.json`;
  }

  if (item.type === 'relationship') {
    return `${MODEL_SOURCE_TREES[1]}/relation--${slug}.json`;
  }

  return `${MODEL_SOURCE_TREES[2]}/rule--${slug}.json`;
};

interface NamedItem {
  id: string;
  path: string;
}

/** Deterministic, collision-free file names for a set of model sources. */
export const modelSourcePaths = (
  items: readonly ModelItem[],
): Map<string, string> => {
  const desired: NamedItem[] = items
    .map((item) => ({ id: item.id, path: relativePathFor(item) }))
    .sort((left, right) =>
      left.path === right.path
        ? left.id.localeCompare(right.id)
        : left.path.localeCompare(right.path),
    );
  const used = new Map<string, number>();
  const paths = new Map<string, string>();

  for (const entry of desired) {
    const seen = used.get(entry.path) ?? 0;

    used.set(entry.path, seen + 1);

    const path =
      seen === 0
        ? entry.path
        : entry.path.replace(/\.json$/, `-${seen + 1}.json`);

    paths.set(entry.id, path);
  }

  return paths;
};

const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortKeysDeep(entry)]),
  );
};

/** Pretty JSON with a trailing newline, matching the on-disk FM convention. */
export const stringifyModelJson = (
  value: unknown,
  options: SerializeOptions = {},
): string =>
  `${
    JSON.stringify(
      options.sortKeys === true ? sortKeysDeep(value) : value,
      null,
      2,
    ) ?? 'null'
  }\n`;

/**
 * Projects a document onto the `.evidence/fm/` file layout.
 *
 * Files are ordered manifest first, then entities, relationships and rules so
 * callers can write them in a stable order.
 */
export function serializeDomainModel(
  document: DomainModelDocument,
  options: SerializeOptions = {},
): ModelSourceFile[] {
  const paths = modelSourcePaths([
    ...document.entities,
    ...document.relationships,
    ...document.rules,
  ]);
  const files: ModelSourceFile[] = [
    {
      path: MODEL_MANIFEST_PATH,
      content: stringifyModelJson(document.manifest, options),
    },
  ];

  for (const items of [
    document.entities,
    document.relationships,
    document.rules,
  ]) {
    const treeFiles = items
      .map((item) => ({
        path: paths.get(item.id) ?? relativePathFor(item),
        content: stringifyModelJson(item, options),
      }))
      .sort((left, right) => left.path.localeCompare(right.path));

    files.push(...treeFiles);
  }

  return files;
}

const emptyDocument = (): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'untitled',
    name: 'Untitled model',
    version: '0.1.0',
    ruleLanguage: 'CEL',
    entryContextRefs: [],
  },
  entities: [],
  relationships: [],
  rules: [],
});

/**
 * Parses a set of source files into a document.
 *
 * File-level problems (bad JSON, unknown document type, duplicate ids, missing
 * manifest) are reported as issues; `validate: true` additionally runs the
 * static FM checks. Parsing never throws on malformed input.
 */
export function parseModelSourceFiles(
  files: readonly ModelSourceFile[],
  options: ParseOptions = {},
): ModelSourceParseResult {
  const issues: ModelSourceIssue[] = [];
  const document = emptyDocument();
  let manifest: DomainModelManifest | undefined;
  const seenIds = new Map<string, string>();

  for (const file of files) {
    const path = normalizePath(file.path);

    if (path === MODEL_MANIFEST_PATH) {
      const parsed = parseJson(path, file.content, issues);

      if (parsed !== undefined) {
        manifest = parsed as unknown as DomainModelManifest;
      }

      continue;
    }

    if (isIgnoredPath(path) || !isManagedJsonPath(path)) {
      continue;
    }

    const parsed = parseJson(path, file.content, issues);

    if (parsed === undefined) {
      continue;
    }

    const id = parsed['id'];

    if (typeof id === 'string') {
      const previous = seenIds.get(id);

      if (previous !== undefined) {
        issues.push({
          path,
          message: `duplicate id '${id}' also defined in ${previous}.`,
        });
        continue;
      }

      seenIds.set(id, path);
    }

    switch (parsed['type']) {
      case 'entity':
        document.entities.push(parsed as unknown as EntityAST);
        break;
      case 'relationship':
        document.relationships.push(parsed as unknown as RelationshipAST);
        break;
      case 'rule':
        document.rules.push(parsed as unknown as RuleAST);
        break;
      default:
        issues.push({
          path,
          message: `unsupported document type ${JSON.stringify(parsed['type'])}.`,
        });
    }
  }

  if (manifest === undefined) {
    issues.push({
      path: MODEL_MANIFEST_PATH,
      message: 'model.json is required at the model root.',
    });
  } else {
    document.manifest = manifest;
  }

  if (document.entities.length === 0) {
    issues.push({
      path: 'entities',
      message: 'model must contain at least one entity.',
      code: EMPTY_MODEL_ISSUE_CODE,
    });
  }

  if (options.validate === true) {
    for (const issue of strictValidateDomainModel(document).issues) {
      issues.push({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      });
    }
  }

  return { document, issues };
}

const parseJson = (
  path: string,
  content: string,
  issues: ModelSourceIssue[],
): Record<string, unknown> | undefined => {
  try {
    const parsed: unknown = JSON.parse(content);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      issues.push({ path, message: 'source file must contain a JSON object.' });

      return undefined;
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    issues.push({
      path,
      message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    });

    return undefined;
  }
};
