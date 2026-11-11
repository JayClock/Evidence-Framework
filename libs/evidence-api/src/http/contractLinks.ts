import type { FmIndex } from '../adapter/fmAdapter.js';
import {
  errorDiagnostic,
  gapDiagnostic,
  type Diagnostic,
} from '../diagnostics.js';
import { compareText, sortedText } from '../order.js';
import type { ProjectedCapability } from '../projection/capabilities.js';
import type { ProjectedResource } from '../projection/resources.js';
import {
  payloadOf,
  validatePayload,
  type Payload,
} from './contractPayloads.js';

/**
 * Resource examples and the typed, role-scoped links they carry.
 *
 * A hypermedia link is only usable if every parameter it needs is already in
 * scope: the caller's path or the representation's own fields. That is why
 * binding is checked rather than rendered: an `href` with a hole in it looks
 * navigable and is not.
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

const PLACEHOLDER = /\{([^{}]+)\}/g;

/** Every path parameter a URI template declares. */
export const parameters = (uri: string): Set<string> =>
  new Set([...uri.matchAll(PLACEHOLDER)].map((match) => match[1] as string));

/** Substitutes `{name}` with the value, percent-encoded so a slash cannot leak. */
export const expand = (uri: string, values: Readonly<Record<string, unknown>>): string => {
  let result = uri;

  for (const name of sortedText(parameters(uri))) {
    result = result.replace(
      `{${name}}`,
      encodeURIComponent(String(values[name] ?? '')),
    );
  }

  return result;
};

/** True when a concrete URL still satisfies the template it came from. */
export const matchesUri = (template: string, value: string): boolean => {
  const expression = template
    .split(PLACEHOLDER)
    .map((part, index) =>
      index % 2 === 1 ? '[^/?#]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');

  return new RegExp(`^${expression}$`, 'u').test(value);
};

