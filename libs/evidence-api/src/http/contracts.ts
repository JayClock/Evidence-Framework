import type { FmIndex } from '../adapter/fmAdapter.js';
import {
  errorDiagnostic,
  gapDiagnostic,
  hasErrors,
  normalizeDiagnostics,
  type Diagnostic,
} from '../diagnostics.js';
import { compareText, sortedText } from '../order.js';
import type { ProjectedCapability } from '../projection/capabilities.js';
import type { ProjectedResource } from '../projection/resources.js';
import type { CoverageRow } from '../projection/coverage.js';
import {
  checkConsumption,
  navigationGraph,
  type ConsumptionRow,
  type NavigationEdge,
} from './consumerCoverage.js';
import { buildRepresentations } from './contractLinks.js';
import { checkJourneys, type JourneyRow } from './httpJourneys.js';
import { matchesUri } from './contractLinks.js';
import { payloadOf, validatePayload } from './contractPayloads.js';

/**
 * The complete HTTP contract for every interface the design declares.
 *
 * Each response is checked against what the capability can mean: `201` has to
 * point at the new instance, `202` has to name a same-role GET for the result,
 * `204` and `304` carry no body, and a cache policy has to agree with the
 * `Cache-Control` the response actually declares. Those are the places a
 * contract drifts from the design without anyone noticing.
 */

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordsOf = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const headerName = (headers: JsonObject, name: string): string | undefined =>
  Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());

/** Why one declared response cannot describe what the capability does. */
const responseChecks = (
  response: JsonObject,
  capability: ProjectedCapability,
  representations: ReadonlyMap<string, JsonObject>,
  capabilities: ReadonlyMap<string, ProjectedCapability>,
  resources: ReadonlyMap<string, ProjectedResource>,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const target = capability.id;
  const headers = isRecord(response['headers']) ? response['headers'] : {};
  const lowercased = Object.keys(headers).map((name) => name.toLowerCase());
  const representationRef = asString(response['representationRef']);
  const representation =
    representationRef === undefined ? undefined : representations.get(representationRef);

  if (
    new Set(lowercased).size !== lowercased.length ||
    Object.values(headers).some(
      (value) => String(value).includes('\n') || String(value).includes('\r'),
    )
  ) {
    diagnostics.push(errorDiagnostic('CONTRACT_HEADERS', '响应头重复或包含换行', target));
  }

  if (representationRef !== undefined && representation === undefined) {
    diagnostics.push(
      errorDiagnostic('CONTRACT_REPRESENTATION_REF', '响应表示不存在', target),
    );
  }

  if (
    representation !== undefined &&
    !stringsOf(representation['actorRoleRefs']).includes(capability.actorRoleRef)
  ) {
    diagnostics.push(
      errorDiagnostic('CONTRACT_RESPONSE_ROLE', '响应表示不允许当前调用角色消费', target),
    );
  }

  const status = Number(response['status']);

  if ((status === 204 || status === 304) && representation !== undefined) {
    diagnostics.push(
      errorDiagnostic('CONTRACT_RESPONSE_BODY', '204/304 不应携带表示 body', target),
    );
  }

  if (status === 304 && capability.method !== 'GET') {
    diagnostics.push(
      errorDiagnostic('CONTRACT_READ_EFFECT', '304 只适用于当前方言中的 GET 条件读取', target),
    );
  }

  if (status === 201) {
    const resource = resources.get(capability.resourceRef);
    const uris = resource?.uris ?? {};
    const template = uris['item'] ?? uris['singleton'] ?? '';
    const location = headerName(headers, 'location');

    if (
      template === '' ||
      location === undefined ||
      !matchesUri(template, String(headers[location]))
    ) {
      diagnostics.push(
        gapDiagnostic(
          'CONTRACT_LOCATION',
          `${target}.location`,
          'design',
          '创建响应需要指向新实例的 Location 样例',
          target,
        ),
      );
    }

    if (capability.method === 'GET') {
      diagnostics.push(errorDiagnostic('CONTRACT_READ_EFFECT', 'GET 不创建资源', target));
    }
  }

  if (status === 202) {
    const result = capabilities.get(asString(response['resultCapabilityRef']) ?? '');
    const location = headerName(headers, 'location');

    if (
      result === undefined ||
      result.method !== 'GET' ||
      result.actorRoleRef !== capability.actorRoleRef ||
      location === undefined ||
      !matchesUri(result.uri, String(headers[location]))
    ) {
      diagnostics.push(
        gapDiagnostic(
          'CONTRACT_ASYNC_RESULT',
          `${target}.async-result`,
          'design',
          '异步受理需显式的同角色结果 GET 能力及可定位的 Location，不自动新增查询',
          target,
        ),
      );
    }
  }

  return diagnostics;
};

