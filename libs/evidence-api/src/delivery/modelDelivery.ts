import { compileSchema } from '../schemas/jsonSchema.js';
import { errorDiagnostic, type Diagnostic } from '../diagnostics.js';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';

import { componentName } from './schemaName.js';
import { pluralSegmentOf } from './segments.js';
import {
  weaveHypermedia,
  halLinksFor,
  type HypermediaLink,
} from '../http/hateoasWeaver.js';

import type { DeliveryField, DeliveryRoute } from './routes.js';
import { buildDeliveryRoutes } from './routes.js';
import { createSegmentAllocator } from './segments.js';
import { buildDeliveryTopology, type DeliveryService } from './topology.js';

/**
 * The delivered contract, from the model's own vocabulary.
 *
 * Nothing here invents an endpoint: the routes come from {@link buildDeliveryRoutes}
 * and every path points at one modeled object. The `x-evidence-*` extensions keep
 * that linkage readable, so a reviewer can walk from a path to the Context, the
 * fulfillment pair and the rule that computes a value instead of guessing from
 * the schema.
 */

type JsonObject = Record<string, unknown>;

const SCHEMA_FOR_TYPE: Record<string, JsonObject> = {
  bool: { type: 'boolean' },
  // Match CEL's JSON boundary: numbers are safe integers, wider values are text.
  int: {
    anyOf: [
      {
        type: 'integer',
        minimum: Number.MIN_SAFE_INTEGER,
        maximum: Number.MAX_SAFE_INTEGER,
      },
      { type: 'string', pattern: '^(?:0|-?[1-9][0-9]*)$' },
    ],
  },
  uint: {
    anyOf: [
      { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      { type: 'string', pattern: '^(?:0|[1-9][0-9]*)$' },
    ],
  },
  double: { type: 'number' },
  decimal: { type: 'number' },
  money: {
    type: 'object',
    required: ['minorUnits', 'currency'],
    properties: {
      minorUnits: { type: 'integer' },
      currency: { type: 'string', minLength: 1 },
    },
  },
  string: { type: 'string' },
  bytes: { type: 'string', format: 'byte' },
  timestamp: { type: 'string', format: 'date-time' },
  date: { type: 'string', format: 'date' },
  duration: { type: 'string' },
  id: { type: 'string' },
  enum: { type: 'string' },
  list: { type: 'array', items: {} },
  map: { type: 'object', additionalProperties: true },
  dynamic: {},
};

const schemaOf = (field: DeliveryField): JsonObject =>
  SCHEMA_FOR_TYPE[field.valueType] ?? { type: 'string' };

const exampleKey = (
  route: DeliveryRoute,
  label: string,
  position: number,
): string =>
  `${componentName(route.id)}_${componentName(label)}_${position + 1}`;

const requestExampleValue = (
  route: DeliveryRoute,
  value: Record<string, unknown>,
): JsonObject =>
  Object.fromEntries(
    route.fields
      .filter((field) =>
        Object.prototype.hasOwnProperty.call(value, field.name),
      )
      .map((field) => [field.name, value[field.name]]),
  );

const responseValue = (
  route: DeliveryRoute,
  value: JsonObject,
  links: JsonObject = {},
): JsonObject =>
  route.responseShape === 'collection'
    ? {
        _links: links,
        _embedded: {
          [pluralSegmentOf(route.entityRef)]: [
            {
              ...value,
              _links: {
                self: {
                  href: route.itemPath,
                  templated: route.itemPath.includes('{'),
                },
              },
            },
          ],
        },
        total: 1,
      }
    : { ...value, _links: links };

const examplesFor = (
  route: DeliveryRoute,
  direction: 'request' | 'response',
  links: JsonObject = {},
): JsonObject =>
  Object.fromEntries(
    route.examples.map((example, position) => [
      exampleKey(route, example.label, position),
      {
        summary: example.label,
        ...(example.description === undefined
          ? {}
          : { description: example.description }),
        value:
          direction === 'request'
            ? requestExampleValue(route, example.value)
            : responseValue(route, example.value, links),
      },
    ]),
  );

const examplesForSchemas = (routes: readonly DeliveryRoute[]): JsonObject =>
  Object.fromEntries(
    routes
      .filter((route) => route.id === 'route.read.' + route.entityRef)
      .flatMap((route) =>
        route.examples.map((example, position) => [
          exampleKey(route, example.label, position),
          {
            summary: example.label,
            ...(example.description === undefined
              ? {}
              : { description: example.description }),
            value: {
              ...example.value,
              _links: { self: { href: route.itemPath } },
            },
          },
        ]),
      ),
  );

const parameterName = (path: string): string[] => {
  const names: string[] = [];

  for (const match of path.matchAll(/\{([^{}]+)\}/g)) {
    const name = match[1];

    if (name !== undefined) {
      names.push(name);
    }
  }

  return names;
};

const pathParameters = (route: DeliveryRoute): JsonObject[] =>
  parameterName(route.path).map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));

