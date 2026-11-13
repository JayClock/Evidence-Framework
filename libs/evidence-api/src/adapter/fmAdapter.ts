import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DomainModelDocument,
  EntityAST,
  RelationshipAST,
  RuleAST,
} from '@evidence-poc/evidence-schema';
import {
  compiledDocument,
  isModelBundlePath,
  loadValidationSuite,
  modelDigestOf,
  parseModelBundleText,
  readModelRoot,
  readModelRootBytes,
  type CompiledModelDocument,
  type DomainModelBundle,
  type EvidenceInstance,
  type Scenario,
  type ValidationSuite,
} from '@evidence-poc/evidence-model-core';

import { canonicalJson } from '../canonicalJson.js';
import {
  errorDiagnostic,
  gapDiagnostic,
  normalizeDiagnostics,
  type Diagnostic,
} from '../diagnostics.js';

/** SHA-256 over bytes, without the model digest's prefix. */
export const digestBytes = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

export type FmSnapshot = Record<string, string>;

/** Current model inputs, independent of any previously saved check report. */
export interface FmIndex {
  document: DomainModelDocument;
  compiled: CompiledModelDocument;
  /** Recorded evidence only. Null means no report was supplied, not a passing check. */
  check: unknown;
  modelDigest: string;
  diagnostics: readonly Diagnostic[];
  entities: ReadonlyMap<string, EntityAST>;
  relationships: ReadonlyMap<string, RelationshipAST>;
  rules: ReadonlyMap<string, RuleAST>;
  scenarios: ReadonlyMap<string, Scenario>;
  instances: ReadonlyMap<string, EvidenceInstance>;
  membersByContext: ReadonlyMap<string, readonly string[]>;
  files: FmSnapshot;
}

export interface LoadFmResult {
  index: FmIndex | null;
  diagnostics: readonly Diagnostic[];
}

export interface LoadFmDocumentOptions {
  checkReport?: unknown;
  diagnostics?: readonly Diagnostic[];
  files?: FmSnapshot;
  modelDigest?: string;
  suite?: ValidationSuite;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const snapshotOf = (
  files: readonly { path: string; bytes: Buffer }[],
): FmSnapshot =>
  Object.fromEntries(
    [...files]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((file) => [file.path, digestBytes(file.bytes)]),
  );

/** A missing report is allowed; an invalid supplied report remains visible. */
export const checkReportProblem = (report: unknown): string | null => {
  if (report === undefined || report === null) return null;
  if (!isRecord(report)) return 'FM 检查结果必须是 JSON 对象';

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

  return valid ? null : 'FM 检查未通过或未证明范围完整性';
};

/** Builds an index synchronously without filesystem access or invented check results. */
export const loadFmFromDocument = (
  document: DomainModelDocument,
  options: LoadFmDocumentOptions = {},
): LoadFmResult => {
  // Pin the input so later caller edits cannot silently change an existing index.
  document = structuredClone(document);
  const compiled = compiledDocument(document);
  const suite =
    options.suite ?? loadValidationSuite(document as DomainModelBundle);
  const modelDigest =
    options.modelDigest ??
    `sha256:${digestBytes(
      canonicalJson({
        ...compiled,
        validation: {
          instances: [...suite.instances].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
          scenarios: [...suite.scenarios].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
          errors: [...suite.errors].sort(),
        },
      }),
    )}`;
  const diagnostics: Diagnostic[] = [...(options.diagnostics ?? [])];
  const problem = checkReportProblem(options.checkReport);
  if (problem !== null) {
    diagnostics.push(
      gapDiagnostic('FM_CHECK_INVALID', 'fm.check.invalid', 'design', problem),
    );
  }
  if (
    isRecord(options.checkReport) &&
    typeof options.checkReport['modelDigest'] === 'string' &&
    options.checkReport['modelDigest'] !== modelDigest
  ) {
    diagnostics.push(
      gapDiagnostic(
        'FM_CHECK_STALE',
        'fm.check.stale',
        'design',
        'FM 已变化，投影使用当前模型；旧检查结果不证明当前模型已通过校验',
      ),
    );
  }
  for (const message of suite.errors) {
    diagnostics.push(errorDiagnostic('FM_VALIDATION_INPUT_INVALID', message));
  }

  const membersByContext = new Map<string, string[]>();
  for (const entity of compiled.entities) {
    if ('contextRef' in entity && typeof entity.contextRef === 'string') {
      const members = membersByContext.get(entity.contextRef) ?? [];
      members.push(entity.id);
      membersByContext.set(entity.contextRef, members);
    }
  }
  const sorted = normalizeDiagnostics(diagnostics);
  return {
    index: {
      document,
      compiled,
      check: options.checkReport ?? null,
      modelDigest,
      diagnostics: sorted,
      entities: new Map(compiled.entities.map((entity) => [entity.id, entity])),
      relationships: new Map(
        compiled.relationships.map((relationship) => [
          relationship.id,
          relationship,
        ]),
      ),
      rules: new Map(compiled.rules.map((rule) => [rule.id, rule])),
      scenarios: new Map(
        suite.scenarios.map((scenario) => [scenario.id, scenario]),
      ),
      instances: new Map(
        suite.instances.map((instance) => [instance.id, instance]),
      ),
      membersByContext,
      files: options.files ?? {},
    },
    diagnostics: sorted,
  };
};

/** Party Roles a Participant Party actually plays. This is not an authorization grant. */
export const partyRolesPlayedByParticipants = (index: FmIndex): Set<string> => {
  const played = new Set<string>();
  for (const relationship of index.relationships.values()) {
    if (relationship.kind !== 'plays_role') continue;
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

/** Reads a directory or portable bundle. Concurrent input changes still invalidate the read. */
export const loadFm = async (
  fmRoot: string,
  checkReport?: unknown,
): Promise<LoadFmResult> => {
  const root = path.resolve(fmRoot);
  try {
    const readBytes = () =>
      isModelBundlePath(root)
        ? readFile(root).then((bytes) => [{ path: path.basename(root), bytes }])
        : readModelRootBytes(root);
    const beforeFiles = await readBytes();
    const before = snapshotOf(beforeFiles);
    const parsed = isModelBundlePath(root)
      ? (() => {
          const result = parseModelBundleText(
            beforeFiles[0]!.bytes.toString('utf8'),
          );
          return { bundle: result.document, issues: result.issues };
        })()
      : await readModelRoot(root);
    if (
      JSON.stringify(before) !== JSON.stringify(snapshotOf(await readBytes()))
    ) {
      return {
        index: null,
        diagnostics: [
          errorDiagnostic('SOURCE_CHANGED', 'FM 输入在读取期间发生变化'),
        ],
      };
    }
    if (parsed.issues.length > 0) {
      return {
        index: null,
        diagnostics: parsed.issues.map((issue) =>
          errorDiagnostic('FM_INVALID', issue.message, undefined, issue.path),
        ),
      };
    }
    return loadFmFromDocument(parsed.bundle, {
      checkReport,
      files: before,
      modelDigest: modelDigestOf(
        beforeFiles.map((file) => ({ path: file.path, content: file.bytes })),
      ),
    });
  } catch (error) {
    return {
      index: null,
      diagnostics: [
        errorDiagnostic(
          'FM_INVALID',
          `无法读取当前 FM: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          root,
        ),
      ],
    };
  }
};
