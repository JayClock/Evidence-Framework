import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import {
  diffDomainModels,
  type ModelDiff,
} from '@evidence-poc/evidence-model-core';
import { canonicalJson } from '../canonicalJson.js';
import { buildProjection } from '../projector.js';
import { loadFmFromDocument } from '../adapter/fmAdapter.js';
import type { DesignDocument } from '../loader/apiLoader.js';
import type { EvidenceApiSnapshot } from '../types.js';
import type {
  DeliveryField,
  DeliveryFieldReason,
  DeliveryRoute,
  DeliveryRouteMethod,
} from '../delivery/routes.js';
import type { HypermediaLink } from '../http/hateoasWeaver.js';

export type ApiChangeType = 'added' | 'removed' | 'modified' | 'unchanged';
export type BreakingChangeKind =
  | 'ROUTE_REMOVED'
  | 'PATH_CHANGED'
  | 'METHOD_CHANGED'
  | 'REQUIRED_FIELD_ADDED'
  | 'INPUT_FIELD_REMOVED'
  | 'FIELD_REMOVED_FROM_RESPONSE'
  | 'FIELD_TYPE_CHANGED'
  | 'RESPONSE_FIELD_OPTIONAL'
  | 'CALLER_ROLE_RESTRICTED'
  | 'STATUS_CODE_CHANGED'
  | 'OPERATION_ID_CHANGED'
  | 'NAVIGATION_LINK_REMOVED'
  | 'RULE_CHANGED';
export interface ApiBreakingChange {
  kind: BreakingChangeKind;
  path: string;
  method: DeliveryRouteMethod;
  description: string;
  remediationHint: string;
}
export interface FieldDiff {
  name: string;
  label: string;
  changeType: ApiChangeType;
  beforeReason?: DeliveryFieldReason;
  afterReason?: DeliveryFieldReason;
  before?: DeliveryField;
  after?: DeliveryField;
  shifted?: 'to_derived' | 'to_caller';
  requiredChanged?: boolean;
}
export interface RouteDiff {
  id: string;
  operationId: string;
  path: string;
  method: DeliveryRouteMethod;
  changeType: ApiChangeType;
  serviceId: string;
  entityRef: string;
  previousPath?: string;
  before?: DeliveryRoute;
  after?: DeliveryRoute;
  fieldDiffs: readonly FieldDiff[];
  breaking: boolean;
  breakingChanges: readonly ApiBreakingChange[];
}
export interface HypermediaLinkDiff {
  sourceRouteId: string;
  rel: string;
  targetPath: string;
  changeType: ApiChangeType;
  before?: HypermediaLink;
  after?: HypermediaLink;
}
export interface ApiModelDiffResult {
  baseModelId: string;
  targetModelId: string;
  baseModelDigest: string;
  targetModelDigest: string;
  summary: {
    routesAdded: number;
    routesRemoved: number;
    routesModified: number;
    breakingChangeCount: number;
    hasBreakingChanges: boolean;
  };
  routes: readonly RouteDiff[];
  hypermediaLinks: readonly HypermediaLinkDiff[];
  breakingChanges: readonly ApiBreakingChange[];
  diagnostics: {
    base: EvidenceApiSnapshot['diagnostics'];
    target: EvidenceApiSnapshot['diagnostics'];
  };
  modelChanges?: ModelDiff;
}

const equal = (a: unknown, b: unknown): boolean =>
  canonicalJson(a ?? null) === canonicalJson(b ?? null);
const byName = (a: DeliveryField, b: DeliveryField) =>
  a.name.localeCompare(b.name);