/** One `components.schemas` entry per object the contract reads or writes. */
const objectSchemas = (
  routes: readonly DeliveryRoute[],
  componentOf: (ref: string) => string,
): JsonObject => {
  const schemas: JsonObject = {};

  for (const route of routes) {
    const key = componentOf(route.entityRef);
    const properties: JsonObject = {};
    const required: string[] = [];

    for (const field of route.outputFields) {
      properties[field.name] = {
        ...schemaOf(field),
        description: field.meaning,
        'x-evidence-origin': field.reason,
        'x-evidence-caller-input': field.reason === 'caller',
        ...(field.reason === 'caller' ? {} : { readOnly: true }),
        ...(field.ruleRef === undefined
          ? {}
          : {
              'x-evidence-rule': field.ruleRef,
              'x-evidence-derived-by-rule': field.ruleRef,
            }),
      };

      if (field.required) {
        required.push(field.name);
      }
    }

    properties['_links'] = {
      type: 'object',
      required: ['self'],
      additionalProperties: {
        type: 'object',
        required: ['href'],
        properties: {
          href: { type: 'string' },
          templated: { type: 'boolean' },
          method: { type: 'string' },
        },
      },
    };
    required.push('_links');
    schemas[key] = {
      type: 'object',
      description: route.summary,
      properties,
      ...(required.length === 0 ? {} : { required }),
      ...(route.examples.length === 0
        ? {}
        : {
            examples: route.examples.map((example) => ({
              ...example.value,
              _links: { self: { href: route.itemPath } },
            })),
          }),
      additionalProperties: false,
    };
  }

  for (const route of routes.filter(
    (route) => route.responseShape === 'collection',
  )) {
    const key = componentOf(route.entityRef);
    const entity = schemas[key] as JsonObject;
    const properties = entity['properties'] as JsonObject;
    const summaryKey = key + 'Summary';
    schemas[summaryKey] = {
      type: 'object',
      properties,
      required: [
        '_links',
        ...route.outputFields
          .filter((field) => field.valueType === 'id' && field.required)
          .map((field) => field.name),
      ],
      additionalProperties: false,
    };
    schemas[key + 'Collection'] = {
      type: 'object',
      required: ['_links', '_embedded', 'total'],
      properties: {
        _links: properties['_links'],
        _embedded: {
          type: 'object',
          required: [pluralSegmentOf(route.entityRef)],
          properties: {
            [pluralSegmentOf(route.entityRef)]: {
              type: 'array',
              items: { $ref: '#/components/schemas/' + summaryKey },
            },
          },
          additionalProperties: false,
        },
        total: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    };
  }
  return schemas;
};

const requestBody = (route: DeliveryRoute): JsonObject | null => {
  if (route.method !== 'POST') {
    return null;
  }

  const properties: JsonObject = {};
  const required: string[] = [];

  for (const field of route.fields) {
    properties[field.name] = {
      ...schemaOf(field),
      description: field.meaning,
      'x-evidence-caller-input': true,
    };

    if (field.required) {
      required.push(field.name);
    }
  }

  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties,
          ...(required.length === 0 ? {} : { required }),
          // A derived value or a business time is not the caller's to send.
          additionalProperties: false,
        },
        ...(route.examples.length === 0
          ? {}
          : { examples: examplesFor(route, 'request') }),
      },
    },
  };
};

const operationOf = (
  route: DeliveryRoute,
  componentOf: (ref: string) => string,
  links: readonly HypermediaLink[],
): JsonObject => ({
  operationId: route.operationId,
  summary: route.summary,
  tags: [`context:${route.contextRef}`],
  'x-evidence-purpose': route.purpose,
  'x-evidence-context': route.contextRef,
  'x-evidence-entity': route.entityRef,
  'x-evidence-service': route.serviceId,
  'x-evidence-allowed-party-roles': route.allowedPartyRoleRefs,
  'x-evidence-exposure': route.exposure,
  ...(route.contractRef === null
    ? {}
    : { 'x-evidence-contract': route.contractRef }),
  ...(route.requestRef === null
    ? {}
    : { 'x-evidence-fulfillment-request': route.requestRef }),
  ...(route.confirmationRef === null
    ? {}
    : { 'x-evidence-fulfillment-confirmation': route.confirmationRef }),
  'x-evidence-derived': route.derived.map((field) => ({
    name: field.name,
    ruleRef: field.ruleRef ?? null,
  })),
  'x-evidence-stamped': route.stamped.map((field) => field.name),
  parameters: pathParameters(route),
  ...(requestBody(route) === null ? {} : { requestBody: requestBody(route) }),
  responses: Object.fromEntries(
    route.responses.map((response) => [
      String(response.status),
      {
        description: response.description,
        ...(response.status === 201
          ? {
              headers: {
                Location: {
                  description: '新凭证地址',
                  schema: { type: 'string', format: 'uri-reference' },
                  'x-evidence-uri-template': route.itemPath,
                },
              },
            }
          : {}),
        ...(response.status >= 200 &&
        response.status < 300 &&
        response.entityRef !== undefined
          ? {
              content: {
                'application/hal+json': {
                  ...(route.examples.length === 0
                    ? {}
                    : {
                        examples: examplesFor(
                          route,
                          'response',
                          halLinksFor(links, route.id),
                        ),
                      }),
                  'x-evidence-link-templates': halLinksFor(links, route.id),
                  schema: {
                    $ref: `#/components/schemas/${componentOf(response.entityRef)}${route.responseShape === 'collection' ? 'Collection' : ''}`,
                  },
                },
              },
            }
          : {}),
      },
    ]),
  ),
});

