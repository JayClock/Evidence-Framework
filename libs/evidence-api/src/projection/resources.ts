import type { DesignDocument } from '../loader/apiLoader.js';
import type { FmIndex } from '../adapter/fmAdapter.js';
import {
  errorDiagnostic,
  gapDiagnostic,
  type Diagnostic,
} from '../diagnostics.js';
import { validateCardinality } from './cardinality.js';

/**
 * Turning business objects into addressable resources.
 *
 * A resource is a path segment plus an identity: a collection carries its own id
 * parameter, a singleton is located by its parent. Both decisions have to be
 * proved — one by the model's cardinality, the other by a decision the design
 * records — because a URL is a promise about how an instance is found, and a
 * guessed one is a promise nobody can keep.
 */

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const recordsOf = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const idOf = (item: JsonObject): string => String(item['id']);

/** A resource with the addresses and path parameters it resolves to. */
export interface ProjectedResource extends JsonObject {
  id: string;
  entityRef: string;
  segment: string;
  shape: 'singleton' | 'collection';
  uris: Readonly<Record<string, string>>;
  parameters: readonly string[];
}

/** The Context an entity belongs to, or undefined when it is a Context itself. */
const contextRefOf = (entity: JsonObject | undefined): string | undefined =>
  entity === undefined ? undefined : asString(entity['contextRef']);

/** Attributes of one entity, by name, for identity checks. */
const hasAttribute = (
  entity: JsonObject | undefined,
  attributeName: string,
): boolean =>
  entity !== undefined &&
  recordsOf(entity['attributes']).some(
    (attribute) => attribute['name'] === attributeName,
  );

/**
 * True when a Contract collection hangs off the Participant Party that plays the
 * caller, which is the one case where nesting crosses a Context boundary.
 */
const partyScopedContractCollection = (
  parentEntity: JsonObject | undefined,
  childEntity: JsonObject | undefined,
  childResource: JsonObject,
): boolean =>
  parentEntity !== undefined &&
  parentEntity['category'] === 'participant' &&
  parentEntity['kind'] === 'party' &&
  childEntity !== undefined &&
  childEntity['category'] === 'evidence' &&
  childEntity['kind'] === 'contract' &&
  childResource['shape'] === 'collection';

export interface BuildResourcesResult {
  resources: ProjectedResource[];
  diagnostics: Diagnostic[];
}

/**
 * Projects every declared resource, parents before children.
 *
 * The order is by id but a child is visited through its parent, so a nested path
 * is built from the parent's address instead of from a string prefix.
 */
