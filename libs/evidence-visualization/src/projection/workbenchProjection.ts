import {
  EMPTY_GRAPH_LAYOUT,
  type SerializableGraphLayout,
} from '@evidence-poc/evidence-canvas-interaction';

import type { BusinessStoryProjection } from '@evidence-poc/evidence-agent';
import {
  projectWorkbenchStories,
  type WorkbenchStory,
} from './storyProjection.js';

/**
 * The projection the offline workbench renders.
 *
 * The page carries business objects and their formal references, nothing else.
 * Raw documents, file paths, interview prose, material sources, commands, input
 * digests and Git history stay out: a reader who is allowed to see the model is
 * not automatically allowed to see where it came from.
 *
 * Every field below is whitelisted by name rather than copied from a source
 * document, so a new source key can never leak into the page by accident.
 */

type JsonObject = Record<string, unknown>;

/** One node the graph draws and the tree lists. */
export interface WorkbenchNode {
  id: string;
  label: string;
  /** `context`, `evidence`, `participant`, `role`, `rule`, `attribute`, … */
  group: string;
  kind: string;
  /** Parent object for the tree; empty for a root. */
  parent: string;
  contextRef?: string;
  [key: string]: unknown;
}

export interface WorkbenchEdge {
  from: string;
  to: string;
  label: string;
}

/** What the page shows about the checks behind it. */
export interface WorkbenchValidation {
  /** Formal exports pass the collector gate; authoring previews may be invalid. */
  fm: boolean;
  consistent: unknown;
  complete: unknown;
  scopeRefs: unknown;
  contextRefs: unknown;
  gaps: unknown;
  /** Whether the API contract is complete; null when there is no API. */
  api: unknown;
  runtime: false;
}

/** One service the model splits into, as the page lists it. */
export interface WorkbenchService {
  id: string;
  name: string;
  /** `channel`, `fulfillment`, `domain` or `capability`. */
  kind: string;
  lane: string;
  contextRef: string;
  supplies: readonly string[];
  consumes: readonly string[];
  notes: string;
  /** Routes this service serves, as `GET /path` lines with their moment. */
  routes: readonly { method: string; path: string; summary: string }[];
}

/** How two services talk, and what crosses the boundary. */
export interface WorkbenchDeliveryLink {
  id: string;
  from: string;
  to: string;
  kind: string;
  /** `sync` or `async`; an external confirmation arrives as a callback. */
  mode: string;
  label: string;
  viaRef: string;
}

/** The delivery view: what the model becomes when it is deployed. */
export interface WorkbenchDelivery {
  services: readonly WorkbenchService[];
  links: readonly WorkbenchDeliveryLink[];
  /** What the model cannot answer yet, printed instead of guessed. */
  limitations: readonly string[];
}

export interface WorkbenchCounts {
  contracts: number;
  entities: number;
  rules: number;
  capabilities: number;
}

export interface WorkbenchData {
  title: string;
  nodes: WorkbenchNode[];
  edges: WorkbenchEdge[];
  /** Edge targets that no node defines, so a dangling reference stays visible. */
  unresolved: string[];
  counts: WorkbenchCounts;
  validation: WorkbenchValidation;
  /** Null when the page was generated without a delivery projection. */
  delivery: WorkbenchDelivery | null;
  /** Precomputed business scenes; playback never calls an agent or a server. */
  readonly stories: readonly WorkbenchStory[];
  /**
   * Where the canvas places every business object and relationship.
   *
   * The placement is computed by the layout library the desktop canvas uses, so
   * a reader sees the drawing the modeler saw rather than a second opinion.
   */
  layout: SerializableGraphLayout;
  generatedAt: string;
  /** Optional, explicitly selected baseline; never inferred from an undo stack. */
  diff?: import('./workbenchDiff.js').WorkbenchDiffSummary;
}

/** The FM document as `fm_model.compiled_document` shapes it. */
export interface CompiledModel {
  schemaVersion: string;
  model: JsonObject;
  entities: readonly JsonObject[];
  relationships: readonly JsonObject[];
  rules: readonly JsonObject[];
}