export interface DeliveryContract {
  openapi: '3.1.0';
  info: {
    title: string;
    version: string;
    description: string;
  };
  'x-evidence-model': string;
  paths: Record<string, JsonObject>;
  components: { schemas: JsonObject; examples: JsonObject };
  'x-evidence-services': readonly {
    id: string;
    kind: string;
    contextRef: string;
    routePrefixes: readonly string[];
    routes: readonly string[];
  }[];
}

/**
 * Builds the OpenAPI 3.1 document for one model.
 *
 * `services` is passed in so the document and the topology cannot disagree about
 * which Context serves a path.
 */
export const buildDeliveryContract = (
  document: DomainModelDocument,
  routes: readonly DeliveryRoute[] = buildDeliveryRoutes(document),
  services: readonly DeliveryService[] = buildDeliveryTopology(document, routes)
    .services,
): DeliveryContract => {
  const componentOf = componentName;
  const paths: Record<string, JsonObject> = {};
  const links = weaveHypermedia(document, routes);

  for (const route of routes) {
    const entry = paths[route.path] ?? {};
    entry[route.method.toLowerCase()] = operationOf(route, componentOf, links);
    paths[route.path] = entry;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: document.manifest.name,
      version: '6.0.0',
      description: [
        '由履约模型直接投影的契约：每个路径对应一个业务凭证时刻。',
        '派生值由服务端计算，业务时间由服务端打点，调用方不能提交或回填。',
      ].join('\n'),
    },
    'x-evidence-model': document.manifest.id,
    paths,
    components: {
      schemas: objectSchemas(routes, componentOf),
      examples: examplesForSchemas(routes),
    },
    'x-evidence-services': services.map((service) => ({
      id: service.id,
      kind: service.kind,
      contextRef: service.contextRef,
      routePrefixes: service.routePrefixes,
      routes: service.routes,
    })),
  };
};

/** Example facts must satisfy the same payload contract as a real response. */
export const validateDeliveryExamples = (
  contract: DeliveryContract,
  routes: readonly DeliveryRoute[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const route of routes) {
    if (route.examples.length === 0) continue;
    const schema = compileSchema(
      contract.components.schemas[componentName(route.entityRef)],
    );
    for (const example of route.examples) {
      if (
        !schema.validate({
          ...example.value,
          _links: { self: { href: route.itemPath } },
        })
      )
        diagnostics.push(
          errorDiagnostic(
            'API_EXAMPLE_INVALID',
            `${example.label}: ${JSON.stringify(schema.errors())}`,
            route.entityRef,
          ),
        );
    }
  }
  return diagnostics;
};

/** The deployment sketch: one container per Context, gateway in front. */
export interface DeliveryDeployment {
  version: '3';
  services: Record<
    string,
    {
      image: string;
      environment: Record<string, string>;
      dependsOn: readonly string[];
      expose: readonly string[];
      labels?: Record<string, string>;
      command?: readonly string[];
      ports?: readonly string[];
      volumes?: readonly string[];
    }
  >;
}

/**
 * A compose file that matches the topology exactly.
 *
 * It is a sketch, not a release: ports and images are placeholders, but the
 * services and the dependency direction are the projected ones, so an operator
 * reads the same boundaries the model declares.
 */
