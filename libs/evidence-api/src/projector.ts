import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { FmIndex } from './adapter/fmAdapter.js';
import { digestBytes } from './adapter/fmAdapter.js';
import { buildHttp, type HttpContract } from './http/contracts.js';
import type { DesignDocument } from './loader/apiLoader.js';
import { normalizeDiagnostics, type Diagnostic } from './diagnostics.js';
import { projectCapabilities } from './projection/capabilities.js';
import { projectCoverage } from './projection/coverage.js';
import { projectModelCoverage } from './projection/modelCoverage.js';
import { buildResources } from './projection/resources.js';
import { compareText, sortedText } from './order.js';
import type { JsonObject } from './types.js';

/**
 * Everything the design projects into, in one document.
 *
 * The order matters: resources first, then what may be called on them, then the
 * coverage that ties both back to the model. Each stage reports its own findings,
 * and the projection ends with one sorted list so two runs diff cleanly.
 */

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordsOf = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const idOf = (item: JsonObject): string => String(item['id'] ?? '');

/** One projection, with the report the CLI prints about it. */
export interface Projection {
  schemaVersion: '5.0';
  apiId: unknown;
  inputDigests: {
    fm: Record<string, string>;
    api: string;
    sources: Record<string, string>;
  };
  fmCheckSummary: unknown;
  resources: readonly unknown[];
  modelCoverage: readonly unknown[];
  contextRefs: string[];
  capabilities: readonly unknown[];
  operations: readonly unknown[];
  coverage: readonly unknown[];
  http: HttpContract | null;
  diagnostics: Record<string, unknown>[];
}

export interface BuildProjectionResult {
  projection: Projection;
  diagnostics: readonly Diagnostic[];
}

/**
 * Verifies that every basis reference a design cites actually exists.
 *
 * The design's authority comes from what it points at — an FM object, a quoted
 * business source, a recorded decision. A dangling reference means the design
 * claims support it does not have.
 */
const validateReferences = (
  design: DesignDocument,
  index: FmIndex,
  projectRoot: string,
  readFile: (target: string) => string,
): { sourceDigests: Record<string, string>; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const sourceIds = new Set(recordsOf(design['sources']).map(idOf));
  const decisionIds = new Set(recordsOf(design['decisions']).map(idOf));
  const sourceDigests: Record<string, string> = {};
  const root = path.resolve(projectRoot);

  const exists = (reference: string): boolean => {
    const separator = reference.indexOf('#');

    if (separator < 0) {
      return (
        index.entities.has(reference) ||
        index.relationships.has(reference) ||
        index.rules.has(reference)
      );
    }

    const entityRef = reference.slice(0, separator);
    const attributeName = reference.slice(separator + 1);
    const entity = index.entities.get(entityRef);

    return (entity?.attributes ?? []).some(
      (attribute) => attribute.name === attributeName,
    );
  };

  for (const source of recordsOf(design['sources'])) {
    const relativePath = String(source['path'] ?? '');
    const sourcePath = path.resolve(root, relativePath);

    if (!sourcePath.startsWith(`${root}${path.sep}`) && sourcePath !== root) {
      diagnostics.push(
        errorOf(
          'SOURCE_PATH_OUTSIDE_PROJECT',
          '业务来源必须位于项目根内',
          idOf(source),
          sourcePath,
        ),
      );
      continue;
    }

    let content: string;

    try {
      content = readFile(sourcePath);
    } catch {
      diagnostics.push(
        errorOf(
          'SOURCE_NOT_FOUND',
          '业务来源文件不存在',
          idOf(source),
          relativePath,
        ),
      );
      continue;
    }

    const quote = String(source['quote'] ?? '');

    if (!content.includes(quote)) {
      diagnostics.push(
        errorOf(
          'SOURCE_QUOTE_MISMATCH',
          '逐字摘录与来源内容不匹配',
          idOf(source),
          String(source['locator'] ?? ''),
        ),
      );
    }

    sourceDigests[relativePath] = digestBytes(Buffer.from(content, 'utf8'));
  }

  const basedItems: JsonObject[] = [];

  for (const section of [
    'resources',
    'bindings',
    'scenarios',
    'capabilities',
    'nonApiActivities',
  ] as const) {
    basedItems.push(...recordsOf(design[section]));
  }

  const http = isRecord(design['http']) ? design['http'] : {};
  basedItems.push(...recordsOf(http['entryPoints']));

  for (const journey of recordsOf(design['journeys'])) {
    basedItems.push(...recordsOf(journey['steps']));
  }

  for (const item of basedItems) {
    const basis = isRecord(item['basis']) ? item['basis'] : {};

    for (const reference of asStrings(basis['fmRefs'])) {
      if (!exists(reference)) {
        diagnostics.push(
          errorOf('FM_REF_NOT_FOUND', `FM 依据引用不存在: ${reference}`, idOf(item)),
        );
      }
    }

    for (const reference of asStrings(basis['sourceRefs'])) {
      if (!sourceIds.has(reference)) {
        diagnostics.push(
          errorOf('SOURCE_REF_NOT_FOUND', `来源引用不存在: ${reference}`, idOf(item)),
        );
      }
    }

    for (const reference of asStrings(basis['decisionRefs'])) {
      if (!decisionIds.has(reference)) {
        diagnostics.push(
          errorOf('DESIGN_REF_NOT_FOUND', `决定引用不存在: ${reference}`, idOf(item)),
        );
      }
    }
  }

  return {
    sourceDigests: Object.fromEntries(
      Object.entries(sourceDigests).sort(([left], [right]) => compareText(left, right)),
    ),
    diagnostics,
  };
};

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const errorOf = (
  code: string,
  message: string,
  targetRef?: string,
  location?: string,
): Diagnostic => ({
  code,
  severity: 'error',
  message,
  ...(targetRef === undefined ? {} : { targetRef }),
  ...(location === undefined ? {} : { location }),
});

