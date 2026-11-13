import { buildDelivery } from '@evidence-poc/evidence-api';
import {
  buildFmCheckReport,
  buildKeyDataLedger,
  compiledDocument,
  loadValidationSuite,
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
} from '@evidence-poc/evidence-model-core';
import { buildSensorReport } from '@evidence-poc/evidence-modeling-orchestrator/browser';
import {
  isDomainModelDocumentShape,
  strictValidateDomainModel,
} from '@evidence-poc/evidence-schema';
import {
  collectWorkbench,
  deliveryViewOf,
  projectWorkbenchData,
  workbenchLayoutOf,
  type CompiledModel,
} from '@evidence-poc/evidence-visualization';
import type { PreviewReviewInput, PreviewReviewResult } from '../shared/review';
import {
  isBundleProject,
  modelSourceOf,
  projectDirectoryOf,
} from './modelSource';

/** Reads scenario inputs, but checks the supplied live model without saving it. */
export const previewReview = async (
  input: PreviewReviewInput,
): Promise<Omit<Extract<PreviewReviewResult, { success: true }>, 'html'>> => {
  if (
    !isDomainModelDocumentShape(input.document) ||
    !Number.isSafeInteger(input.revision)
  )
    throw new Error('审查预览输入无效');
  const source = modelSourceOf(input.rootPath);
  const fingerprint = async () =>
    modelDigestOf(
      (await readModelRootBytes(source)).map((item) => ({
        path: item.path,
        content: item.bytes,
      })),
    );
  const before = await fingerprint();
  const loaded = await readModelRoot(source);
  const suite = loadValidationSuite(loaded.files);
  const document = input.document;
  const contexts = new Map(
    document.entities
      .filter((entity) => entity.category === 'context')
      .map((entity) => [entity.id, entity]),
  );
  const scopes = document.manifest.entryContextRefs.filter(
    (id) => contexts.has(id) && !contexts.get(id)?.parentContextRef,
  );
  const check = buildFmCheckReport({
    model: document,
    suite,
    ...(scopes.length ? { scopeRefs: scopes } : {}),
  }).report;
  const validation = strictValidateDomainModel(document);
  const ledger = buildKeyDataLedger(document);
  const report = buildSensorReport({
    fmCheck: check,
    keyData: {
      keyDataCount: ledger.entries.length,
      needsDecision: ledger.decisionOwed.map((item) => ({
        path: `${item.entityRef}#${item.attribute}`,
        ...(item.contextRef ? { contextRef: item.contextRef } : {}),
        meaning: item.meaning,
      })),
    },
  });
  // Validation owns objectId. Do not infer location by parsing prose gaps.
  const issues = [
    ...report.issues,
    ...validation.issues.map((issue) => ({
      issueId: `validation:${issue.code}:${issue.path}`,
      severity: 'block' as const,
      source: 'check_fm' as const,
      code: issue.code,
      message: issue.message,
      ...(issue.objectId ? { targetNodeId: issue.objectId } : {}),
    })),
  ];
  let data = projectWorkbenchData({
    model: compiledDocument(document) as unknown as CompiledModel,
    layout: workbenchLayoutOf(document),
    checked: check.valid,
    scenarios: suite.scenarios as unknown as Record<string, unknown>[],
    instances: suite.instances as unknown as Record<string, unknown>[],
    simulation: {
      scenarioResults: check.scenarioResults as unknown as Record<
        string,
        unknown
      >[],
    },
    delivery: deliveryViewOf(buildDelivery(document)),
    check,
  });
  const saved =
    JSON.stringify(compiledDocument(document)) ===
    JSON.stringify(compiledDocument(loaded.bundle));
  let notice =
    '编辑快照预览（未保存）；场景来自磁盘，API 静态设计未检查。机器检查不等于业务批准。';
  if (saved) {
    notice = '已保存模型预览；机器检查不等于业务批准。';
    if (check.valid && !isBundleProject(input.rootPath)) {
      try {
        data = (
          await collectWorkbench({
            projectRoot: projectDirectoryOf(input.rootPath),
            ...(scopes.length ? { scopeRefs: scopes } : {}),
          })
        ).data;
      } catch (error) {
        notice += ` API / 正式审查不可用：${error instanceof Error ? error.message : String(error)}`;
      }
    } else notice += ' API 静态设计未检查。';
  }
  if ((await fingerprint()) !== before)
    throw new Error('预览期间磁盘输入变化，请重新预览');
  return { success: true, revision: input.revision, data, issues, notice };
};