export const buildDeliveryDeployment = (
  document: DomainModelDocument,
  routes: readonly DeliveryRoute[] = buildDeliveryRoutes(document),
  services: readonly DeliveryService[] = buildDeliveryTopology(document, routes)
    .services,
  links: readonly { from: string; to: string }[] = buildDeliveryTopology(
    document,
  ).links,
): DeliveryDeployment => {
  const allocator = createSegmentAllocator(
    services.map((service) => service.contextRef),
  );
  const serviceKey = (id: string) =>
    id.replace(/^service\./, '').replaceAll('.', '-');
  return {
    version: '3',
    services: {
      gateway: {
        image: 'traefik:v3',
        environment: {},
        command: [
          '--providers.docker=true',
          '--providers.docker.exposedbydefault=false',
          '--entrypoints.web.address=:80',
        ],
        ports: ['8080:80'],
        volumes: ['/var/run/docker.sock:/var/run/docker.sock:ro'],
        dependsOn: services.map((service) => serviceKey(service.id)).sort(),
        expose: ['80'],
      },
      ...Object.fromEntries(
        services.map((service) => {
          const key = serviceKey(service.id);
          const owned = routes.filter((route) =>
            service.routes.includes(route.id),
          );
          const labels: Record<string, string> = {
            'traefik.enable': String(owned.length > 0),
            ['traefik.http.services.' + key + '.loadbalancer.server.port']:
              '8080',
          };
          // Match whole method/path templates. A child service can own a single
          // operation under another service's root without changing the URI.
          for (const [index, route] of owned.entries()) {
            const router = 'traefik.http.routers.' + key + '-' + index;
            labels[router + '.rule'] =
              'Method(`' +
              route.method +
              '`) && PathRegexp(`' +
              routePattern(route.path) +
              '`)';
            labels[router + '.service'] = key;
            labels[router + '.entrypoints'] = 'web';
          }
          return [
            key,
            {
              image:
                'evidence/' +
                allocator.segmentOf(service.contextRef) +
                ':latest',
              environment: {
                EVIDENCE_MODEL: document.manifest.id,
                EVIDENCE_CONTEXT: service.contextRef,
                EVIDENCE_SERVICE_KIND: service.kind,
                EVIDENCE_ROUTE_PREFIXES: JSON.stringify(service.routePrefixes),
                EVIDENCE_ROUTES: JSON.stringify(service.routes),
              },
              dependsOn: links
                .filter((link) => link.from === service.id)
                .map((link) => serviceKey(link.to))
                .sort(),
              expose: ['8080'],
              labels,
            },
          ];
        }),
      ),
    },
  };
};

/** Escape literals before introducing the one-segment parameter matcher. */
const routePattern = (path: string): string =>
  '^' +
  path
    .split(/(\{[^{}]+\})/g)
    .map((part) =>
      part.startsWith('{')
        ? '[^/]+'
        : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('') +
  '$';

/** The whole delivery, as one document a caller can write to disk. */
export interface ModelDelivery {
  schemaVersion: '1.0';
  modelId: string;
  modelName: string;
  modelVersion: string;
  routes: readonly DeliveryRoute[];
  hypermedia: readonly HypermediaLink[];
  services: readonly DeliveryService[];
  links: readonly {
    id: string;
    from: string;
    to: string;
    kind: string;
    mode: string;
    label: string;
    viaRef: string;
  }[];
  openapi: DeliveryContract;
  deployment: DeliveryDeployment;
  /** Things the model cannot answer, printed so the sketch is not read as a release. */
  limitations: readonly string[];
}

const limitationsOf = (
  document: DomainModelDocument,
  routes: readonly DeliveryRoute[],
): string[] => {
  const graph = createDomainGraph(document);
  const limitations: string[] = [];
  const withoutConfirmation = graph
    .fulfillmentPairs()
    .filter((pair) => pair.confirmations.length === 0);

  for (const pair of withoutConfirmation) {
    limitations.push(`${pair.request.id} 没有履约确认，未生成确认回调接口。`);
  }

  const derived = routes.flatMap((route) => route.derived);

  if (derived.length > 0) {
    limitations.push(
      `派生属性 ${derived.map((field) => field.name).join('、')} 需要服务端的规则运行时求值，本契约只声明其来源。`,
    );
  }

  return limitations;
};

/** Composes routes, topology, contract and deployment into one document. */
export const buildModelDelivery = (
  document: DomainModelDocument,
): ModelDelivery => {
  const routes = buildDeliveryRoutes(document);
  const topology = buildDeliveryTopology(document, routes);
  const services = topology.services;
  const openapi = buildDeliveryContract(document, routes, services);

  return {
    schemaVersion: '1.0',
    modelId: document.manifest.id,
    modelName: document.manifest.name,
    modelVersion: document.manifest.version,
    routes,
    hypermedia: weaveHypermedia(document, routes),
    services,
    links: topology.links.map((link) => ({
      id: link.id,
      from: link.from,
      to: link.to,
      kind: link.kind,
      mode: link.mode,
      label: link.label,
      viaRef: link.viaRef,
    })),
    openapi,
    deployment: buildDeliveryDeployment(
      document,
      routes,
      services,
      topology.links,
    ),
    limitations: limitationsOf(document, routes),
  };
};
