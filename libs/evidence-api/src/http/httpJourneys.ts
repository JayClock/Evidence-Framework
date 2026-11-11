import type { FmIndex } from '../adapter/fmAdapter.js';
import {
  errorDiagnostic,
  gapDiagnostic,
  type Diagnostic,
} from '../diagnostics.js';
import type { ProjectedCapability } from '../projection/capabilities.js';
import {
  payloadOf,
  payloadSchema,
  exampleErrors,
  validatePayload,
} from './contractPayloads.js';
import { expand, parameters, renderLinks } from './contractLinks.js';

/**
 * The HTTP journeys a client actually walks.
 *
 * A journey is not a list of endpoints: each step has to be reachable from the
 * previous response — an entry point, a link it carried, or the `Location` of a
 * creation — and every input has to come from somewhere already resolved. That
 * is what makes a journey evidence that the API is consumable rather than an
 * assertion that it is.
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

/** One resolved client request, with what the caller expects back. */
export interface JourneyStepResult {
  body: JsonObject;
  headers: Record<string, string>;
  path: Record<string, string>;
  representation: JsonObject | undefined;
  request: JsonObject;
  expect: JsonObject;
}

/** One resolved response a later step may navigate from. */
type PriorStep = JourneyStepResult;

/** A step row, whether it resolved or not. */
export interface JourneyStepRow {
  id: string;
  capabilityRef: string;
  expectStatus: number;
  sourceStepRefs: readonly string[];
  status: 'mapped' | 'gap';
  entryPointRef?: string;
  via?: JsonObject;
  request?: JsonObject;
  expect?: JsonObject;
}

export interface JourneyRow {
  id: string;
  actorRoleRef: string;
  scenarioRefs: readonly string[];
  status: 'mapped' | 'gap';
  steps: JourneyStepRow[];
}

const issue = (
  code: string,
  step: JsonObject,
  message: string,
): Diagnostic =>
  gapDiagnostic(
    code,
    `${String(step['id'])}.${code.toLowerCase()}`,
    'coverage',
    message,
    String(step['id']),
  );

const readSource = (
  source: JsonObject,
  prior: ReadonlyMap<string, PriorStep>,
): { available: boolean; value: unknown } => {
  if (source['kind'] === 'literal') {
    return { available: true, value: source['value'] };
  }

  const previous = prior.get(String(source['stepRef'] ?? ''));

  if (previous === undefined) {
    return { available: false, value: undefined };
  }

  const fromBody = source['kind'] === 'response_field';
  const values: JsonObject = fromBody
    ? previous.body
    : Object.fromEntries(
        Object.entries(previous.headers).map(([name, value]) => [
          name.toLowerCase(),
          value,
        ]),
      );
  const name = fromBody
    ? String(source['name'] ?? '')
    : String(source['name'] ?? '').toLowerCase();

  return { available: name in values, value: values[name] };
};

interface SplitUrl {
  scheme: string;
  netloc: string;
  path: string;
  query: string;
  fragment: string;
}