/** What the page reads from the API projection. */
export interface WorkbenchApiInput {
  resources?: readonly JsonObject[];
  bindings?: readonly JsonObject[];
  capabilities?: readonly JsonObject[];
  http?: {
    complete?: unknown;
    representations?: readonly JsonObject[];
    operations?: readonly JsonObject[];
    journeys?: readonly JsonObject[];
  } | null;
}

/** The check report fields the page prints, taken from the FM check result. */
export interface WorkbenchCheckInput {
  consistent?: unknown;
  complete?: unknown;
  scopeRefs?: unknown;
  contextRefs?: unknown;
  gaps?: unknown;
}

export interface WorkbenchProjectionInput {
  /** Compiled FM document: `model`, `entities`, `relationships`, `rules`. */
  model: CompiledModel;
  /**
   * Placement of the model on the canvas; see `workbenchLayoutOf`.
   *
   * A caller that projects from a compiled document alone has no canvas to
   * describe, so the page states an empty drawing instead of inventing one.
   */
  layout?: SerializableGraphLayout;
  api?: WorkbenchApiInput | null;
  delivery?: WorkbenchDelivery | null;
  stories?: readonly BusinessStoryProjection[];
  check: WorkbenchCheckInput;
  /** False only for explicitly labelled authoring previews. */
  checked?: boolean;
  /** ISO timestamp the page prints as its generation time. */
  generatedAt?: string;
}

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `{key: value[key] …}` for the keys the page may show, in the given order. */
const select = (value: JsonObject, keys: string): JsonObject => {
  const picked: JsonObject = {};

  for (const key of keys.split(' ')) {
    if (key in value) {
      picked[key] = value[key];
    }
  }

  return picked;
};

const listOf = (value: unknown): readonly JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const idOf = (value: JsonObject): string => {
  const id = value['id'];

  if (typeof id !== 'string' || id === '') {
    throw new Error('对象缺少 id，无法投影');
  }

  return id;
};

/** Field lists a representation or a request carries. */
const fieldRows = (fields: unknown): JsonObject[] =>
  listOf(fields).map((field) => {
    const schema = isRecord(field['schema']) ? field['schema'] : {};

    return {
      ...select(field, 'name required fmAttributeRef origin'),
      valueType: schema['type'] ?? '',
    };
  });

/**
 * Projects the checked model and an optional API contract.
 *
 * Node ids are the formal business ids — `request.payment`, `request.payment#amount`
 * — so a reader can quote one and find it in the source. Edges are labelled in
 * business language because the page is read by the business, not by a parser.
 */