/** Why one declared operation cannot be retried or read as declared. */
const operationChecks = (
  operation: JsonObject,
  capability: ProjectedCapability,
  representations: ReadonlyMap<string, JsonObject>,
  capabilities: ReadonlyMap<string, ProjectedCapability>,
  resources: ReadonlyMap<string, ProjectedResource>,
  index: FmIndex,
): Diagnostic[] => {
  const target = capability.id;
  const request = payloadOf(operation['request']);
  const diagnostics = validatePayload(request, index, target, true);
  const idempotency = isRecord(operation['idempotency']) ? operation['idempotency'] : {};
  const responses = recordsOf(operation['responses']);

  if (capability.method === 'GET' && request.fields.length > 0) {
    diagnostics.push(
      errorDiagnostic(
        'CONTRACT_GET_BODY',
        '当前契约方言不支持 GET body；不从读取生成写入输入',
        target,
      ),
    );
  }

  if (capability.method !== 'GET' && idempotency['mode'] === 'not_applicable') {
    diagnostics.push(
      gapDiagnostic(
        'CONTRACT_RETRY_UNRESOLVED',
        `${target}.retry`,
        'design',
        '写入能力须明确重试策略或不支持的原因',
        target,
      ),
    );
  }

  const statuses = responses.map((response) => Number(response['status']));

  if (new Set(statuses).size !== statuses.length) {
    diagnostics.push(errorDiagnostic('CONTRACT_DUPLICATE', '同能力响应状态重复', target));
  }

  if (
    !statuses.some((status) => status < 300) ||
    !statuses.some((status) => status >= 400)
  ) {
    diagnostics.push(
      gapDiagnostic(
        'CONTRACT_RESPONSES_INCOMPLETE',
        `${target}.responses`,
        'design',
        '需声明成功和失败表现',
        target,
      ),
    );
  }

  for (const response of responses) {
    diagnostics.push(
      ...responseChecks(response, capability, representations, capabilities, resources),
    );
  }

  return diagnostics;
};

/** Fills in and checks the `Cache-Control` each cached response must carry. */
const cacheHeaderChecks = (
  operation: JsonObject,
  representations: ReadonlyMap<string, JsonObject>,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const reference = String(operation['capabilityRef']);

  for (const response of recordsOf(operation['responses'])) {
    const representationRef = asString(response['representationRef']);
    const representation =
      representationRef === undefined ? undefined : representations.get(representationRef);

    if (representation === undefined) {
      continue;
    }

    const cache = isRecord(representation['cache']) ? representation['cache'] : {};
    const expected =
      cache['mode'] === 'no-store'
        ? 'no-store'
        : `${String(cache['mode'])} , max-age=${String(cache['maxAge'])}`.replace(' ,', ',');
    const headers = isRecord(response['headers'])
      ? (response['headers'] as Record<string, string>)
      : {};
    response['headers'] = headers;

    const key = headerName(headers, 'cache-control') ?? 'Cache-Control';

    if (key in headers && headers[key] !== expected) {
      diagnostics.push(
        errorDiagnostic('CONTRACT_CACHE_HEADERS', '响应缓存头与表示缓存策略冲突', reference),
      );
    } else {
      headers[key] = expected;
    }

    const validator = asString(cache['validator']);

    if (validator !== undefined) {
      const required = validator === 'etag' ? 'etag' : 'last-modified';
      const present = Object.keys(headers).map((name) => name.toLowerCase());

      if (!present.includes(required)) {
        diagnostics.push(
          gapDiagnostic(
            'CONTRACT_CACHE_VALIDATOR',
            `${reference}.cache-validator`,
            'design',
            '可缓存响应须给出约定的验证头样例',
            reference,
          ),
        );
      }
    }
  }

  return diagnostics;
};

const operationsOf = (
  contract: JsonObject,
  projection: { capabilities: readonly ProjectedCapability[]; resources: readonly ProjectedResource[] },
  representations: readonly JsonObject[],
  index: FmIndex,
): { operations: JsonObject[]; diagnostics: Diagnostic[] } => {
  const capabilities = new Map(
    projection.capabilities.map((item) => [item.id, item] as const),
  );
  const resources = new Map(
    projection.resources.map((item) => [item.id, item] as const),
  );
  const byId = new Map(
    representations.map((item) => [String(item['id']), item] as const),
  );
  const result: JsonObject[] = [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const original of recordsOf(contract['operations']).sort((left, right) =>
    compareText(String(left['capabilityRef']), String(right['capabilityRef'])),
  )) {
    const operation = structuredClone(original) as JsonObject;
    const ref = String(operation['capabilityRef'] ?? '');
    const capability = capabilities.get(ref);

    if (seen.has(ref)) {
      diagnostics.push(errorDiagnostic('CONTRACT_DUPLICATE', '能力契约重复', ref));
    }

    seen.add(ref);

    if (capability === undefined) {
      diagnostics.push(
        errorDiagnostic('CONTRACT_CAPABILITY_REF', '契约引用的接口不存在或无效', ref),
      );
      continue;
    }

    diagnostics.push(...cacheHeaderChecks(operation, byId));
    diagnostics.push(
      ...operationChecks(operation, capability, byId, capabilities, resources, index),
    );

    result.push({
      ...operation,
      method: capability.method,
      uri: capability.uri,
      actorRoleRef: capability.actorRoleRef,
      bindingRefs: capability['bindingRefs'] ?? [],
      ruleBindings: capability['ruleBindings'] ?? [],
    });
  }

  for (const ref of sortedText(new Set(capabilities.keys()))) {
    if (seen.has(ref)) {
      continue;
    }

    diagnostics.push(
      gapDiagnostic(
        'CONTRACT_OPERATION_MISSING',
        `${ref}.http-contract`,
        'design',
        '业务接口尚无 HTTP 契约',
        ref,
      ),
    );
  }

  const grouped = new Map<string, string>();

  for (const operation of result) {
    const key = `${String(operation['method'])}\u0000${String(operation['uri']).replace(/\{[^{}]+\}/g, '{}')}`;
    const signature = JSON.stringify([
      operation['request'],
      operation['idempotency'],
      operation['concurrency'],
    ]);

    if (grouped.has(key) && grouped.get(key) !== signature) {
      diagnostics.push(
        gapDiagnostic(
          'CONTRACT_OPERATION_VARIANT',
          `${String(operation['capabilityRef'])}.route-variant`,
          'design',
          '共享路由的输入或重试策略不同，需显式解决分派兼容性',
          String(operation['capabilityRef']),
        ),
      );
    }

    grouped.set(key, signature);
  }

  return { operations: result, diagnostics };
};