export const buildResources = (
  design: DesignDocument,
  index: FmIndex,
): BuildResourcesResult => {
  const diagnostics: Diagnostic[] = [];
  const configured = new Map(
    recordsOf(design['resources']).map((item) => [idOf(item), item] as const),
  );
  const bindings = new Map(
    recordsOf(design['bindings']).map((item) => [idOf(item), item] as const),
  );
  const result = new Map<string, ProjectedResource>();
  const visiting = new Set<string>();

  const visit = (resourceId: string): ProjectedResource | null => {
    const existing = result.get(resourceId);

    if (existing !== undefined) {
      return existing;
    }

    const resource = configured.get(resourceId);

    if (resource === undefined) {
      return null;
    }

    if (visiting.has(resourceId)) {
      diagnostics.push(
        errorDiagnostic('RESOURCE_CYCLE', '资源父子图存在循环', resourceId),
      );

      return null;
    }

    visiting.add(resourceId);

    const entityRef = String(resource['entityRef'] ?? '');
    const entity = index.entities.get(entityRef) as JsonObject | undefined;

    if (entity === undefined) {
      diagnostics.push(
        errorDiagnostic(
          'FM_REF_NOT_FOUND',
          `资源引用不存在: ${entityRef}`,
          resourceId,
        ),
      );
    } else if (entity['category'] !== 'evidence' && entity['category'] !== 'participant') {
      diagnostics.push(
        errorDiagnostic(
          'RESOURCE_ENTITY_INVALID',
          '资源只能表示 Evidence 或有来源的 Participant',
          resourceId,
          undefined,
          [entityRef],
        ),
      );
    }

    const identity = isRecord(resource['identity']) ? resource['identity'] : {};
    const identityKind = asString(identity['kind']);
    const shape = resource['shape'] === 'singleton' ? 'singleton' : 'collection';

    if ((shape === 'singleton') !== (identityKind === 'parent_scoped')) {
      diagnostics.push(
        errorDiagnostic(
          'RESOURCE_IDENTITY_CONFLICT',
          '单例由父实例定位，集合实例须有自身定位参数',
          resourceId,
        ),
      );
    }

    if (identityKind === 'fm_attribute') {
      const attributeRef = String(identity['attributeRef'] ?? '');
      const separator = attributeRef.indexOf('#');
      const ownerRef = separator < 0 ? attributeRef : attributeRef.slice(0, separator);
      const attributeName = separator < 0 ? '' : attributeRef.slice(separator + 1);

      if (!hasAttribute(index.entities.get(ownerRef) as JsonObject | undefined, attributeName)) {
        diagnostics.push(
          errorDiagnostic(
            'FM_REF_NOT_FOUND',
            `身份属性不存在: ${attributeRef}`,
            resourceId,
          ),
        );
      }

      if (ownerRef !== entityRef) {
        diagnostics.push(
          errorDiagnostic(
            'IDENTITY_ENTITY_MISMATCH',
            '身份属性必须属于资源表示的 FM 对象',
            resourceId,
          ),
        );
      }
    } else if (identityKind === 'api_resource_id') {
      const decisionRef = asString(identity['decisionRef']);
      const decision = recordsOf(design['decisions']).find(
        (item) => item['id'] === decisionRef,
      );

      if (decision === undefined) {
        diagnostics.push(
          errorDiagnostic(
            'DESIGN_REF_NOT_FOUND',
            `身份决定不存在: ${String(decisionRef ?? '')}`,
            resourceId,
          ),
        );
      }
    }

    let parent: ProjectedResource | null = null;
    const parameters: string[] = [];
    const parentRef = asString(resource['parentRef']);

    if (parentRef !== undefined) {
      parent = visit(parentRef);

      if (parent === null) {
        diagnostics.push(
          errorDiagnostic(
            'DESIGN_REF_NOT_FOUND',
            `父资源不存在: ${parentRef}`,
            resourceId,
          ),
        );
      } else {
        parameters.push(...parent.parameters);

        const parentEntity = index.entities.get(parent.entityRef) as JsonObject | undefined;
        const childRoot = contextRefOf(entity);
        const parentRoot = contextRefOf(parentEntity);

        if (
          childRoot !== parentRoot &&
          !partyScopedContractCollection(parentEntity, entity, resource)
        ) {
          diagnostics.push(
            errorDiagnostic(
              'RESOURCE_CONTEXT_ROOT_MISMATCH',
              '不同合同前、合同或领域 Context 必须使用独立 URI 根；只有 Contract 列表可按 Participant Party 作用域挂载',
              resourceId,
              undefined,
              [parent.id, childRoot ?? '', parentRoot ?? ''],
            ),
          );
        }

        const binding = bindings.get(asString(resource['parentBindingRef']) ?? '');

        if (
          binding === undefined ||
          binding['kind'] !== 'parent_child' ||
          binding['parentResourceRef'] !== parent.id ||
          binding['childResourceRef'] !== resourceId
        ) {
          diagnostics.push(
            errorDiagnostic(
              'URI_BINDING_MISSING',
              '嵌套资源缺少匹配的 parent_child 实例约束',
              resourceId,
              undefined,
              [parent.id],
            ),
          );
        }

        const basis = isRecord(resource['basis']) ? resource['basis'] : {};
        const sourceRefs = Array.isArray(basis['sourceRefs']) ? basis['sourceRefs'] : [];
        const fmRefs = Array.isArray(basis['fmRefs']) ? basis['fmRefs'] : [];

        if (sourceRefs.length === 0 && fmRefs.length < 2) {
          diagnostics.push(
            gapDiagnostic(
              'RESOURCE_STRUCTURE_UNRESOLVED',
              `${resourceId}.parent-structure`,
              'business',
              '父子路径的业务实例结构尚无充分依据；路径本身不证明归属',
              resourceId,
              [parent.id],
            ),
          );
        }
      }
    }

    diagnostics.push(
      ...validateCardinality(resource, parent as JsonObject | null, design, index),
    );

    const parentUri =
      parent === null
        ? ''
        : (parent.uris['singleton'] ?? parent.uris['item'] ?? '');
    const baseUri = `${parentUri}/${String(resource['segment'] ?? '')}`;
    let uris: Record<string, string>;

    if (shape === 'singleton') {
      uris = { singleton: baseUri };
    } else {
      const parameter = asString(identity['parameter']);

      if (parameter === undefined || parameter === '') {
        visiting.delete(resourceId);

        return null;
      }

      if (parameters.includes(parameter)) {
        diagnostics.push(
          errorDiagnostic(
            'URI_PARAMETER_DUPLICATE',
            `URI 参数重复: ${parameter}`,
            resourceId,
          ),
        );
      }

      parameters.push(parameter);
      uris = {
        collection: baseUri,
        item: `${baseUri}/{${parameter}}`,
      };
    }

    const projected: ProjectedResource = {
      ...resource,
      id: resourceId,
      entityRef,
      segment: String(resource['segment'] ?? ''),
      shape,
      uris,
      parameters,
    };

    result.set(resourceId, projected);
    visiting.delete(resourceId);

    return projected;
  };

  for (const key of [...configured.keys()].sort()) {
    visit(key);
  }

  return {
    resources: [...result.keys()].sort().map((key) => result.get(key) as ProjectedResource),
    diagnostics,
  };
};