export const projectWorkbenchData = ({
  model,
  layout = EMPTY_GRAPH_LAYOUT,
  api = null,
  delivery = null,
  stories = [],
  check,
  generatedAt,
  checked = true,
}: WorkbenchProjectionInput): WorkbenchData => {
  const nodes = new Map<string, WorkbenchNode>();
  const edges: WorkbenchEdge[] = [];
  const edgeKeys = new Set<string>();

  const add = (value: JsonObject, group: string, title = ''): WorkbenchNode => {
    const identity = idOf(value);

    if (nodes.has(identity)) {
      throw new Error(`重复对象 ID：${identity}`);
    }

    // `parent` is where the tree nests the node; `contextRef` is the Context the
    // object belongs to, which only an owned object has. A Context names its
    // parent instead, so copying that into `contextRef` would claim an ownership
    // the model never declared.
    const ownContext =
      typeof value['contextRef'] === 'string' ? value['contextRef'] : '';
    const contextRef =
      ownContext !== ''
        ? ownContext
        : typeof value['parentContextRef'] === 'string'
          ? value['parentContextRef']
          : '';
    const label = title !== '' ? title : value['label'];
    const node: WorkbenchNode = {
      id: identity,
      label: typeof label === 'string' && label !== '' ? label : identity,
      group,
      kind: typeof value['kind'] === 'string' ? value['kind'] : group,
      parent: contextRef,
      ...(ownContext === '' ? {} : { contextRef: ownContext }),
    };

    nodes.set(identity, node);

    return node;
  };

  const link = (start: string, target: unknown, label: string): void => {
    if (typeof target !== 'string' || target === '') {
      return;
    }

    const key = `${start}\u0000${target}\u0000${label}`;

    if (edgeKeys.has(key)) {
      return;
    }

    edgeKeys.add(key);
    edges.push({ from: start, to: target, label });
  };

  for (const entity of model.entities) {
    const category = entity['category'];
    const node = add(
      entity,
      typeof category === 'string' ? category : 'entity',
    );

    link(
      node.id,
      entity['contextRef'] ?? entity['parentContextRef'],
      '所属上下文',
    );

    for (const ref of Array.isArray(entity['roleRefs'])
      ? entity['roleRefs']
      : []) {
      link(node.id, ref, '合同责任角色');
    }

    link(node.id, entity['responsibleRoleRef'], '凭证责任方');

    for (const ref of Array.isArray(entity['rootRefs'])
      ? entity['rootRefs']
      : []) {
      link(node.id, ref, '边界根对象');
    }

    for (const attribute of listOf(entity['attributes'])) {
      const name = attribute['name'];
      const identity = `${node.id}#${String(name)}`;
      const field = add(
        {
          id: identity,
          label: attribute['label'] ?? name,
        },
        'attribute',
      );

      Object.assign(
        field,
        select(attribute, 'name valueType required keyData meaning'),
      );
      field['parent'] = node.id;
      link(node.id, identity, '业务属性');
      link(identity, attribute['derivedByRuleRef'], '由规则计算');
    }
  }

  for (const relationship of model.relationships) {
    const node = add(relationship, 'relationship');

    Object.assign(
      node,
      select(
        relationship,
        'sourceRef targetRef sourceCardinality targetCardinality',
      ),
    );
    link(node.id, relationship['sourceRef'], '关系起点');
    link(node.id, relationship['targetRef'], '关系终点');

    const source = relationship['sourceRef'];
    const label = relationship['label'] ?? relationship['kind'];

    if (typeof source === 'string' && source !== '') {
      link(
        source,
        relationship['targetRef'],
        typeof label === 'string' && label !== '' ? label : '关系',
      );
    }
  }

  for (const rule of model.rules) {
    const node = add(rule, 'rule');

    Object.assign(node, select(rule, 'description expression resultType'));

    const bindings = isRecord(rule['bindings']) ? rule['bindings'] : {};
    const rows: JsonObject[] = Object.entries(bindings)
      .filter(([, binding]) => isRecord(binding))
      .map(([alias, binding]) => ({
        alias,
        ...select(binding as JsonObject, 'ref cardinality type'),
      }));

    node['bindings'] = rows;
    link(node.id, rule['contextRef'], '适用上下文');

    for (const binding of rows) {
      link(node.id, binding['ref'], `读取 · ${binding.alias}`);
    }

    const target = rule['target'];

    if (isRecord(target)) {
      link(
        node.id,
        `${String(target['entityRef'])}#${String(target['attribute'])}`,
        '计算结果',
      );
    }
  }

  if (api !== null) {
    const http = isRecord(api.http) ? api.http : {};

    for (const resource of api.resources ?? []) {
      const node = add(
        resource,
        'resource',
        typeof resource['businessName'] === 'string'
          ? resource['businessName']
          : '',
      );

      node['shape'] = resource['shape'] ?? null;
      link(node.id, resource['entityRef'], '业务对象');
      link(node.id, resource['parentRef'], '父资源');
    }

    for (const binding of api.bindings ?? []) {
      const node = add(binding, 'binding');

      node['kind'] =
        typeof binding['kind'] === 'string' ? binding['kind'] : 'binding';

      for (const [key, label] of [
        ['entityRef', '业务对象'],
        ['roleRef', '绑定角色'],
        ['resourceRef', '绑定资源'],
        ['relationshipRef', '业务关系'],
        ['scopeResourceRef', '实例范围'],
        ['parentResourceRef', '父资源'],
        ['childResourceRef', '子资源'],
      ] as const) {
        link(node.id, binding[key], label);
      }
    }

    for (const representation of listOf(http['representations'])) {
      const node = add(representation, 'representation');

      node['fields'] = fieldRows(representation['fields']);
      link(node.id, representation['resourceRef'], '表示资源');

      for (const field of node['fields'] as JsonObject[]) {
        link(node.id, field['fmAttributeRef'], '表示字段');
      }
    }

    const operations = new Map<string, JsonObject>(
      listOf(http['operations']).map((operation) => [
        String(operation['capabilityRef']),
        operation,
      ]),
    );

    for (const capability of api.capabilities ?? []) {
      const node = add(
        capability,
        'capability',
        typeof capability['businessCapability'] === 'string'
          ? capability['businessCapability']
          : '',
      );

      Object.assign(node, select(capability, 'method uri'));
      link(node.id, capability['actorRoleRef'], '调用角色（不代表已授权）');
      link(node.id, capability['resourceRef'], '操作资源');

      const effect = capability['effect'];

      if (isRecord(effect)) {
        link(node.id, effect['targetRef'], '作用对象');
      }

      for (const ref of Array.isArray(capability['bindingRefs'])
        ? capability['bindingRefs']
        : []) {
        link(node.id, ref, '实例绑定');
      }

      for (const binding of listOf(capability['ruleBindings'])) {
        link(node.id, binding['ruleRef'], '应用规则');
      }

      const operation = operations.get(node.id) ?? {};
      const request = isRecord(operation['request'])
        ? operation['request']
        : {};

      node['fields'] = fieldRows(request['fields']);

      for (const field of node['fields'] as JsonObject[]) {
        link(node.id, field['fmAttributeRef'], '请求字段');
      }

      node['responses'] = listOf(operation['responses']).map((response) =>
        select(response, 'status description representationRef'),
      );

      for (const response of node['responses'] as JsonObject[]) {
        link(node.id, response['representationRef'], '响应表示');
      }

      const idempotency = isRecord(operation['idempotency'])
        ? operation['idempotency']
        : {};
      const concurrency = isRecord(operation['concurrency'])
        ? operation['concurrency']
        : {};

      node['idempotency'] = idempotency['mode'] ?? null;
      node['concurrency'] = concurrency['mode'] ?? null;
    }

    for (const journey of listOf(http['journeys'])) {
      const node = add(journey, 'journey');

      node['steps'] = listOf(journey['steps']).map((step) =>
        select(step, 'id capabilityRef expectStatus status'),
      );
      link(node.id, journey['actorRoleRef'], '旅程调用角色');

      for (const step of node['steps'] as JsonObject[]) {
        link(node.id, step['capabilityRef'], 'HTTP 步骤（静态）');
      }
    }
  }

  if (delivery !== null) {
    for (const service of delivery.services) {
      const node = add({ id: service.id, label: service.name }, 'service');

      Object.assign(node, {
        kind: service.kind,
        ...select(
          service as unknown as JsonObject,
          'lane supplies consumes notes',
        ),
      });
      node['routes'] = service.routes.map((route) => ({ ...route }));
      // A service is not a business object owned by the Context it serves, so it
      // sits at the root of the tree and points at its Context with an edge.
      node['parent'] = '';
      delete node['contextRef'];
      link(node.id, service.contextRef, '部署边界');
    }

    for (const edge of delivery.links) {
      // A link between two services is drawn as the boundary crossing it is;
      // both ends are service nodes, so nothing has to be invented.
      link(
        edge.from,
        edge.to,
        edge.mode === 'async' ? `${edge.label}（异步）` : edge.label,
      );
    }
  }

  const name = isRecord(model.model) ? model.model['name'] : undefined;

  return {
    title: typeof name === 'string' && name !== '' ? name : '业务模型',
    nodes: [...nodes.values()],
    edges,
    unresolved: [
      ...new Set(
        edges.filter((edge) => !nodes.has(edge.to)).map((edge) => edge.to),
      ),
    ].sort(),
    counts: {
      contracts: [...nodes.values()].filter(
        (node) => node.group === 'context' && node.kind === 'contract',
      ).length,
      entities: model.entities.length,
      rules: model.rules.length,
      capabilities: api?.capabilities?.length ?? 0,
    },
    validation: {
      fm: checked,
      consistent: check.consistent ?? null,
      complete: check.complete ?? null,
      scopeRefs: check.scopeRefs ?? null,
      contextRefs: check.contextRefs ?? null,
      gaps: check.gaps ?? null,
      api:
        api === null ? null : isRecord(api.http) ? api.http['complete'] : null,
      runtime: false,
    },
    delivery,
    stories: projectWorkbenchStories(stories),
    layout,
    generatedAt: generatedAt ?? new Date().toISOString(),
  };
};
