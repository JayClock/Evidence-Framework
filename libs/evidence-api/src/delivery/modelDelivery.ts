import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';

import { componentName } from '../openapi/openapi.js';

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
  int: { type: 'integer' },
  uint: { type: 'integer', minimum: 0 },
  double: { type: 'number' },
  decimal: { type: 'number' },
  money: { type: 'number' },
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

    for (const field of [...route.fields, ...route.derived, ...route.stamped]) {
      properties[field.name] = {
        ...schemaOf(field),
        description: field.meaning,
        'x-evidence-origin': field.reason,
        ...(field.ruleRef === undefined
          ? {}
          : { 'x-evidence-rule': field.ruleRef }),
      };

      if (field.required) {
        required.push(field.name);
      }
    }

    schemas[key] = {
      type: 'object',
      description: route.summary,
      properties,
      ...(required.length === 0 ? {} : { required }),
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
      },
    },
  };
};

const operationOf = (
  route: DeliveryRoute,
  componentOf: (ref: string) => string,
): JsonObject => ({
  operationId: route.operationId,
  summary: route.summary,
  tags: [`context:${route.contextRef}`],
  'x-evidence-purpose': route.purpose,
  'x-evidence-context': route.contextRef,
  'x-evidence-entity': route.entityRef,
  'x-evidence-service': route.serviceId,
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
        ...(response.status >= 200 &&
        response.status < 300 &&
        response.entityRef !== undefined
          ? {
              content: {
                'application/json': {
                  schema: {
                    $ref: `#/components/schemas/${componentOf(response.entityRef)}`,
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
  components: { schemas: JsonObject };
  'x-evidence-services': readonly {
    id: string;
    kind: string;
    contextRef: string;
    basePath: string;
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
  services: readonly DeliveryService[] = buildDeliveryTopology(document)
    .services,
): DeliveryContract => {
  const componentOf = componentName;
  const paths: Record<string, JsonObject> = {};

  for (const route of routes) {
    const entry = paths[route.path] ?? {};
    entry[route.method.toLowerCase()] = operationOf(route, componentOf);
    paths[route.path] = entry;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: document.manifest.name,
      version: document.manifest.version,
      description: [
        '由履约模型直接投影的契约：每个路径对应一个业务凭证时刻。',
        '派生值由服务端计算，业务时间由服务端打点，调用方不能提交或回填。',
      ].join('\n'),
    },
    'x-evidence-model': document.manifest.id,
    paths,
    components: { schemas: objectSchemas(routes, componentOf) },
    'x-evidence-services': services.map((service) => ({
      id: service.id,
      kind: service.kind,
      contextRef: service.contextRef,
      basePath: `/${service.lane}`,
    })),
  };
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
  services: readonly DeliveryService[] = buildDeliveryTopology(document)
    .services,
  links: readonly { from: string; to: string }[] = buildDeliveryTopology(
    document,
  ).links,
): DeliveryDeployment => {
  const allocator = createSegmentAllocator(
    services.map((service) => service.contextRef),
  );
  const pathsByService = new Map<string, Set<string>>();

  for (const route of routes) {
    const bucket = pathsByService.get(route.serviceId) ?? new Set<string>();
    bucket.add(route.path.split('/')[1] ?? '');
    pathsByService.set(route.serviceId, bucket);
  }

  return {
    version: '3',
    services: Object.fromEntries(
      services.map((service) => [
        service.id.replace(/^service\./, ''),
        {
          image: `evidence/${allocator.segmentOf(service.contextRef)}:latest`,
          environment: {
            EVIDENCE_MODEL: document.manifest.id,
            EVIDENCE_CONTEXT: service.contextRef,
            EVIDENCE_SERVICE_KIND: service.kind,
            EVIDENCE_BASE_PATH: `/${service.lane}`,
          },
          dependsOn: links
            .filter((link) => link.from === service.id)
            .map((link) => link.to.replace(/^service\./, ''))
            .sort(),
          expose: [...(pathsByService.get(service.id) ?? [])]
            .filter((path) => path !== '')
            .sort()
            .map((path) => `/${path}`),
        },
      ]),
    ),
  };
};

/** The whole delivery, as one document a caller can write to disk. */
export interface ModelDelivery {
  schemaVersion: '1.0';
  modelId: string;
  modelName: string;
  modelVersion: string;
  routes: readonly DeliveryRoute[];
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
  const topology = buildDeliveryTopology(document);
  const services = topology.services;
  const openapi = buildDeliveryContract(document, routes, services);

  return {
    schemaVersion: '1.0',
    modelId: document.manifest.id,
    modelName: document.manifest.name,
    modelVersion: document.manifest.version,
    routes,
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
