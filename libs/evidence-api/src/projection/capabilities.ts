import type { DesignDocument } from '../loader/apiLoader.js';
import type { FmIndex } from '../adapter/fmAdapter.js';
import { partyRolesPlayedByParticipants } from '../adapter/fmAdapter.js';
import {
  errorDiagnostic,
  gapDiagnostic,
  type Diagnostic,
} from '../diagnostics.js';
import { compareText, sortedText } from '../order.js';
import type { ProjectedResource } from './resources.js';

/**
 * Which caller may do what, on which resource, for whose benefit.
 *
 * A capability is only projected when three separate questions are answered: the
 * caller is a Party Role an actual Participant plays, the effect is one the HTTP
 * method can express, and a scenario proves the interaction happens. Anything
 * short of that becomes a finding, because a guessed interface is worse than a
 * missing one — it looks callable.
 */

type JsonObject = Record<string, unknown>;

/** Segments and parameters too generic to scope a Contract list by Party. */
const GENERIC_PARTY_SEGMENTS = new Set([
  'parties',
  'party',
  'participants',
  'participant',
]);

const GENERIC_PARTY_PARAMETERS = new Set(['partyId', 'participantId']);

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const recordsOf = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const idOf = (item: JsonObject): string => String(item['id']);

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/** One callable interface, with the address it resolves to. */
export interface ProjectedCapability extends JsonObject {
  id: string;
  actorRoleRef: string;
  resourceRef: string;
  view: string;
  method: string;
  uri: string;
  roleLabel: string;
}

/** One HTTP route, with every role variant that shares it. */
export interface ProjectedOperation extends JsonObject {
  id: string;
  resourceRef: string;
  view: string;
  method: string;
  uri: string;
  capabilityRefs: string[];
  actorRoleRefs: string[];
  effects: { kind: string; targetRef: string }[];
}

/** A capability is only worth projecting when it has a scenario and a reason. */
const hasBasis = (item: JsonObject): boolean => {
  const basis = isRecord(item['basis']) ? item['basis'] : {};

  return (
    stringsOf(item['scenarioRefs']).length > 0 &&
    typeof basis['reasoning'] === 'string' &&
    basis['reasoning'].length > 0 &&
    (stringsOf(basis['fmRefs']).length > 0 || stringsOf(basis['sourceRefs']).length > 0)
  );
};

/**
 * True when a Contract collection hangs off the concrete Participant Party that
 * plays the caller.
 *
 * This is the only accepted way to read a Contract list. `/parties` would mix
 * the two sides of one Contract into one collection, where the same id means
 * different things to different callers.
 */
const isPartyScopedContractCollection = (
  resource: ProjectedResource | undefined,
  resourcesById: ReadonlyMap<string, ProjectedResource>,
  index: FmIndex,
  actorRoleRef: string,
): boolean => {
  if (resource === undefined || resource.shape !== 'collection') {
    return false;
  }

  const target = index.entities.get(resource.entityRef);
  const parent =
    resource['parentRef'] === undefined
      ? undefined
      : resourcesById.get(String(resource['parentRef']));
  const parentEntity =
    parent === undefined ? undefined : index.entities.get(parent.entityRef);

  if (
    target === undefined ||
    target.category !== 'evidence' ||
    target.kind !== 'contract' ||
    parent === undefined ||
    parentEntity === undefined ||
    parentEntity.category !== 'participant' ||
    parentEntity.kind !== 'party'
  ) {
    return false;
  }

  const identity = isRecord(parent['identity']) ? parent['identity'] : {};

  if (
    GENERIC_PARTY_SEGMENTS.has(String(parent.segment)) ||
    GENERIC_PARTY_PARAMETERS.has(asString(identity['parameter']) ?? '')
  ) {
    return false;
  }

  return [...index.relationships.values()].some(
    (relationship) =>
      relationship.kind === 'plays_role' &&
      relationship.sourceRef === parent.entityRef &&
      relationship.targetRef === actorRoleRef,
  );
};

export interface BuildCapabilitiesResult {
  capabilities: ProjectedCapability[];
  operations: ProjectedOperation[];
  diagnostics: Diagnostic[];
}