const normalized = (route: DeliveryRoute) => ({
  ...route,
  fields: [...route.fields].sort(byName),
  derived: [...route.derived].sort(byName),
  stamped: [...route.stamped].sort(byName),
  outputFields: [...route.outputFields].sort(byName),
  allowedPartyRoleRefs: [...route.allowedPartyRoleRefs].sort(),
  responses: [...route.responses].sort((a, b) => a.status - b.status),
  rules: [...route.rules].sort((a, b) => a.id.localeCompare(b.id)),
});
const fieldsDiff = (
  before?: DeliveryRoute,
  after?: DeliveryRoute,
): FieldDiff[] => {
  const old = new Map(before?.outputFields.map((field) => [field.name, field]));
  const next = new Map(after?.outputFields.map((field) => [field.name, field]));
  return [...new Set([...old.keys(), ...next.keys()])]
    .sort()
    .flatMap((name) => {
      const a = old.get(name),
        b = next.get(name);
      if (equal(a, b)) return [];
      return [
        {
          name,
          label: b?.label ?? a!.label,
          changeType:
            a === undefined
              ? 'added'
              : b === undefined
                ? 'removed'
                : 'modified',
          ...(a === undefined ? {} : { before: a, beforeReason: a.reason }),
          ...(b === undefined ? {} : { after: b, afterReason: b.reason }),
          ...(a?.reason !== b?.reason && a !== undefined && b !== undefined
            ? b.reason === 'derived'
              ? { shifted: 'to_derived' as const }
              : b.reason === 'caller'
                ? { shifted: 'to_caller' as const }
                : {}
            : {}),
          ...(a !== undefined && b !== undefined && a.required !== b.required
            ? { requiredChanged: true }
            : {}),
        } as FieldDiff,
      ];
    });
};
const breakingFor = (
  a: DeliveryRoute,
  b?: DeliveryRoute,
): ApiBreakingChange[] => {
  const findings: ApiBreakingChange[] = [];
  const add = (kind: BreakingChangeKind, description: string) =>
    findings.push({
      kind,
      path: a.path,
      method: a.method,
      description,
      remediationHint: '确认调用方迁移方案后再发布；需要时保留旧契约适配层。',
    });
  if (b === undefined) {
    add('ROUTE_REMOVED', '现有端点被移除');
    return findings;
  }
  if (a.path !== b.path || a.itemPath !== b.itemPath)
    add('PATH_CHANGED', '资源或凭证地址发生变化');
  if (a.method !== b.method) add('METHOD_CHANGED', 'HTTP 方法发生变化');
  if (a.operationId !== b.operationId)
    add('OPERATION_ID_CHANGED', '客户端操作标识发生变化');
  if (
    a.allowedPartyRoleRefs.some(
      (role) => !b.allowedPartyRoleRefs.includes(role),
    )
  )
    add('CALLER_ROLE_RESTRICTED', '可调用角色范围收窄');
  const statuses = (route: DeliveryRoute) =>
    route.responses
      .filter((response) => response.status >= 200 && response.status < 300)
      .map((response) => response.status)
      .sort();
  if (!equal(statuses(a), statuses(b)))
    add('STATUS_CODE_CHANGED', '成功状态码发生变化');
  for (const rule of a.rules) {
    const next = b.rules.find((candidate) => candidate.id === rule.id);
    if (!equal(rule, next))
      add('RULE_CHANGED', `业务规则变化，需要复核调用方预期: ${rule.id}`);
  }
  for (const rule of b.rules)
    if (
      !a.rules.some((candidate) => candidate.id === rule.id) &&
      rule.kind !== 'derivation'
    )
      add('RULE_CHANGED', `新增业务约束: ${rule.id}`);
  const inputs = new Map(a.fields.map((field) => [field.name, field]));
  const nextInputs = new Map(b.fields.map((field) => [field.name, field]));
  if (a.method === 'POST' || b.method === 'POST') {
    for (const field of b.fields)
      if (field.required && inputs.get(field.name)?.required !== true)
        add('REQUIRED_FIELD_ADDED', `请求新增必填要求: ${field.name}`);
    for (const field of a.fields)
      if (!nextInputs.has(field.name))
        add('INPUT_FIELD_REMOVED', `请求不再接受字段: ${field.name}`);
  }
  const outputs = new Map(b.outputFields.map((field) => [field.name, field]));
  for (const field of a.outputFields) {
    const next = outputs.get(field.name);
    if (next === undefined)
      add('FIELD_REMOVED_FROM_RESPONSE', `响应移除字段: ${field.name}`);
    else {
      if (field.valueType !== next.valueType)
        add('FIELD_TYPE_CHANGED', `字段类型发生变化: ${field.name}`);
      if (field.required && !next.required)
        add('RESPONSE_FIELD_OPTIONAL', `响应字段不再保证存在: ${field.name}`);
    }
  }
  return findings;
};

