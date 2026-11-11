import type { RelationshipAST } from '@evidence-poc/evidence-schema';

import type { DesignDocument } from '../loader/apiLoader.js';
import {
  errorDiagnostic,
  gapDiagnostic,
  type Diagnostic,
} from '../diagnostics.js';
import type { FmIndex } from '../adapter/fmAdapter.js';

/**
 * How many business instances a parent may have under its path.
 *
 * The answer comes from the model — a relationship's cardinality, or a documented
 * business source — never from the path or from how the segment is named. It also
 * decides the address shape: one child is a singleton, more than one is a
 * collection with its own identity parameter.
 */

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * A declared upper bound: a count, or the word `many`.
 *
 * The API contract only allows those two shapes, and keeping them unevaluated
 * matters — `1` is a singleton and `"many"` is not, while comparing them as text
 * would make `1` and `"1"` look like the same claim.
 */
export type CardinalityMax = number | 'many';

const cardinalityMax = (value: unknown): CardinalityMax | undefined => {
  if (typeof value === 'number') {
    return value;
  }

  return value === 'many' ? 'many' : undefined;
};

const maximumOf = (
  relationship: RelationshipAST,
  end: 'sourceCardinality' | 'targetCardinality',
): CardinalityMax | undefined => {
  const cardinality = relationship[end] as { max?: unknown } | undefined;

  return cardinalityMax(cardinality?.max);
};

/** Endpoint order of a relationship, normalised to strings. */
const endpointsOf = (
  relationship: RelationshipAST,
): [string, string] => [relationship.sourceRef, relationship.targetRef];

/**
 * Checks the number of business children a parent may have.
 *
 * Two independent statements about the same number must agree: a proof that says
 * `one` while a modelled relationship says `many` is a contradiction, not a
 * preference, and the address shape has to follow the number that survived.
 */
export const validateCardinality = (
  resource: JsonObject,
  parent: JsonObject | null,
  design: DesignDocument,
  index: FmIndex,
): Diagnostic[] => {
  const ref = String(resource['id']);
  const proof = resource['cardinality'];

  if (parent === null) {
    if (resource['shape'] === 'singleton' || proof !== undefined) {
      return [
        errorDiagnostic(
          'CARDINALITY_SCOPE_INVALID',
          '单例及父子基数须有明确父资源范围',
          ref,
        ),
      ];
    }

    return [];
  }

  if (proof === undefined || proof === null) {
    return [
      gapDiagnostic(
        'RESOURCE_CARDINALITY_UNRESOLVED',
        `${ref}.cardinality`,
        'business',
        '父资源下可有多少业务实例尚未明确，不能由路径或类型名推断',
        ref,
      ),
    ];
  }

  const proofObject = isRecord(proof) ? proof : {};
  let maximum: CardinalityMax | undefined;
  const relationshipRef = asString(proofObject['relationshipRef']);

  if (relationshipRef !== undefined) {
    const relationship = index.relationships.get(relationshipRef);

    if (relationship === undefined) {
      return [errorDiagnostic('FM_REF_NOT_FOUND', '数量关系不存在', ref)];
    }

    const endpoints = endpointsOf(relationship);
    const expected: [string, string] = [
      String(parent['entityRef']),
      String(resource['entityRef']),
    ];

    if (endpoints[0] === expected[0] && endpoints[1] === expected[1]) {
      maximum = maximumOf(relationship, 'targetCardinality');
    } else if (endpoints[0] === expected[1] && endpoints[1] === expected[0]) {
      maximum = maximumOf(relationship, 'sourceCardinality');
    } else {
      return [
        errorDiagnostic(
          'CARDINALITY_SCOPE_INVALID',
          '数量关系端点不对应当前父子业务对象',
          ref,
        ),
      ];
    }
  } else {
    const knownSources = new Set(
      (Array.isArray(design['sources']) ? design['sources'] : [])
        .map((source) => (isRecord(source) ? asString(source['id']) : undefined))
        .filter((id): id is string => id !== undefined),
    );
    const sourceRefs = Array.isArray(proofObject['sourceRefs'])
      ? proofObject['sourceRefs'].filter(
          (item): item is string => typeof item === 'string',
        )
      : [];

    if (sourceRefs.length === 0 || !sourceRefs.every((item) => knownSources.has(item))) {
      return [
        errorDiagnostic(
          'SOURCE_REF_NOT_FOUND',
          '数量说明必须引用实际业务来源',
          ref,
        ),
      ];
    }

    maximum = cardinalityMax(proofObject['max']);
  }

  if (maximum === undefined) {
    return [
      gapDiagnostic(
        'RESOURCE_CARDINALITY_UNRESOLVED',
        `${ref}.cardinality`,
        'business',
        '所引用关系未声明父资源下的子实例数量上限',
        ref,
      ),
    ];
  }

  const expected: [string, string] = [
    String(parent['entityRef']),
    String(resource['entityRef']),
  ];

  for (const relationship of index.relationships.values()) {
    const endpoints = endpointsOf(relationship);
    const forward = endpoints[0] === expected[0] && endpoints[1] === expected[1];
    const backward = endpoints[0] === expected[1] && endpoints[1] === expected[0];

    if (!forward && !backward) {
      continue;
    }

    const knownMaximum = maximumOf(
      relationship,
      forward ? 'targetCardinality' : 'sourceCardinality',
    );

    if (knownMaximum !== undefined && knownMaximum !== maximum) {
      return [
        errorDiagnostic(
          'RESOURCE_CARDINALITY_CONFLICT',
          '数量依据与已有FM关系冲突，不能选择性忽略',
          ref,
        ),
      ];
    }
  }

  const expectedShape = maximum === 1 ? 'singleton' : 'collection';

  if (resource['shape'] !== expectedShape) {
    return [
      errorDiagnostic(
        'RESOURCE_CARDINALITY_CONFLICT',
        '资源寻址形态与业务数量关系不一致',
        ref,
      ),
    ];
  }

  return [];
};