/** The parts `urlsplit` returns for a possibly relative URL. */
const splitUrl = (href: string): SplitUrl => {
  const hashIndex = href.indexOf('#');
  const fragment = hashIndex >= 0 ? href.slice(hashIndex) : '';
  const withoutFragment = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = withoutFragment.indexOf('?');
  const query = queryIndex >= 0 ? withoutFragment.slice(queryIndex + 1) : '';
  let path = queryIndex >= 0 ? withoutFragment.slice(0, queryIndex) : withoutFragment;
  let scheme = '';
  let netloc = '';

  const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(path);

  if (schemeMatch !== null) {
    scheme = schemeMatch[1] as string;
    path = path.slice(schemeMatch[0].length);
  }

  if (path.startsWith('//')) {
    const end = path.slice(2).search(/[/?#]/);
    const authority = end < 0 ? path.slice(2) : path.slice(2, 2 + end);
    netloc = authority;
    path = end < 0 ? '' : path.slice(2 + end);
  }

  return { scheme, netloc, path, query, fragment };
};

/** `parse_qsl`, keeping the pairs so a duplicate name can be noticed. */
const parseQuery = (query: string): [string, string][] =>
  query === ''
    ? []
    : query.split('&').map((pair) => {
        const index = pair.indexOf('=');
        const decode = (value: string): string =>
          decodeURIComponent(value.replaceAll('+', ' '));
        const name = index < 0 ? pair : pair.slice(0, index);
        const value = index < 0 ? '' : pair.slice(index + 1);

        return [decode(name), decode(value)];
      });

/**
 * The values a concrete URL supplies for a template.
 *
 * Returning null instead of a partial map keeps the caller honest: a URL that
 * almost matches the template is not the resource the contract describes.
 */
const locationParameters = (
  template: string,
  location: string,
): Record<string, string> | null => {
  const names = [...parameters(template)].sort(
    (left, right) =>
      template.indexOf(`{${left}}`) - template.indexOf(`{${right}}`),
  );
  let expression = '';
  let cursor = 0;

  for (const name of names) {
    const marker = `{${name}}`;
    const index = template.indexOf(marker, cursor);

    expression += `${template
      .slice(cursor, index)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^/?#]+)`;
    cursor = index + marker.length;
  }

  expression += template.slice(cursor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const match = new RegExp(`^${expression}$`, 'u').exec(location);

  if (match === null) {
    return null;
  }

  return Object.fromEntries(
    names.map((name, index) => [name, decodeURIComponent(match[index + 1] as string)]),
  );
};

interface FollowResult {
  path: Record<string, string>;
  query: Record<string, string>;
  diagnostics: Diagnostic[];
}

/**
 * Resolves the previous response a step navigates from.
 *
 * A navigation link is only followed when the capability it points at is the one
 * the step calls: following a link to a different route would prove reachability
 * of something nobody asked about.
 */
const follow = (
  step: JsonObject,
  capability: ProjectedCapability,
  prior: ReadonlyMap<string, PriorStep>,
  representations: ReadonlyMap<string, JsonObject>,
): FollowResult => {
  const via = isRecord(step['via']) ? step['via'] : {};
  const previous = prior.get(String(via['stepRef'] ?? ''));

  if (previous === undefined) {
    return {
      path: {},
      query: {},
      diagnostics: [issue('HTTP_FLOW_LINK', step, '导航来源不是已映射的前序响应')],
    };
  }

  const representation = previous.representation;
  let body = previous.body;
  let href = '';

  if (isRecord(via['member'])) {
    if (via['header'] !== undefined || via['rel'] !== undefined) {
      return {
        path: {},
        query: {},
        diagnostics: [
          issue('HTTP_FLOW_LINK', step, '集合成员导航不能同时指定 Location 或其他 rel'),
        ],
      };
    }

    const member = via['member'];
    const groups = recordsOf(representation?.['embedded']);
    const group = groups.find((item) => item['rel'] === member['rel']);
    const embedded = isRecord(body['_embedded']) ? body['_embedded'] : {};
    const members = Array.isArray(embedded[String(member['rel'])])
      ? (embedded[String(member['rel'])] as unknown[])
      : [];
    const references = stringsOf(group?.['representationRefs']);
    const index = Number(member['index']);

    if (
      group === undefined ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= references.length ||
      index >= members.length
    ) {
      return {
        path: {},
        query: {},
        diagnostics: [
          issue('HTTP_FLOW_LINK', step, '集合成员导航没有匹配的嵌入表示'),
        ],
      };
    }

    const child = representations.get(references[index] as string);

    if (child === undefined) {
      return {
        path: {},
        query: {},
        diagnostics: [
          issue('HTTP_FLOW_LINK', step, '集合成员导航引用的表示不存在'),
        ],
      };
    }

    if (
      capability.method !== 'GET' ||
      capability.resourceRef !== child['resourceRef'] ||
      capability.view !== child['view']
    ) {
      return {
        path: {},
        query: {},
        diagnostics: [
          issue('HTTP_FLOW_LINK', step, '集合成员 self 链接需要匹配的读取能力'),
        ],
      };
    }

    body = members[index] as JsonObject;
    const links = isRecord(body['_links']) ? body['_links'] : {};
    href = String((isRecord(links['self']) ? links['self']['href'] : '') ?? '');
  } else if (via['header'] !== undefined) {
    href =
      Object.entries(previous.headers).find(
        ([name]) => name.toLowerCase() === 'location',
      )?.[1] ?? '';

    if (capability.method !== 'GET') {
      return {
        path: {},
        query: {},
        diagnostics: [
          issue('HTTP_FLOW_LINK', step, 'Location 只能用于已有 GET 的结果发现'),
        ],
      };
    }
  } else {
    const rel = String(via['rel'] ?? '');

    if (rel === 'self' || rel === 'next') {
      if (
        capability.method !== 'GET' ||
        capability.resourceRef !== representation?.['resourceRef'] ||
        capability.view !== representation?.['view'] ||
        (rel === 'next' && representation?.['pagination'] === undefined)
      ) {
        return {
          path: {},
          query: {},
          diagnostics: [
            issue('HTTP_FLOW_LINK', step, 'self/next 需要匹配表示视图的读取能力'),
          ],
        };
      }
    } else {
      const link = recordsOf(representation?.['links']).find(
        (item) => item['rel'] === rel,
      );

      if (link === undefined || link['capabilityRef'] !== capability.id) {
        return {
          path: {},
          query: {},
          diagnostics: [
            issue('HTTP_FLOW_LINK', step, '前序响应未提供匹配的动作或导航链接'),
          ],
        };
      }

      if (link['whenRuleRef'] !== undefined) {
        return {
          path: {},
          query: {},
          diagnostics: [
            issue(
              'HTTP_FLOW_CONDITION',
              step,
              '动态动作条件尚未运行求值，不能宣称该路径可达',
            ),
          ],
        };
      }
    }

    const links = isRecord(body['_links']) ? body['_links'] : {};
    const target = isRecord(links[rel]) ? links[rel] : {};
    href = String(target['href'] ?? '');
  }

  const url = splitUrl(href);
  const pairs = parseQuery(url.query);
  const bound = locationParameters(capability.uri, url.path);

  if (
    url.scheme !== '' ||
    url.netloc !== '' ||
    url.fragment !== '' ||
    bound === null ||
    new Set(pairs.map(([name]) => name)).size !== pairs.length
  ) {
    return {
      path: {},
      query: {},
      diagnostics: [
        issue('HTTP_FLOW_LINK', step, '返回链接或 Location 不是可解析的本契约资源地址'),
      ],
    };
  }

  return { path: bound, query: Object.fromEntries(pairs), diagnostics: [] };
};

interface ResolvedInputs {
  path: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  header: Record<string, unknown>;
}

const resolveInputs = (
  step: JsonObject,
  capability: ProjectedCapability,
  prior: ReadonlyMap<string, PriorStep>,
  representations: ReadonlyMap<string, JsonObject>,
): { values: ResolvedInputs; diagnostics: Diagnostic[] } => {
  const values: ResolvedInputs = { path: {}, query: {}, body: {}, header: {} };
  const diagnostics: Diagnostic[] = [];

  if (step['via'] !== undefined) {
    const followed = follow(step, capability, prior, representations);
    values.path = followed.path;
    values.query = followed.query;
    diagnostics.push(...followed.diagnostics);
  }

  for (const binding of recordsOf(step['inputs'])) {
    const target = String(binding['target'] ?? '');
    const name = String(binding['name'] ?? '');
    const slot = target as keyof ResolvedInputs;

    if (!(slot in values)) {
      continue;
    }

    const existing =
      slot === 'header'
        ? new Set(Object.keys(values.header).map((item) => item.toLowerCase()))
        : new Set(Object.keys(values[slot]));

    if (existing.has(slot === 'header' ? name.toLowerCase() : name)) {
      diagnostics.push(
        errorDiagnostic(
          'HTTP_FLOW_DUPLICATE',
          '不能覆盖链接参数或重复绑定输入',
          String(step['id']),
        ),
      );
      continue;
    }

    const source = isRecord(binding['source']) ? binding['source'] : {};
    const { available, value } = readSource(source, prior);

    if (!available) {
      diagnostics.push(
        issue(
          'HTTP_FLOW_SOURCE',
          step,
          '输入来源必须是已映射的前序响应字段／头，不能前向引用或跨角色流程读取',
        ),
      );
    } else {
      values[slot][name] = value;
    }
  }

  return { values, diagnostics };
};

const isLocator = (value: unknown): boolean =>
  (typeof value === 'string' || typeof value === 'number') &&
  typeof value !== 'boolean';

const requiredInputDiagnostics = (
  step: JsonObject,
  capability: ProjectedCapability,
  operation: JsonObject,
  values: ResolvedInputs,
  representations: ReadonlyMap<string, JsonObject>,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const expectedPath = parameters(capability.uri);
  const givenPath = Object.keys(values.path);

  if (
    givenPath.length !== expectedPath.size ||
    !givenPath.every((name) => expectedPath.has(name)) ||
    !Object.values(values.path).every(isLocator)
  ) {
    diagnostics.push(
      issue('HTTP_FLOW_INPUT', step, 'URI 参数缺失、多余或不能作为实例定位值'),
    );
  }

  const allowedQueries = new Set<string>();

  for (const representation of representations.values()) {
    const pagination = isRecord(representation['pagination'])
      ? representation['pagination']
      : undefined;

    if (
      pagination === undefined ||
      representation['resourceRef'] !== capability.resourceRef ||
      representation['view'] !== capability.view ||
      !stringsOf(representation['actorRoleRefs']).includes(capability.actorRoleRef)
    ) {
      continue;
    }

    allowedQueries.add(String(pagination['parameter'] ?? ''));
  }

  const queryNames = Object.keys(values.query);

  if (
    (queryNames.length > 0 && capability.method !== 'GET') ||
    !queryNames.every((name) => allowedQueries.has(name)) ||
    !Object.values(values.query).every(isLocator)
  ) {
    diagnostics.push(
      issue('HTTP_FLOW_INPUT', step, '查询参数必须来自当前角色集合读取的分页契约'),
    );
  }

  const request = payloadOf(operation['request']);

  for (const message of exampleErrors(payloadSchema(request), values.body)) {
    diagnostics.push(issue('HTTP_FLOW_INPUT', step, message));
  }

  const idempotency = isRecord(operation['idempotency']) ? operation['idempotency'] : {};
  const concurrency = isRecord(operation['concurrency']) ? operation['concurrency'] : {};
  const requiredHeaders = new Set<string>();

  if (idempotency['mode'] === 'key') {
    requiredHeaders.add(String(idempotency['header'] ?? '').toLowerCase());
  }

  if (concurrency['mode'] === 'if-match') {
    requiredHeaders.add('if-match');
  }

  const presentHeaders = new Set(
    Object.keys(values.header).map((name) => name.toLowerCase()),
  );

  if (
    ![...requiredHeaders].every((name) => presentHeaders.has(name)) ||
    !Object.values(values.header).every(
      (value) => typeof value === 'string' && !value.includes('\n') && !value.includes('\r'),
    )
  ) {
    diagnostics.push(
      issue('HTTP_FLOW_INPUT', step, '缺少幂等／并发头，或请求头无效'),
    );
  }

  return diagnostics;
};

interface ResponseExample {
  representation: JsonObject | undefined;
  headers: Record<string, string>;
  diagnostics: Diagnostic[];
}

/**
 * The response a step expects, with instance-specific values substituted.
 *
 * Only `Location`, `ETag` and `Last-Modified` may differ from the contract: they
 * describe the instance that was just created, not the transport policy.
 */
const responseExample = (
  step: JsonObject,
  response: JsonObject,
  representations: ReadonlyMap<string, JsonObject>,
  capabilities: ReadonlyMap<string, ProjectedCapability>,
  index: FmIndex,
  query: Record<string, unknown>,
): ResponseExample => {
  const reference = asString(response['representationRef']);
  const declared = reference === undefined ? undefined : representations.get(reference);
  const representation =
    declared === undefined ? undefined : (structuredClone(declared) as JsonObject);
  const headers: Record<string, string> = Object.fromEntries(
    Object.entries(isRecord(response['headers']) ? response['headers'] : {}).map(
      ([name, value]) => [name, String(value)],
    ),
  );
  const diagnostics: Diagnostic[] = [];
  const sample = isRecord(step['responseExample']) ? step['responseExample'] : undefined;

  if (sample !== undefined) {
    if (representation === undefined) {
      return {
        representation,
        headers,
        diagnostics: [issue('HTTP_FLOW_RESPONSE', step, '无响应表示的状态不能替换表示样例')],
      };
    }

    representation['example'] = sample['body'];
    representation['exampleParameters'] = isRecord(sample['parameters'])
      ? sample['parameters']
      : {};
    diagnostics.push(
      ...validatePayload(payloadOf(representation), index, String(step['id'])),
    );

    const sampleParameters = Object.keys(
      isRecord(sample['parameters']) ? sample['parameters'] : {},
    );
    const expectedParameters = parameters(String(representation['uri'] ?? ''));

    if (
      sampleParameters.length !== expectedParameters.size ||
      !sampleParameters.every((name) => expectedParameters.has(name))
    ) {
      diagnostics.push(
        issue('HTTP_FLOW_INSTANCE', step, '响应样例参数与资源视图不匹配'),
      );
    }

    const sampleHeaders = isRecord(sample['headers']) ? sample['headers'] : {};

    for (const [name, value] of Object.entries(sampleHeaders)) {
      const declaredName = Object.keys(headers).find(
        (candidate) => candidate.toLowerCase() === name.toLowerCase(),
      );
      const allowed = new Set(['location', 'etag', 'last-modified']);
      const text = String(value);

      if (
        declaredName === undefined ||
        !allowed.has(name.toLowerCase()) ||
        text.includes('\r') ||
        text.includes('\n')
      ) {
        diagnostics.push(
          issue(
            'HTTP_FLOW_RESPONSE',
            step,
            '响应样例仅可替换已声明的 Location/ETag/Last-Modified',
          ),
        );
      } else {
        headers[declaredName] = text;
      }
    }

    const sampleNames = Object.keys(sampleHeaders).map((name) => name.toLowerCase());

    if (new Set(sampleNames).size !== sampleNames.length) {
      diagnostics.push(issue('HTTP_FLOW_RESPONSE', step, '响应样例包含重复头'));
    }
  }

  if (representation?.['mediaType'] === 'application/hal+json') {
    const example = isRecord(representation['example']) ? representation['example'] : {};
    const body: JsonObject = Object.fromEntries(
      Object.entries(example).filter(([key]) => key !== '_links'),
    );
    const path = isRecord(representation['exampleParameters'])
      ? representation['exampleParameters']
      : {};
    const rendered = renderLinks(representation, capabilities, index, path);

    diagnostics.push(...rendered.diagnostics);

    const uri = expand(String(representation['uri'] ?? ''), path);
    const queryText = Object.keys(query).length === 0
      ? ''
      : `?${Object.entries(query)
          .map(
            ([name, value]) =>
              `${encodeURIComponent(name)}=${encodeURIComponent(String(value)).replaceAll('%20', '+')}`,
          )
          .join('&')}`;

    rendered.links['self'] = { href: `${uri}${queryText}` };

    if (representation['pagination'] !== undefined) {
      const pagination = isRecord(representation['pagination'])
        ? representation['pagination']
        : {};
      const next = Object.entries({
        ...query,
        [String(pagination['parameter'] ?? '')]: pagination['nextExample'],
      })
        .map(
          ([name, value]) =>
            `${encodeURIComponent(name)}=${encodeURIComponent(String(value)).replaceAll('%20', '+')}`,
        )
        .join('&');

      rendered.links['next'] = { href: `${uri}?${next}` };
    }

    body['_links'] = rendered.links;
    representation['example'] = body;
  }

  return { representation, headers, diagnostics };
};

const stepOf = (
  step: JsonObject,
  role: string,
  operations: ReadonlyMap<string, JsonObject>,
  capabilities: ReadonlyMap<string, ProjectedCapability>,
  representations: ReadonlyMap<string, JsonObject>,
  prior: ReadonlyMap<string, PriorStep>,
  index: FmIndex,
): { value: JourneyStepResult | null; diagnostics: Diagnostic[] } => {
  const capability = capabilities.get(String(step['capabilityRef'] ?? ''));
  const operation = operations.get(String(step['capabilityRef'] ?? ''));

  if (capability === undefined || operation === undefined || capability.actorRoleRef !== role) {
    return {
      value: null,
      diagnostics: [issue('HTTP_FLOW_ROLE', step, '流程角色没有匹配的业务接口及契约')],
    };
  }

  const expectStatus = Number(step['expectStatus']);
  const response = recordsOf(operation['responses']).find(
    (item) => Number(item['status']) === expectStatus,
  );

  if (response === undefined) {
    return {
      value: null,
      diagnostics: [issue('HTTP_FLOW_RESPONSE', step, '预期状态未在接口契约中声明')],
    };
  }

  const { values, diagnostics } = resolveInputs(
    step,
    capability,
    prior,
    representations,
  );
  diagnostics.push(
    ...requiredInputDiagnostics(step, capability, operation, values, representations),
  );

  if (
    expectStatus === 304 &&
    (capability.method !== 'GET' ||
      !['if-none-match', 'if-modified-since'].some((name) =>
        Object.keys(values.header)
          .map((header) => header.toLowerCase())
          .includes(name),
      ))
  ) {
    diagnostics.push(issue('HTTP_FLOW_CONDITIONAL', step, '304 需要 GET 条件请求'));
  }

  const expected = responseExample(
    step,
    response,
    representations,
    capabilities,
    index,
    values.query,
  );
  diagnostics.push(...expected.diagnostics);

  if (
    expected.representation !== undefined &&
    !stringsOf(expected.representation['actorRoleRefs']).includes(role)
  ) {
    diagnostics.push(issue('HTTP_FLOW_ROLE', step, '该角色不能消费所选响应表示'));
  }

  const body =
    expected.representation === undefined
      ? {}
      : (isRecord(expected.representation['example'])
          ? expected.representation['example']
          : {});
  const path: Record<string, string> = Object.fromEntries(
    Object.entries(values.path).map(([name, value]) => [name, String(value)]),
  );
  const location = Object.entries(expected.headers).find(
    ([name]) => name.toLowerCase() === 'location',
  )?.[1];

  if (expectStatus === 201 || expectStatus === 202) {
    let template = '';

    if (expectStatus === 202) {
      template =
        capabilities.get(String(response['resultCapabilityRef'] ?? ''))?.uri ?? '';
    } else {
      // Creation identity comes from the declared resource, even without a body.
      template =
        [...representations.values()].find(
          (item) =>
            item['resourceRef'] === capability.resourceRef &&
            (item['view'] === 'item' || item['view'] === 'singleton'),
        )?.['uri'] as string ?? '';
      template = template === '' ? (location ?? '') : template;
    }

    if (location === undefined || locationParameters(template, location) === null) {
      diagnostics.push(
        issue('HTTP_FLOW_INSTANCE', step, '响应 Location 与创建或结果资源不匹配'),
      );
    }
  }

  if (expected.representation !== undefined) {
    if (location !== undefined) {
      const returned = locationParameters(
        String(expected.representation['uri'] ?? ''),
        location,
      );

      if (returned !== null) {
        for (const [name, value] of Object.entries(returned)) {
          if (name in path && path[name] !== value) {
            diagnostics.push(
              issue('HTTP_FLOW_INSTANCE', step, '响应 Location 改变了请求中的实例范围'),
            );
          }
        }

        Object.assign(path, returned);
      }
    }

    const exampleParameters = isRecord(expected.representation['exampleParameters'])
      ? expected.representation['exampleParameters']
      : {};

    if (
      expected.representation['resourceRef'] === capability.resourceRef &&
      Object.entries(exampleParameters).some(
        ([name, value]) => name in path && path[name] !== String(value),
      )
    ) {
      diagnostics.push(
        issue(
          'HTTP_FLOW_INSTANCE',
          step,
          '响应表示与请求或 Location 指定的资源实例不一致',
        ),
      );
    }
  }

  const request: JsonObject = {
    method: capability.method,
    uriTemplate: capability.uri,
    pathParameters: values.path,
    queryParameters: values.query,
    headers: values.header,
    uri: capability.uri,
  };
  const queryText =
    Object.keys(values.query).length === 0
      ? ''
      : `?${Object.entries(values.query)
          .map(
            ([name, value]) =>
              `${encodeURIComponent(name)}=${encodeURIComponent(String(value)).replaceAll('%20', '+')}`,
          )
          .join('&')}`;

  request['uri'] = `${expand(capability.uri, values.path)}${queryText}`;

  const requestPayload = payloadOf(operation['request']);

  if (requestPayload.fields.length > 0) {
    request['mediaType'] = requestPayload.mediaType;
    request['body'] = values.body;
  }

  const expect: JsonObject = { status: expectStatus, headers: expected.headers };

  if (expected.representation !== undefined) {
    expect['representationRef'] = expected.representation['id'];
    expect['body'] = body;
  }

  return {
    value: {
      body,
      headers: expected.headers,
      path,
      representation: expected.representation,
      request,
      expect,
    },
    diagnostics,
  };
};

const entryDiagnostics = (
  contract: JsonObject,
  capabilities: ReadonlyMap<string, ProjectedCapability>,
  scenarioRefs: ReadonlySet<string> | undefined,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  for (const entry of recordsOf(contract['entryPoints'])) {
    const capability = capabilities.get(String(entry['capabilityRef'] ?? ''));
    const entryScenarios = stringsOf(entry['scenarioRefs']);

    if (
      scenarioRefs !== undefined &&
      !entryScenarios.every((ref) => scenarioRefs.has(ref))
    ) {
      diagnostics.push(
        errorDiagnostic('HTTP_FLOW_SCENARIO', '入口必须引用已有 API 场景', String(entry['id'])),
      );
    }

    if (
      capability === undefined ||
      !entryScenarios.every((ref) => stringsOf(capability['scenarioRefs']).includes(ref))
    ) {
      diagnostics.push(
        errorDiagnostic(
          'HTTP_ENTRY_CAPABILITY',
          '入口必须指向支持这些场景的已有能力',
          String(entry['id']),
        ),
      );
    }

    const basis = isRecord(entry['basis']) ? entry['basis'] : {};

    if (
      stringsOf(basis['fmRefs']).length === 0 &&
      stringsOf(basis['sourceRefs']).length === 0
    ) {
      diagnostics.push(
        gapDiagnostic(
          'HTTP_ENTRY_BASIS',
          `${String(entry['id'])}.basis`,
          'business',
          '入口及初始上下文需要 FM 或业务来源依据',
          String(entry['id']),
        ),
      );
    }
  }

  return diagnostics;
};

export interface CheckJourneysResult {
  journeys: JourneyRow[];
  diagnostics: Diagnostic[];
}

/**
 * Walks every declared journey, resolving each step from the previous response.
 *
 * A step that cannot be resolved keeps its row and marks the journey `gap`: the
 * reader has to see which step failed, not just that something did.
 */
export const checkJourneys = (
  contract: JsonObject,
  capabilities: ReadonlyMap<string, ProjectedCapability>,
  operations: readonly JsonObject[],
  representations: readonly JsonObject[],
  index: FmIndex,
  scenarioRefs: ReadonlySet<string>,
): CheckJourneysResult => {
  const diagnostics = entryDiagnostics(contract, capabilities, scenarioRefs);
  const journeys = recordsOf(contract['journeys']);

  if (journeys.length === 0 && capabilities.size > 0) {
    return {
      journeys: [
        {
          id: 'not-evaluated',
          actorRoleRef: '',
          scenarioRefs: [],
          status: 'gap',
          steps: [],
        },
      ],
      diagnostics: [
        ...diagnostics,
        gapDiagnostic(
          'HTTP_FLOW_NOT_EVALUATED',
          'contract.http-flow',
          'coverage',
          '尚未验证消费者流程',
        ),
      ],
    };
  }

  const operationsById = new Map(
    operations.map((item) => [String(item['capabilityRef']), item] as const),
  );
  const representationsById = new Map(
    representations.map((item) => [String(item['id']), item] as const),
  );
  const entries = new Map(
    recordsOf(contract['entryPoints']).map((item) => [String(item['id']), item] as const),
  );
  const results: JourneyRow[] = [];

  for (const journey of journeys) {
    const journeyId = String(journey['id']);
    const actorRoleRef = String(journey['actorRoleRef'] ?? '');
    const journeyScenarios = stringsOf(journey['scenarioRefs']);

    if (!journeyScenarios.every((ref) => scenarioRefs.has(ref))) {
      diagnostics.push(
        errorDiagnostic('HTTP_FLOW_SCENARIO', 'HTTP 流程必须引用已有 API 场景', journeyId),
      );
    }

    const prior = new Map<string, PriorStep>();
    const rows: JourneyStepRow[] = [];
    const seen = new Set<string>();

    recordsOf(journey['steps']).forEach((step, position) => {
      const stepId = String(step['id']);
      const { value, diagnostics: stepDiagnostics } = stepOf(
        step,
        actorRoleRef,
        operationsById,
        capabilities,
        representationsById,
        prior,
        index,
      );
      const issues = [...stepDiagnostics];

      if (step['entryPointRef'] !== undefined) {
        const entry = entries.get(String(step['entryPointRef']));
        const entryScenarios = stringsOf(entry?.['scenarioRefs']);

        if (position !== 0) {
          issues.push(
            issue(
              'HTTP_FLOW_ENTRY',
              step,
              '流程首步之后只能通过前序响应的链接或 Location 接续',
            ),
          );
        } else if (
          entry === undefined ||
          entry['capabilityRef'] !== step['capabilityRef'] ||
          !journeyScenarios.every((ref) => entryScenarios.includes(ref))
        ) {
          issues.push(issue('HTTP_FLOW_ENTRY', step, '入口必须匹配能力及场景'));
        }
      } else if (position === 0) {
        issues.push(
          issue('HTTP_FLOW_ENTRY', step, '流程首步必须引用已声明入口或通过响应链接接续'),
        );
      }

      if (seen.has(stepId)) {
        issues.push(errorDiagnostic('CONTRACT_DUPLICATE', 'HTTP 步骤 ID 重复', stepId));
      }

      seen.add(stepId);
      diagnostics.push(...issues);

      const row: JourneyStepRow = {
        id: stepId,
        capabilityRef: String(step['capabilityRef'] ?? ''),
        expectStatus: Number(step['expectStatus']),
        sourceStepRefs: stringsOf(step['sourceStepRefs']),
        status: issues.length === 0 ? 'mapped' : 'gap',
      };

      if (step['entryPointRef'] !== undefined) {
        row.entryPointRef = String(step['entryPointRef']);
      }

      if (step['via'] !== undefined) {
        row.via = isRecord(step['via']) ? step['via'] : {};
      }

      if (issues.length === 0 && value !== null) {
        row.request = value.request;
        row.expect = value.expect;
        prior.set(stepId, value);
      }

      rows.push(row);
    });

    results.push({
      id: journeyId,
      actorRoleRef,
      scenarioRefs: journeyScenarios,
      status: rows.some((row) => row.status === 'gap') ? 'gap' : 'mapped',
      steps: rows,
    });
  }

  return { journeys: results, diagnostics };
};
