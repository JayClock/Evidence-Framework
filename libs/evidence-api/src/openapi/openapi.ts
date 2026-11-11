import { sortedKeys } from '../canonicalJson.js';
import { compareText, sortedText } from '../order.js';
import type { ProjectedCapability } from '../projection/capabilities.js';
import type { Payload } from '../http/contractPayloads.js';
import { payloadOf } from '../http/contractPayloads.js';

/**
 * The OpenAPI 3.1 document the design delivers.
 *
 * It is a delivery contract, not a source: nothing here adds a capability the
 * projection did not prove. The `x-fm-*` extensions carry the linkage back to the
 * model and the design, so a reviewer can walk from a path to the business object
 * it represents.
 */

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordsOf = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const PATH_PARAMETER = /\{([^{}]+)\}/g;

/** A schema component name: dots and punctuation folded into underscores. */
export const componentName = (identifier: string): string =>
  identifier.replaceAll('.', '_').replace(/[^A-Za-z0-9._-]/g, '_');

const canonical = (value: unknown): unknown => sortedKeys(value);

/** The object schema a declared body implies. */
const payloadSchemaOf = (payload: Payload): JsonObject => {
  const schema: JsonObject = {
    type: 'object',
    properties: Object.fromEntries(
      payload.fields.map((field) => [field.name, canonical(field.schema)]),
    ),
    additionalProperties: false,
  };
  const required = payload.fields
    .filter((field) => field.required === true)
    .map((field) => field.name);

  if (required.length > 0) {
    schema['required'] = required;
  }

  return schema;
};

const linkSchema = (example: JsonObject): JsonObject => {
  const properties = Object.fromEntries(
    Object.keys(example)
      .sort(compareText)
      .map((rel) => [
        rel,
        {
          type: 'object',
          properties: { href: { type: 'string', format: 'uri-reference' } },
          required: ['href'],
          additionalProperties: true,
        },
      ]),
  );

  return {
    type: 'object',
    properties,
    required: Object.keys(properties).sort(compareText),
    additionalProperties: true,
  };
};

const representationSchema = (representation: JsonObject): JsonObject => {
  const schema = payloadSchemaOf(payloadOf(representation));
  const required = [...(Array.isArray(schema['required']) ? schema['required'] : [])];
  const example = isRecord(representation['example']) ? representation['example'] : {};
  const properties = schema['properties'] as JsonObject;

  if (representation['mediaType'] === 'application/hal+json') {
    properties['_links'] = linkSchema(
      isRecord(example['_links']) ? example['_links'] : {},
    );
    required.push('_links');

    if ('_embedded' in example) {
      properties['_embedded'] = { type: 'object', additionalProperties: true };
      required.push('_embedded');
    }
  }

  if (required.length > 0) {
    schema['required'] = required;
  }

  return schema;
};

/**
 * One operation id per route, or the single capability when there is only one.
 *
 * Two roles reading the same route are one operation: OpenAPI has no notion of
 * per-role paths, and inventing one would misdescribe the API.
 */