/** `quote_plus` semantics, which is what `urlencode` prints. */
export const encodeQuery = (values: Readonly<Record<string, string>>): string =>
  Object.entries(values)
    .sort(([left], [right]) => compareText(left, right))
    .map(
      ([name, value]) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(value).replaceAll('%20', '+')}`,
    )
    .join('&');

/**
 * The parameter values a link can be given, or null when it cannot be closed.
 *
 * Returning null rather than a partial map keeps the caller honest: a link that
 * is *almost* bindable is still a broken one.
 */
export const bindLink = (
  link: JsonObject,
  capability: ProjectedCapability,
  body: JsonObject,
  path: JsonObject,
): Record<string, unknown> | null => {
  const values: Record<string, unknown> = {};
  const bindings = isRecord(link['parameterBindings'])
    ? link['parameterBindings']
    : {};

  for (const [parameter, source] of Object.entries(bindings)) {
    if (!isRecord(source)) {
      return null;
    }

    const pool = source['kind'] === 'path' ? path : body;
    const value = pool[String(source['name'] ?? '')];

    if (
      value === undefined ||
      (typeof value !== 'string' && typeof value !== 'number') ||
      typeof value === 'boolean'
    ) {
      return null;
    }

    values[parameter] = value;
  }

  const expected = parameters(capability.uri);

  return Object.keys(values).length === expected.size &&
    Object.keys(values).every((name) => expected.has(name))
    ? values
    : null;
};

/** Reasons a cache policy cannot be justified by the representation itself. */
const cacheChecks = (representation: JsonObject): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const cache = isRecord(representation['cache']) ? representation['cache'] : {};
  const target = String(representation['id'] ?? '');
  const links = recordsOf(representation['links']);

  if (
    cache['mode'] === 'public' &&
    (typeof cache['publicInvariantReason'] !== 'string' ||
      cache['publicInvariantReason'] === '')
  ) {
    diagnostics.push(
      gapDiagnostic(
        'CONTRACT_CACHE_SCOPE',
        `${target}.cache-scope`,
        'design',
        '共享缓存需要明确说明表示与身份、角色及动态动作无关的依据',
        target,
      ),
    );
  }

  if (cache['mode'] === 'public' && links.some((link) => link['whenRuleRef'])) {
    diagnostics.push(
      gapDiagnostic(
        'CONTRACT_CACHE_DYNAMIC',
        `${target}.cache-dynamic`,
        'design',
        '动态动作不能仅凭凭证不可变而声明公共缓存',
        target,
      ),
    );
  }

  return diagnostics;
};

/**
 * Renders the links a representation carries, and refuses the ones it cannot.
 *
 * The reserved relation names `self` and `next` are not the design's to declare:
 * the engine owns the self link, and pagination owns next.
 */
export const renderLinks = (
  representation: JsonObject,
  capabilities: ReadonlyMap<string, ProjectedCapability>,
  index: FmIndex,
  path: JsonObject,
): { links: Record<string, { href: string }>; diagnostics: Diagnostic[] } => {
  const links: Record<string, { href: string }> = {};
  const diagnostics: Diagnostic[] = [];
  const seen = new Set(['self', 'next']);
  const target = String(representation['id'] ?? '');
  const example = isRecord(representation['example']) ? representation['example'] : {};

  for (const link of recordsOf(representation['links'])) {
    const rel = String(link['rel'] ?? '');

    if (seen.has(rel)) {
      diagnostics.push(
        errorDiagnostic('CONTRACT_DUPLICATE', '链接 rel 重复或使用保留 self/next', target),
      );
    }

    seen.add(rel);

    const capability = capabilities.get(asString(link['capabilityRef']) ?? '');

    if (capability === undefined) {
      diagnostics.push(
        errorDiagnostic('CONTRACT_LINK_TARGET', '链接未指向有效业务接口', target),
      );
      continue;
    }

    const roles = stringsOf(representation['actorRoleRefs']);

    if (
      roles.length !== 1 ||
      (roles[0] as string) !== capability.actorRoleRef
    ) {
      diagnostics.push(
        errorDiagnostic(
          'CONTRACT_LINK_ROLE',
          '该表示中的链接不能暴露给其他角色；请拆分角色表示',
          target,
        ),
      );
    }

    if ((link['kind'] === 'navigation') !== (capability.method === 'GET')) {
      diagnostics.push(
        errorDiagnostic(
          'CONTRACT_LINK_METHOD',
          '导航必须引用 GET，写动作必须显式声明 action',
          target,
        ),
      );
    }

    const whenRuleRef = asString(link['whenRuleRef']);

    if (
      whenRuleRef !== undefined &&
      index.rules.get(whenRuleRef)?.resultType !== 'bool'
    ) {
      diagnostics.push(
        errorDiagnostic('CONTRACT_FM_REF', '动作条件须引用已建模的 bool Rule', target),
      );
    }

    const values = bindLink(link, capability, example, path);

    if (values === null) {
      diagnostics.push(
        errorDiagnostic(
          'CONTRACT_LINK_PARAMETER',
          '目标参数必须由已声明路径或表示字段闭合提供',
          target,
        ),
      );
      continue;
    }

    links[rel] = { href: expand(capability.uri, values) };
  }

  return { links, diagnostics };
};

/**
 * Embeds member representations into a HAL collection.
 *
 * Only a collection may embed, and only an item of the same resource with the
 * same role and the same parent scope: anything else would either loop or leak
 * an instance the caller cannot address.
 */
export const embedMembers = (representations: JsonObject[]): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const byId = new Map(representations.map((item) => [String(item['id']), item] as const));

  for (const parent of representations) {
    const embeddedGroups = recordsOf(parent['embedded']);

    if (embeddedGroups.length === 0) {
      continue;
    }

    const parentId = String(parent['id']);

    if (parent['view'] !== 'collection' || parent['mediaType'] !== 'application/hal+json') {
      diagnostics.push(
        errorDiagnostic(
          'CONTRACT_EMBEDDED',
          '嵌入成员只支持 HAL 集合表示，不允许循环嵌入',
          parentId,
        ),
      );
      continue;
    }

    const embedded: Record<string, unknown[]> = {};
    const parentRoles = new Set(stringsOf(parent['actorRoleRefs']));
    const parentParameters = isRecord(parent['exampleParameters'])
      ? parent['exampleParameters']
      : {};

    for (const group of embeddedGroups) {
      const rel = String(group['rel'] ?? '');

      if (rel in embedded) {
        diagnostics.push(
          errorDiagnostic('CONTRACT_EMBEDDED', '嵌入关系名称重复', parentId),
        );
      }

      const members: unknown[] = [];

      for (const reference of stringsOf(group['representationRefs'])) {
        const child = byId.get(reference);

        if (
          child === undefined ||
          child['view'] !== 'item' ||
          child['resourceRef'] !== parent['resourceRef'] ||
          child['mediaType'] !== 'application/hal+json'
        ) {
          diagnostics.push(
            errorDiagnostic(
              'CONTRACT_EMBEDDED',
              '成员须引用同一资源的 HAL 实例表示',
              parentId,
            ),
          );
          continue;
        }

        const childRoles = new Set(stringsOf(child['actorRoleRefs']));
        const childParameters = isRecord(child['exampleParameters'])
          ? child['exampleParameters']
          : {};
        const scopeMismatch = Object.entries(parentParameters).some(
          ([key, value]) => childParameters[key] !== value,
        );

        if (
          ![...parentRoles].every((role) => childRoles.has(role)) ||
          scopeMismatch
        ) {
          diagnostics.push(
            errorDiagnostic(
              'CONTRACT_EMBEDDED',
              '成员的角色或父实例范围与集合不一致',
              parentId,
            ),
          );
          continue;
        }

        members.push(structuredClone(child['example']));
      }

      embedded[rel] = members;
    }

    const example = isRecord(parent['example']) ? parent['example'] : {};
    example['_embedded'] = embedded;
    parent['example'] = example;
  }

  return diagnostics;
};

export interface BuildRepresentationsResult {
  representations: JsonObject[];
  diagnostics: Diagnostic[];
}

/**
 * Projects the declared representations.
 *
 * The example is what a consumer actually receives, so the rendered `_links`
 * are written into it: a link the design cannot close never reaches the example.
 */
export const buildRepresentations = (
  contract: JsonObject,
  projection: { capabilities: readonly ProjectedCapability[]; resources: readonly ProjectedResource[] },
  index: FmIndex,
): BuildRepresentationsResult => {
  const capabilities = new Map(
    projection.capabilities.map((item) => [item.id, item] as const),
  );
  const resources = new Map(
    projection.resources.map((item) => [item.id, item] as const),
  );
  const result: JsonObject[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const representation of recordsOf(contract['representations']).sort(
    (left, right) => compareText(String(left['id']), String(right['id'])),
  )) {
    const target = String(representation['id']);
    const payload: Payload = payloadOf(representation);

    diagnostics.push(...validatePayload(payload, index, target));
    diagnostics.push(...cacheChecks(representation));

    const resource = resources.get(String(representation['resourceRef'] ?? ''));
    const view = String(representation['view'] ?? '');
    const uri = resource?.uris[view];
    const path = isRecord(representation['exampleParameters'])
      ? representation['exampleParameters']
      : {};

    if (uri === undefined || !sameParameters(uri, path)) {
      diagnostics.push(
        errorDiagnostic('CONTRACT_RESOURCE_VIEW', '资源视图或样例路径参数不匹配', target),
      );
      continue;
    }

    for (const role of stringsOf(representation['actorRoleRefs'])) {
      const hasInterface = [...capabilities.values()].some(
        (item) => item.actorRoleRef === role && item.resourceRef === resource?.id,
      );

      if (!hasInterface) {
        diagnostics.push(
          errorDiagnostic(
            'CONTRACT_REPRESENTATION_ROLE',
            '表示角色没有该资源的业务接口',
            target,
          ),
        );
      }
    }

    const { links, diagnostics: linkDiagnostics } = renderLinks(
      representation,
      capabilities,
      index,
      path,
    );
    diagnostics.push(...linkDiagnostics);
    links['self'] = { href: expand(uri, path) };

    const pagination = isRecord(representation['pagination'])
      ? representation['pagination']
      : undefined;

    if (pagination !== undefined) {
      const roles = stringsOf(representation['actorRoleRefs']);
      const readable = roles.every((role) =>
        [...capabilities.values()].some(
          (item) =>
            item.resourceRef === resource?.id &&
            item.view === 'collection' &&
            item.method === 'GET' &&
            item.actorRoleRef === role,
        ),
      );

      if (view !== 'collection' || !readable) {
        diagnostics.push(
          errorDiagnostic(
            'CONTRACT_PAGINATION',
            '分页仅用于具有对应角色集合读取能力的资源',
            target,
          ),
        );
      }

      links['next'] = {
        href: `${expand(uri, path)}?${encodeQuery({
          [String(pagination['parameter'] ?? 'page')]: String(
            pagination['nextExample'] ?? '',
          ),
        })}`,
      };
    }

    const body = structuredClone(representation['example']) as JsonObject;

    if (representation['mediaType'] === 'application/hal+json') {
      body['_links'] = links;
    } else if (recordsOf(representation['links']).length > 0 || pagination !== undefined) {
      diagnostics.push(
        gapDiagnostic(
          'CONTRACT_MEDIA_LINKS',
          `${target}.media-links`,
          'design',
          '普通 JSON 尚无约定的链接载体；选择 HAL 或补充明确媒体规范',
          target,
        ),
      );
    }

    result.push({
      ...representation,
      uri,
      example: body,
      availability: 'not_evaluated',
    });
  }

  diagnostics.push(...embedMembers(result));

  return { representations: result, diagnostics };
};

const sameParameters = (uri: string, path: JsonObject): boolean => {
  const expected = parameters(uri);
  const given = Object.keys(path);

  return (
    expected.size === given.length && given.every((name) => expected.has(name))
  );
};