/** What `http-journeys.json` reports beside the contract. */
export interface HttpContract {
  complete: boolean;
  runtimeValidated: false;
  entryPoints: unknown;
  consumerCoverage: ConsumptionRow[];
  navigation: NavigationEdge[];
  representations: JsonObject[];
  operations: JsonObject[];
  journeys: JourneyRow[];
  diagnostics: Record<string, unknown>[];
}

/**
 * Assembles the HTTP contract: representations, operations, journeys and the
 * coverage that ties them back to the business steps.
 *
 * `complete` is only true when nothing at all was found — not in the contract,
 * and not in the projection it was built from, because a design gap upstream
 * makes the downstream contract incomplete too.
 */
export const buildHttp = (
  contract: JsonObject,
  projection: {
    capabilities: readonly ProjectedCapability[];
    resources: readonly ProjectedResource[];
    coverage: readonly CoverageRow[];
    diagnostics: readonly Diagnostic[];
  },
  index: FmIndex,
): HttpContract => {
  let diagnostics: Diagnostic[] = [];
  const capabilities = new Map(
    projection.capabilities.map((item) => [item.id, item] as const),
  );

  for (const section of ['entryPoints', 'representations', 'journeys'] as const) {
    const seen = new Set<string>();

    for (const item of recordsOf(contract[section])) {
      const id = String(item['id'] ?? '');

      if (seen.has(id)) {
        diagnostics.push(errorDiagnostic('CONTRACT_DUPLICATE', '契约 ID 重复', id));
      }

      seen.add(id);
    }
  }

  const representations = buildRepresentations(contract, projection, index);
  diagnostics.push(...representations.diagnostics);

  const operations = operationsOf(contract, projection, representations.representations, index);
  diagnostics.push(...operations.diagnostics);

  const journeys = checkJourneys(
    contract,
    capabilities,
    operations.operations,
    representations.representations,
    index,
    new Set(
      projection.coverage
        .map((scenario) => scenario.scenarioRef)
        .filter((ref): ref is string => typeof ref === 'string'),
    ),
  );
  diagnostics.push(...journeys.diagnostics);

  const consumption = checkConsumption(
    projection.coverage,
    journeys.journeys,
    capabilities,
  );
  diagnostics.push(...consumption.diagnostics);

  const covered = new Set(
    journeys.journeys.flatMap((journey) =>
      journey.steps
        .filter((step) => step.status === 'mapped' && step.expectStatus >= 200 && step.expectStatus < 300)
        .map((step) => step.capabilityRef),
    ),
  );

  for (const reference of sortedText(new Set(capabilities.keys()))) {
    if (covered.has(reference)) {
      continue;
    }

    diagnostics.push(
      gapDiagnostic(
        'HTTP_FLOW_UNCOVERED',
        `${reference}.consumer-flow`,
        'coverage',
        '接口尚无可静态映射的成功消费步骤；失败或仅 304 回放不替代成功路径',
        reference,
      ),
    );
  }

  diagnostics = normalizeDiagnostics(diagnostics);

  return {
    complete:
      diagnostics.length === 0 &&
      !hasErrors(projection.diagnostics) &&
      projection.diagnostics.length === 0,
    runtimeValidated: false,
    entryPoints: contract['entryPoints'],
    consumerCoverage: consumption.consumerCoverage,
    navigation: navigationGraph(representations.representations, capabilities),
    representations: representations.representations,
    operations: operations.operations,
    journeys: journeys.journeys,
    diagnostics: diagnostics.map((item) => ({
      ...item,
      targetRef: item.targetRef ?? null,
      location: item.location ?? null,
      relatedRefs: [...(item.relatedRefs ?? [])],
      ...(item.gapKey === undefined ? {} : { gapKey: item.gapKey }),
      ...(item.category === undefined ? {} : { category: item.category }),
    })),
  };
};