/**
 * Projects the capabilities a design declares, then groups them into operations.
 *
 * Operations are the interesting part: two roles reading the same collection
 * share one route, so grouping is what lets the OpenAPI document declare one
 * operation with two acceptable actors instead of two conflicting ones.
 */
export const projectCapabilities = (
  design: DesignDocument,
  index: FmIndex,
  resources: readonly ProjectedResource[],
): BuildCapabilitiesResult => {
  const diagnostics: Diagnostic[] = [];
  const resourcesById = new Map(resources.map((item) => [item.id, item] as const));
  const bindings = new Map(
    recordsOf(design['bindings']).map((item) => [idOf(item), item] as const),
  );
  const scenarioDesign = new Map(
    recordsOf(design['scenarios']).map((item) => [idOf(item), item] as const),
  );
  const decisions = new Set(recordsOf(design['decisions']).map(idOf));
  const declared = new Set<string>();
  const projected: ProjectedCapability[] = [];
  const playedPartyRoles = partyRolesPlayedByParticipants(index);

  for (const capability of recordsOf(design['capabilities']).sort((left, right) =>
    compareText(idOf(left), idOf(right)),
  )) {
    const id = idOf(capability);
    const actorRoleRef = String(capability['actorRoleRef'] ?? '');
    const resourceRef = String(capability['resourceRef'] ?? '');
    const view = String(capability['view'] ?? '');
    const method = String(capability['method'] ?? '');
    const effect = isRecord(capability['effect']) ? capability['effect'] : {};
    const effectKind = String(effect['kind'] ?? '');
    const effectTargetRef = String(effect['targetRef'] ?? '');
    const key = `${actorRoleRef}\u0000${resourceRef}\u0000${view}\u0000${method}`;

    if (declared.has(key)) {
      diagnostics.push(
        errorDiagnostic(
          'CAPABILITY_DUPLICATE',
          '同角色、资源、视图和方法重复声明',
          id,
        ),
      );
      continue;
    }

    declared.add(key);

    let localErrors = false;
    let unresolved = false;

    const role = index.entities.get(actorRoleRef);
    const resource = resourcesById.get(resourceRef);
    const target = index.entities.get(effectTargetRef);

    if (role === undefined || role.category !== 'role' || role.kind !== 'party') {
      diagnostics.push(
        errorDiagnostic(
          'ACTOR_ROLE_INVALID',
          '调用者必须是 FM Party Role；Evidence Role 不能作为调用者',
          id,
          undefined,
          [actorRoleRef],
        ),
      );
      localErrors = true;
    } else if (!playedPartyRoles.has(actorRoleRef)) {
      diagnostics.push(
        gapDiagnostic(
          'ACTOR_PARTY_PLAYER_MISSING',
          `${id}.party-player`,
          'business',
          '调用者 Party Role 没有 participant.party 的 plays_role 扮演，不生成相关 API 接口',
          id,
          [actorRoleRef],
        ),
      );
      unresolved = true;
    }

    if (resource === undefined) {
      diagnostics.push(
        errorDiagnostic(
          'DESIGN_REF_NOT_FOUND',
          '能力引用的资源不存在',
          id,
          undefined,
          [resourceRef],
        ),
      );
      localErrors = true;
    }

    if (resource !== undefined && !(view in resource.uris)) {
      diagnostics.push(
        errorDiagnostic(
          'RESOURCE_VIEW_INVALID',
          '能力视图不属于该业务资源的寻址形态',
          id,
        ),
      );
      localErrors = true;
    }

    if (target === undefined) {
      diagnostics.push(
        errorDiagnostic(
          'FM_REF_NOT_FOUND',
          '能力效果目标不存在',
          id,
          undefined,
          [effectTargetRef],
        ),
      );
      localErrors = true;
    }

    let scenariosOk = true;
    let writeScenarioMatches = false;

    for (const scenarioRef of stringsOf(capability['scenarioRefs'])) {
      const scenario = scenarioDesign.get(scenarioRef);
      const sourceScenario =
        scenario === undefined
          ? undefined
          : index.scenarios.get(String(scenario['sourceScenarioRef'] ?? ''));

      if (sourceScenario === undefined) {
        diagnostics.push(
          errorDiagnostic('SCENARIO_REF_NOT_FOUND', `场景引用不存在: ${scenarioRef}`, id),
        );
        scenariosOk = false;
        continue;
      }

      writeScenarioMatches =
        writeScenarioMatches ||
        sourceScenario.steps.some((step) => {
          const instance = index.instances.get(step.issueInstanceRef);

          return (
            step.actingRoleRef === actorRoleRef &&
            instance !== undefined &&
            instance.entityRef === effectTargetRef
          );
        });
    }

    for (const reference of stringsOf(
      isRecord(capability['basis']) ? capability['basis']['decisionRefs'] : undefined,
    )) {
      if (!decisions.has(reference)) {
        diagnostics.push(
          errorDiagnostic('DESIGN_REF_NOT_FOUND', `设计决定不存在: ${reference}`, id),
        );
        localErrors = true;
      }
    }

    for (const ruleBinding of recordsOf(capability['ruleBindings'])) {
      const ruleRef = String(ruleBinding['ruleRef'] ?? '');

      if (!index.rules.has(ruleRef)) {
        diagnostics.push(
          errorDiagnostic('FM_REF_NOT_FOUND', `Rule 不存在: ${ruleRef}`, id),
        );
        localErrors = true;
      }
    }

    if ((method === 'GET') !== (effectKind === 'read')) {
      diagnostics.push(
        errorDiagnostic(
          'HTTP_EFFECT_CONFLICT',
          'GET 只能读取，读取效果也必须使用 GET',
          id,
        ),
      );
      localErrors = true;
    }

    if (
      method === 'GET' &&
      view === 'collection' &&
      target !== undefined &&
      target.category === 'evidence' &&
      target.kind === 'contract' &&
      !isPartyScopedContractCollection(resource, resourcesById, index, actorRoleRef)
    ) {
      diagnostics.push(
        gapDiagnostic(
          'CONTRACT_LIST_PARTY_SCOPE_MISSING',
          `${id}.party-scope`,
          'design',
          'Contract 列表读取必须以具体 participant.party 类型资源为 URL 根，避免用 /parties 混淆合同双方角色对应的不同主体',
          id,
          [resourceRef, effectTargetRef],
        ),
      );
      unresolved = true;
    }

    if (
      target !== undefined &&
      target.category === 'evidence' &&
      effectKind !== 'read' &&
      !(method === 'POST' && effectKind === 'append_evidence')
    ) {
      diagnostics.push(
        errorDiagnostic(
          'EVIDENCE_MUTATION_FORBIDDEN',
          'Evidence 只能读取或通过 POST 追加，不能覆盖或删除',
          id,
        ),
      );
      localErrors = true;
    }

    const bindingRefs = stringsOf(capability['bindingRefs']);

    for (const reference of bindingRefs) {
      if (!bindings.has(reference)) {
        diagnostics.push(
          errorDiagnostic('DESIGN_REF_NOT_FOUND', `能力约束不存在: ${reference}`, id),
        );
        localErrors = true;
      }
    }

    const resourceScope = new Set<string>();

    if (resource !== undefined) {
      let cursor: ProjectedResource | undefined = resource;

      while (cursor !== undefined) {
        resourceScope.add(cursor.id);
        const parentRef: unknown = cursor['parentRef'];

        cursor =
          typeof parentRef === 'string' ? resourcesById.get(parentRef) : undefined;
      }
    }

    const actorBinding = bindingRefs.some((reference) => {
      const binding = bindings.get(reference);

      return (
        binding?.['kind'] === 'caller_role' &&
        binding['roleRef'] === actorRoleRef &&
        typeof binding['scopeResourceRef'] === 'string' &&
        resourceScope.has(binding['scopeResourceRef'])
      );
    });

    if (!actorBinding) {
      diagnostics.push(
        gapDiagnostic(
          'ACTOR_SCOPE_UNRESOLVED',
          `${id}.actor-scope`,
          'business',
          '调用角色缺少资源实例范围约束',
          id,
          [actorRoleRef],
        ),
      );
      unresolved = true;
    }

    const parentBindingRef = asString(resource?.['parentBindingRef']);

    if (parentBindingRef !== undefined && !bindingRefs.includes(parentBindingRef)) {
      diagnostics.push(
        gapDiagnostic(
          'URI_BINDING_MISSING',
          `${id}.parent-binding`,
          'design',
          '能力未引用嵌套资源所需的父子实例约束',
          id,
          [parentBindingRef],
        ),
      );
      unresolved = true;
    }

    if (
      resource !== undefined &&
      target !== undefined &&
      target.id !== resource.entityRef
    ) {
      diagnostics.push(
        errorDiagnostic(
          'CAPABILITY_TARGET_MISMATCH',
          '能力效果目标必须是该资源表示的 FM 对象',
          id,
        ),
      );
      localErrors = true;
    }

    const scenarioSemanticsOk = effectKind === 'read' || writeScenarioMatches;

    if (!hasBasis(capability) || !scenariosOk || !scenarioSemanticsOk) {
      diagnostics.push(
        gapDiagnostic(
          'CAPABILITY_BASIS_UNRESOLVED',
          `${id}.basis`,
          'business',
          '能力缺少可解析场景或业务依据',
          id,
        ),
      );
      unresolved = true;
    }

    if (localErrors || resource === undefined || role === undefined || unresolved) {
      continue;
    }

    projected.push({
      ...capability,
      id,
      actorRoleRef,
      resourceRef,
      view,
      method,
      effect,
      uri: resource.uris[view] as string,
      roleLabel: role.label ?? role.id,
    });
  }

  const operations: ProjectedOperation[] = [];
  const byOperation = new Map<string, ProjectedCapability[]>();
  const byRoute = new Map<string, Set<string>>();

  for (const item of projected) {
    const operationKey = `${item.resourceRef}\u0000${item.view}\u0000${item.method}`;
    const variants = byOperation.get(operationKey) ?? [];
    variants.push(item);
    byOperation.set(operationKey, variants);

    const routeKey = `${item.uri.replace(/\{[^{}]+\}/g, '{}')}\u0000${item.method}`;
    const keys = byRoute.get(routeKey) ?? new Set<string>();
    keys.add(operationKey);
    byRoute.set(routeKey, keys);
  }

  for (const [routeKey, keys] of byRoute) {
    if (keys.size <= 1) {
      continue;
    }

    const [normalizedUri, method] = routeKey.split('\u0000');
    const distinct = sortedText(keys);

    diagnostics.push(
      errorDiagnostic(
        'OPERATION_CONFLICT',
        `参数归一化后路由冲突: ${method} ${normalizedUri}`,
        undefined,
        undefined,
        distinct.map((value) => value.split('\u0000')[0] as string),
      ),
    );
  }

  for (const operationKey of sortedText(byOperation.keys())) {
    const [resourceRef, view, method] = operationKey.split('\u0000') as [
      string,
      string,
      string,
    ];
    const variants = [...(byOperation.get(operationKey) ?? [])].sort(
      (left, right) =>
        compareText(left.actorRoleRef, right.actorRoleRef) ||
        compareText(left.id, right.id),
    );
    const signatures = new Map<string, { kind: string; targetRef: string }>();

    for (const item of variants) {
      const effect = item['effect'] as JsonObject;
      const kind = String(effect['kind'] ?? '');
      const targetRef = String(effect['targetRef'] ?? '');

      signatures.set(`${kind}\u0000${targetRef}`, { kind, targetRef });
    }

    if (signatures.size > 1) {
      diagnostics.push(
        gapDiagnostic(
          'OPERATION_COMPATIBILITY_UNRESOLVED',
          `operation.${resourceRef}.${view}.${method.toLowerCase()}.compatibility`,
          'design',
          '共享 HTTP 路由的效果变体兼容性尚未证明',
          undefined,
          variants.map((item) => item.id),
        ),
      );
    }

    const effects = [...signatures.values()].sort(
      (left, right) =>
        compareText(left.kind, right.kind) ||
        compareText(left.targetRef, right.targetRef),
    );

    operations.push({
      id: `operation.${resourceRef.replace(/^resource\./, '')}.${view}.${method.toLowerCase()}`,
      resourceRef,
      view,
      method,
      uri: variants[0]?.uri ?? '',
      capabilityRefs: variants.map((item) => item.id),
      actorRoleRefs: sortedText(new Set(variants.map((item) => item.actorRoleRef))),
      effects,
    });
  }

  return { capabilities: projected, operations, diagnostics };
};
