import type { JsonObject } from '../types.js';

/**
 * Portable vectors derived from journeys that already resolved.
 *
 * A vector is what a test environment needs to replay a journey: the request it
 * sends and the response it expects at every mapped step. What the environment
 * must still provide — an authenticated caller, prerequisites it cannot create
 * through the journey — is stated as unresolved rather than invented.
 */

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordsOf = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

export interface TestVector {
  id: string;
  journeyRef: string;
  actorRoleRef: string;
  sourceScenarioRefs: string[];
  setup: { kind: string; provisioning: string; reason: string }[];
  steps: JsonObject[];
}

export interface TestVectorDocument {
  schemaVersion: '2.0';
  apiId: unknown;
  dataClassification: 'synthetic';
  runtimeValidated: false;
  vectors: TestVector[];
}

/** Builds one vector per journey, keeping only the steps that resolved. */
export const buildVectors = (projection: JsonObject): TestVectorDocument => {
  const http = isRecord(projection['http']) ? projection['http'] : {};
  const vectors: TestVector[] = [];

  for (const journey of recordsOf(http['journeys'])) {
    const steps = recordsOf(journey['steps'])
      .filter((row) => row['status'] === 'mapped')
      .map((row) => ({
        id: row['id'],
        capabilityRef: row['capabilityRef'],
        request: row['request'],
        expect: row['expect'],
        sourceStepRefs: stringsOf(row['sourceStepRefs']),
      }));

    vectors.push({
      id: `vector.${String(journey['id'])}`,
      journeyRef: String(journey['id']),
      actorRoleRef: String(journey['actorRoleRef'] ?? ''),
      sourceScenarioRefs: stringsOf(journey['scenarioRefs']).sort(),
      setup: [
        {
          kind: 'actor',
          provisioning: 'unresolved',
          reason:
            '调用者身份、认证凭据与代表权限须由运行环境提供，API 设计不虚构其方案。',
        },
        {
          kind: 'prerequisites',
          provisioning: 'unresolved',
          reason:
            '仅准备无法通过本向量公开步骤形成的前置事实；装载方式由实现与测试环境决定。',
        },
      ],
      steps,
    });
  }

  return {
    schemaVersion: '2.0',
    apiId: projection['apiId'],
    dataClassification: 'synthetic',
    runtimeValidated: false,
    vectors,
  };
};