/** Compare final snapshots, including overlays, rather than translating model edits into guessed routes. */
export const diffApiSnapshots = (
  before: EvidenceApiSnapshot,
  after: EvidenceApiSnapshot,
): ApiModelDiffResult => {
  if (before.modelId !== after.modelId)
    throw new Error('API_MODEL_MISMATCH: 不能比较不同模型');
  const old = new Map(before.routes.map((route) => [route.id, route]));
  const next = new Map(after.routes.map((route) => [route.id, route]));
  const linkKey = (link: HypermediaLink) =>
    `${link.sourceRouteId}\0${link.rel}\0${link.targetRouteId}`;
  const oldLinks = new Map(
    before.hypermedia.map((link) => [linkKey(link), link]),
  );
  const nextLinks = new Map(
    after.hypermedia.map((link) => [linkKey(link), link]),
  );
  const hypermediaLinks: HypermediaLinkDiff[] = [
    ...new Set([...oldLinks.keys(), ...nextLinks.keys()]),
  ]
    .sort()
    .flatMap((id) => {
      const a = oldLinks.get(id),
        b = nextLinks.get(id);
      if (equal(a, b)) return [];
      const link = b ?? a!;
      return [
        {
          sourceRouteId: link.sourceRouteId,
          rel: link.rel,
          targetPath: link.href,
          changeType:
            a === undefined
              ? 'added'
              : b === undefined
                ? 'removed'
                : 'modified',
          ...(a === undefined ? {} : { before: a }),
          ...(b === undefined ? {} : { after: b }),
        },
      ];
    });
  const routes: RouteDiff[] = [...new Set([...old.keys(), ...next.keys()])]
    .sort()
    .flatMap((id) => {
      const a = old.get(id),
        b = next.get(id),
        route = b ?? a!;
      const links = hypermediaLinks.filter((link) => link.sourceRouteId === id);
      if (
        a !== undefined &&
        b !== undefined &&
        equal(normalized(a), normalized(b)) &&
        links.length === 0
      )
        return [];
      const breakingChanges = a === undefined ? [] : breakingFor(a, b);
      for (const link of links)
        if (
          a !== undefined &&
          b !== undefined &&
          link.rel !== 'self' &&
          link.changeType === 'removed'
        )
          breakingChanges.push({
            kind: 'NAVIGATION_LINK_REMOVED',
            path: a.path,
            method: a.method,
            description: `导航关系已移除: ${link.rel}`,
            remediationHint: '复核受影响的客户端旅程。',
          });
      return [
        {
          id,
          operationId: route.operationId,
          path: route.path,
          method: route.method,
          changeType:
            a === undefined
              ? 'added'
              : b === undefined
                ? 'removed'
                : 'modified',
          serviceId: route.serviceId,
          entityRef: route.entityRef,
          ...(a?.path !== b?.path && a !== undefined
            ? { previousPath: a.path }
            : {}),
          ...(a === undefined ? {} : { before: a }),
          ...(b === undefined ? {} : { after: b }),
          fieldDiffs: fieldsDiff(a, b),
          breaking: breakingChanges.length > 0,
          breakingChanges,
        },
      ];
    });
  const breakingChanges = routes.flatMap((route) => route.breakingChanges);
  return {
    baseModelId: before.modelId,
    targetModelId: after.modelId,
    baseModelDigest: before.digests.model,
    targetModelDigest: after.digests.model,
    summary: {
      routesAdded: routes.filter((route) => route.changeType === 'added')
        .length,
      routesRemoved: routes.filter((route) => route.changeType === 'removed')
        .length,
      routesModified: routes.filter((route) => route.changeType === 'modified')
        .length,
      breakingChangeCount: breakingChanges.length,
      hasBreakingChanges: breakingChanges.length > 0,
    },
    routes,
    hypermediaLinks,
    breakingChanges,
    diagnostics: { base: before.diagnostics, target: after.diagnostics },
  };
};

export const diffModelToApi = (
  before: DomainModelDocument,
  after: DomainModelDocument,
  options: { baseDesign?: DesignDocument; targetDesign?: DesignDocument } = {},
): ApiModelDiffResult => {
  const project = (document: DomainModelDocument, design?: DesignDocument) =>
    buildProjection({
      index: loadFmFromDocument(document).index!,
      ...(design === undefined ? {} : { design }),
    }).projection;
  return {
    ...diffApiSnapshots(
      project(before, options.baseDesign),
      project(after, options.targetDesign),
    ),
    modelChanges: diffDomainModels(before, after),
  };
};
