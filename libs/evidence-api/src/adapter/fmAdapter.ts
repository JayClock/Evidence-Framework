import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type {
  DomainModelDocument,
  EntityAST,
  RelationshipAST,
  RuleAST,
} from '@evidence-poc/evidence-schema';
import {
  compiledDocument,
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
  readyScope,
  scopeSuite,
  validationSuiteFromFiles,
  type CompiledModelDocument,
  type EvidenceInstance,
  type ReadyScopeReport,
  type Scenario,
} from '@evidence-poc/evidence-model-core';

import { errorDiagnostic, type Diagnostic } from '../diagnostics.js';

/**
 * Reading the FM a design was written against.
 *
 * Two promises make the projection trustworthy. The first is that the model is
 * the one the FM stage checked: the digest in the report is compared with the
 * bytes on disk, so a model edited after its check is refused instead of
 * projected. The second is that nothing moved while it was read: the snapshot is
 * taken again at the end, which is what `SOURCE_CHANGED` reports.
 */

/** `sha256:<hex>` over one file's bytes, the form the reports carry. */
export const digestBytes = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

/** `{ relative path: sha256 }` for every source file under a model root. */
export type FmSnapshot = Record<string, string>;

/**
 * The model a projection reads, indexed for lookup.
 *
 * Every collection is a `Map` keyed by id, so a reference either resolves or is
 * reported; the iteration order is the compiled (id-sorted) order, which keeps a
 * report's findings stable across runs.
 */
export interface FmIndex {
  compiled: CompiledModelDocument;
  check: ReadyScopeReport & { modelDigest: string; modelValidated?: boolean };
  entities: ReadonlyMap<string, EntityAST>;
  relationships: ReadonlyMap<string, RelationshipAST>;
  rules: ReadonlyMap<string, RuleAST>;
  scenarios: ReadonlyMap<string, Scenario>;
  instances: ReadonlyMap<string, EvidenceInstance>;
  /** Entity ids per Context, sorted, so a scope can be listed cheaply. */
  membersByContext: ReadonlyMap<string, readonly string[]>;
  /** Digest per source file, printed under `inputDigests.fm`. */
  files: FmSnapshot;
}

export interface LoadFmResult {
  index: FmIndex | null;
  diagnostics: readonly Diagnostic[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const snapshotOf = (files: readonly { path: string; bytes: Buffer }[]): FmSnapshot =>
  Object.fromEntries(
    [...files]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((file) => [file.path, digestBytes(file.bytes)]),
  );

const sameSnapshot = (left: FmSnapshot, right: FmSnapshot): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * Checks that a report proves a delivered scope before anything is projected.
 *
 * A report with a different contract version, a stale digest or an unexecuted
 * scenario is refused here rather than halfway through a projection.
 */
export const checkReportProblem = (
  report: unknown,
): string | null => {
  if (!isRecord(report)) {
    return '需要 FM 阶段实际通过且输入未变化的检查结果';
  }

  const valid =
    report['checkVersion'] === 5 &&
    report['consistent'] === true &&
    report['complete'] === true &&
    report['valid'] === true &&
    report['inputChanged'] === false &&
    report['modelValidated'] === true &&
    Array.isArray(report['errors']) &&
    report['errors'].length === 0 &&
    typeof report['modelDigest'] === 'string';

  return valid ? null : '需要 FM 阶段实际通过且输入未变化的检查结果';
};

/** Party Roles a Participant Party actually plays, which is who can call the API. */
export const partyRolesPlayedByParticipants = (
  index: FmIndex,
): Set<string> => {
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

  return played;
};

/**
 * Reads a checked model root.
 *
 * FM allows Party Roles with no player and Fulfillment Requests no one can
 * confirm; the design stage has to see both, so nothing here filters them out —
 * it either resolves a reference or reports that it cannot.
 */
export const loadFm = async (
  fmRoot: string,
  checkReport: unknown,
): Promise<LoadFmResult> => {
  const root = path.resolve(fmRoot);

  if (!existsSync(root) || !existsSync(path.join(root, 'model.json'))) {
    return {
      index: null,
      diagnostics: [
        errorDiagnostic('FM_INVALID', 'FM 目录缺少 model.json', undefined, root),
      ],
    };
  }

  const problem = checkReportProblem(checkReport);

  if (problem !== null) {
    return {
      index: null,
      diagnostics: [errorDiagnostic('FM_CHECK_INVALID', problem)],
    };
  }

  const check = checkReport as FmIndex['check'];
  const beforeFiles = await readModelRootBytes(root);
  const before = snapshotOf(beforeFiles);

  if (modelDigestOf(beforeFiles.map((file) => ({ path: file.path, content: file.bytes }))) !== check.modelDigest) {
    return {
      index: null,
      diagnostics: [
        errorDiagnostic('FM_CHECK_STALE', 'FM 已变化，返回 FM 阶段重新检查'),
      ],
    };
  }

  let selected: DomainModelDocument;

  try {
    selected = readyScope((await readModelRoot(root)).bundle, check);
  } catch (error) {
    return {
      index: null,
      diagnostics: [
        errorDiagnostic(
          'FM_INVALID',
          `无法读取当前 FM: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ],
    };
  }

  const compiled = compiledDocument(selected);
  const suite = scopeSuite(
    selected,
    validationSuiteFromFiles(
      beforeFiles
        .filter(
          (file) =>
            file.path.startsWith('validation/scenarios/') ||
            file.path.startsWith('validation/instances/'),
        )
        .map((file) => ({ path: file.path, content: file.bytes.toString('utf8') })),
    ),
  );
  const after = snapshotOf(await readModelRootBytes(root));

  if (!sameSnapshot(before, after)) {
    return {
      index: null,
      diagnostics: [
        errorDiagnostic('SOURCE_CHANGED', 'FM 输入在读取期间发生变化'),
      ],
    };
  }

  const membersByContext = new Map<string, string[]>();

  for (const entity of compiled.entities) {
    const contextRef =
      'contextRef' in entity && typeof entity.contextRef === 'string'
        ? entity.contextRef
        : undefined;

    if (contextRef === undefined) {
      continue;
    }

    const members = membersByContext.get(contextRef) ?? [];
    members.push(entity.id);
    membersByContext.set(contextRef, members);
  }

  for (const members of membersByContext.values()) {
    members.sort();
  }

  return {
    index: {
      compiled,
      check,
      entities: new Map(compiled.entities.map((entity) => [entity.id, entity] as const)),
      relationships: new Map(
        compiled.relationships.map((relationship) => [relationship.id, relationship] as const),
      ),
      rules: new Map(compiled.rules.map((rule) => [rule.id, rule] as const)),
      scenarios: new Map(suite.scenarios.map((scenario) => [scenario.id, scenario] as const)),
      instances: new Map(suite.instances.map((instance) => [instance.id, instance] as const)),
      membersByContext,
      files: before,
    },
    diagnostics: [],
  };
};