/** Why the bindings a design declares cannot hold. */
const validateBindings = (
  design: DesignDocument,
  index: FmIndex,
  resources: readonly JsonObject[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const resourceIds = new Set(resources.map(idOf));
  const played = new Set<string>();

  for (const relationship of index.relationships.values()) {
    if (relationship.kind !== 'plays_role') {
      continue;
    }

    const source = index.entities.get(relationship.sourceRef);
    const target = index.entities.get(relationship.targetRef);

    if (
      source?.category === 'participant' &&
      source.kind === 'party' &&
      target?.category === 'role' &&
      target.kind === 'party'
    ) {
      played.add(target.id);
    }
  }

  for (const binding of recordsOf(design['bindings'])) {
    const id = idOf(binding);

    if (binding['kind'] === 'caller_role') {
      const roleRef = String(binding['roleRef'] ?? '');
      const role = index.entities.get(roleRef);

      if (role === undefined || role.category !== 'role' || role.kind !== 'party') {
        diagnostics.push(
          errorOf('ACTOR_ROLE_INVALID', 'caller_role 必须引用 FM Party Role', id),
        );
      } else if (!played.has(roleRef)) {
        diagnostics.push({
          code: 'ACTOR_PARTY_PLAYER_MISSING',
          severity: 'gap',
          message:
            'caller_role 引用的 Party Role 没有 participant.party 的 plays_role 扮演，不生成相关接口',
          targetRef: id,
          relatedRefs: [roleRef],
          gapKey: `${id}.party-player`,
          category: 'business',
        });
      }

      if (!resourceIds.has(String(binding['scopeResourceRef'] ?? ''))) {
        diagnostics.push(
          errorOf('DESIGN_REF_NOT_FOUND', '调用者范围资源不存在', id),
        );
      }

      continue;
    }

    if (
      !resourceIds.has(String(binding['parentResourceRef'] ?? '')) ||
      !resourceIds.has(String(binding['childResourceRef'] ?? ''))
    ) {
      diagnostics.push(
        errorOf('DESIGN_REF_NOT_FOUND', 'parent_child 引用的资源不存在', id),
      );
    }
  }

  return diagnostics;
};

export interface BuildProjectionInput {
  design: DesignDocument;
  index: FmIndex;
  /** Absolute project root the design's sources are relative to. */
  projectRoot: string;
  /** Bytes of the design file, which the projection records as its input. */
  apiContent: string | Buffer;
  /** Reads a business source file; injected so a test needs no filesystem. */
  readFile?: (target: string) => string;
}

/**
 * Builds the projection document.
 *
 * Nothing is projected when a reference dangles: an interface built on a basis
 * the design does not actually have would be the most convincing kind of wrong.
 */
export const buildProjection = ({
  design,
  index,
  projectRoot,
  apiContent,
  readFile = (target) => readFileSync(target, 'utf8'),
}: BuildProjectionInput): BuildProjectionResult => {
  const references = validateReferences(design, index, projectRoot, readFile);
  const resources = buildResources(design, index);
  const diagnostics: Diagnostic[] = [...references.diagnostics, ...resources.diagnostics];
  diagnostics.push(...validateBindings(design, index, resources.resources));

  const capabilities = projectCapabilities(design, index, resources.resources);
  diagnostics.push(...capabilities.diagnostics);

  const coverage = projectCoverage(design, index, capabilities.capabilities);
  diagnostics.push(...coverage.diagnostics);

  const modelCoverage = projectModelCoverage(
    design,
    index,
    capabilities.capabilities,
  );
  diagnostics.push(...modelCoverage.diagnostics);

  const sorted = normalizeDiagnostics(diagnostics);
  const projection: Projection = {
    schemaVersion: '5.0',
    apiId: design['id'],
    inputDigests: {
      fm: index.files,
      api: digestBytes(
        typeof apiContent === 'string' ? Buffer.from(apiContent, 'utf8') : apiContent,
      ),
      sources: references.sourceDigests,
    },
    fmCheckSummary: index.check,
    resources: resources.resources,
    modelCoverage: modelCoverage.modelCoverage,
    contextRefs: sortedText(
      [...index.entities.values()]
        .filter((entity) => entity.category === 'context')
        .map((entity) => entity.id),
    ),
    capabilities: capabilities.capabilities,
    operations: capabilities.operations,
    coverage: coverage.coverage,
    http: null,
    diagnostics: sorted.map((item) => ({
      ...item,
      targetRef: item.targetRef ?? null,
      location: item.location ?? null,
      relatedRefs: [...(item.relatedRefs ?? [])],
      ...(item.gapKey === undefined ? {} : { gapKey: item.gapKey }),
      ...(item.category === undefined ? {} : { category: item.category }),
    })),
  };

  const http = isRecord(design['http']) ? design['http'] : {};
  projection.http = buildHttp(
    http,
    {
      capabilities: capabilities.capabilities,
      resources: resources.resources,
      coverage: coverage.coverage,
      diagnostics: sorted,
    },
    index,
  );
  projection.diagnostics.push(...projection.http.diagnostics);

  return { projection, diagnostics: sorted };
};

/** True when the projection has nothing at all left to resolve. */
export const isComplete = (projection: Projection): boolean =>
  projection.diagnostics.length === 0 && projection.http?.complete === true;