const operationIds = (
  operations: readonly JsonObject[],
): Map<string, string> => {
  const grouped = new Map<string, JsonObject[]>();

  for (const operation of operations) {
    const key = `${String(operation['uri'])}\u0000${String(operation['method']).toLowerCase()}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(operation);
    grouped.set(key, bucket);
  }

  const result = new Map<string, string>();

  for (const [key, variants] of [...grouped.entries()].sort(([left], [right]) =>
    compareText(left, right),
  )) {
    const refs = sortedText(variants.map((item) => String(item['capabilityRef'])));
    const [uri, method] = key.split('\u0000') as [string, string];
    const id =
      refs.length === 1
        ? (refs[0] as string)
        : componentName(`${method}_${uri.replace(/^\/+|\/+$/g, '') || 'root'}`);

    for (const ref of refs) {
      result.set(ref, id);
    }
  }

  return result;
};

const runtimeExpression = (source: JsonObject): string =>
  source['kind'] === 'path'
    ? `$request.path.${String(source['name'])}`
    : `$response.body#/${String(source['name'])}`;

const responseLinks = (
  representation: JsonObject,
  ids: ReadonlyMap<string, string>,
): JsonObject => {
  const result: JsonObject = {};

  for (const link of recordsOf(representation['links']).sort((left, right) =>
    compareText(String(left['rel']), String(right['rel'])),
  )) {
    const operationId = ids.get(String(link['capabilityRef'] ?? ''));

    if (operationId === undefined) {
      continue;
    }

    const bindings = isRecord(link['parameterBindings'])
      ? link['parameterBindings']
      : {};
    const value: JsonObject = {
      operationId,
      parameters: Object.fromEntries(
        Object.entries(bindings)
          .sort(([left], [right]) => compareText(left, right))
          .map(([name, source]) => [
            name,
            runtimeExpression(isRecord(source) ? source : {}),
          ]),
      ),
      'x-fm-link-kind': link['kind'],
    };

    if (link['whenRuleRef'] !== undefined) {
      value['description'] =
        '仅当 FM 规则允许时由运行时表示提供；OpenAPI 不执行该规则。';
      value['x-fm-when-rule-ref'] = link['whenRuleRef'];
    }

    result[String(link['rel'])] = value;
  }

  return result;
};

const headersOf = (headers: JsonObject): JsonObject =>
  Object.fromEntries(
    [...Object.entries(headers)]
      .sort(([left], [right]) =>
        compareText(left.toLowerCase(), right.toLowerCase()),
      )
      .map(([name, value]) => [
        name,
        { schema: { type: 'string' }, example: String(value) },
      ]),
  );

const responseOf = (
  response: JsonObject,
  representations: ReadonlyMap<string, JsonObject>,
  ids: ReadonlyMap<string, string>,
): JsonObject => {
  const value: JsonObject = { description: response['description'] };
  const headers = isRecord(response['headers']) ? response['headers'] : {};

  if (Object.keys(headers).length > 0) {
    value['headers'] = headersOf(headers);
  }

  const reference = String(response['representationRef'] ?? '');
  const representation = representations.get(reference);

  if (representation !== undefined) {
    const name = componentName(String(representation['id']));
    value['content'] = {
      [String(representation['mediaType'])]: {
        schema: { $ref: `#/components/schemas/${name}` },
        example: canonical(representation['example']),
      },
    };

    const links = responseLinks(representation, ids);

    if (Object.keys(links).length > 0) {
      value['links'] = links;
    }
  }

  const resultRef = response['resultCapabilityRef'];
  const resultId =
    typeof resultRef === 'string' ? ids.get(resultRef) : undefined;

  if (resultId !== undefined) {
    const links = isRecord(value['links']) ? value['links'] : {};
    links['result'] = {
      operationId: resultId,
      description: '异步结果位置由响应 Location 提供。',
      'x-location-header': 'Location',
    };
    value['links'] = links;
  }

  return value;
};

const parametersOf = (
  operation: JsonObject,
  representations: ReadonlyMap<string, JsonObject>,
): JsonObject[] => {
  const result: JsonObject[] = [
    ...[...String(operation['uri']).matchAll(PATH_PARAMETER)].map((match) => ({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    })),
  ];
  const idempotency = isRecord(operation['idempotency']) ? operation['idempotency'] : {};
  const concurrency = isRecord(operation['concurrency']) ? operation['concurrency'] : {};

  if (idempotency['mode'] === 'key') {
    result.push({
      name: idempotency['header'],
      in: 'header',
      required: true,
      schema: { type: 'string' },
      description: idempotency['reason'],
    });
  }

  if (concurrency['mode'] === 'if-match') {
    result.push({
      name: 'If-Match',
      in: 'header',
      required: true,
      schema: { type: 'string' },
      description: concurrency['reason'],
    });
  }

  const validators = new Set<string>();

  for (const response of recordsOf(operation['responses'])) {
    const reference = response['representationRef'];

    if (typeof reference !== 'string') {
      continue;
    }

    const representation = representations.get(reference);
    const cache = isRecord(representation?.['cache']) ? representation?.['cache'] : {};
    const validator = cache['validator'];

    if (typeof validator === 'string') {
      validators.add(validator);
    }
  }

  const conditional: Record<string, string> = {
    etag: 'If-None-Match',
    'last-modified': 'If-Modified-Since',
  };

  if (operation['method'] === 'GET') {
    for (const validator of sortedText(validators)) {
      result.push({
        name: conditional[validator],
        in: 'header',
        required: false,
        schema: { type: 'string' },
        description: '缓存条件读取；省略时执行普通读取。',
      });
    }
  }

  return result;
};

const operationOf = (
  variants: readonly JsonObject[],
  capabilities: ReadonlyMap<string, ProjectedCapability>,
  representations: ReadonlyMap<string, JsonObject>,
  ids: ReadonlyMap<string, string>,
): JsonObject => {
  const sorted = [...variants].sort((left, right) =>
    compareText(String(left['capabilityRef']), String(right['capabilityRef'])),
  );
  const representative = sorted[0] as JsonObject;
  const refs = sorted.map((item) => String(item['capabilityRef']));
  const roles = sortedText(sorted.map((item) => String(item['actorRoleRef'])));
  const summaries = refs
    .map((ref) => capabilities.get(ref))
    .filter((item): item is ProjectedCapability => item !== undefined)
    .map((item) => String(item['businessCapability'] ?? ''));
  const value: JsonObject = {
    operationId: ids.get(refs[0] as string),
    summary: summaries.filter((item) => item !== '').join(' / ') || 'API capability',
    parameters: parametersOf(representative, representations),
    responses: Object.fromEntries(
      recordsOf(representative['responses'])
        .sort((left, right) => Number(left['status']) - Number(right['status']))
        .map((response) => [
          String(response['status']),
          responseOf(response, representations, ids),
        ]),
    ),
    'x-fm-capability-refs': refs,
    'x-actor-role-refs': roles,
    'x-binding-refs': sortedText(
      new Set(sorted.flatMap((item) => stringsOf(item['bindingRefs']))),
    ),
    'x-fm-rule-bindings': canonical(representative['ruleBindings'] ?? []),
    'x-fm-operation-variants': sorted.map((item) => ({
      capabilityRef: item['capabilityRef'],
      actorRoleRef: item['actorRoleRef'],
    })),
  };
  const request = payloadOf(representative['request']);

  if (request.fields.length > 0) {
    value['requestBody'] = {
      required: request.fields.some((field) => field.required === true),
      content: {
        [request.mediaType]: {
          schema: payloadSchemaOf(request),
          example: canonical(request.example),
        },
      },
    };
  }

  return value;
};

/** The OpenAPI 3.1 document, derived from a projection and nothing else. */
export const buildOpenApi = (projection: JsonObject): JsonObject => {
  const http = isRecord(projection['http']) ? projection['http'] : {};
  const representations = new Map(
    recordsOf(http['representations']).map(
      (item) => [String(item['id']), item] as const,
    ),
  );
  const capabilities = new Map(
    recordsOf(projection['capabilities']).map(
      (item) => [String(item['id']), item as unknown as ProjectedCapability] as const,
    ),
  );
  const operations = recordsOf(http['operations']);
  const ids = operationIds(operations);
  const grouped = new Map<string, JsonObject[]>();

  for (const operation of operations) {
    const key = `${String(operation['uri'])}\u0000${String(operation['method']).toLowerCase()}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(operation);
    grouped.set(key, bucket);
  }

  const paths: JsonObject = {};

  for (const [key, variants] of [...grouped.entries()].sort(([left], [right]) =>
    compareText(left, right),
  )) {
    const [uri, method] = key.split('\u0000') as [string, string];
    const path = isRecord(paths[uri]) ? (paths[uri] as JsonObject) : {};
    path[method] = operationOf(variants, capabilities, representations, ids);
    paths[uri] = path;
  }

  return {
    openapi: '3.1.0',
    info: { title: projection['apiId'], version: 'generated' },
    paths,
    components: {
      schemas: Object.fromEntries(
        [...representations.entries()].map(([identifier, representation]) => [
          componentName(identifier),
          representationSchema(representation),
        ]),
      ),
    },
    'x-generated-from': 'evidence-api projection.json',
    'x-evidence-api-design-schema-version': projection['schemaVersion'],
    'x-runtime-validated': http['runtimeValidated'] === true,
  };
};
