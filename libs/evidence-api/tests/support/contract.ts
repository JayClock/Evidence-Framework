import type { DeliveryContract } from '../../src/delivery/modelDelivery.js';
import type { EvidenceApiSnapshot } from '../../src/types.js';

export interface Schema {
  $ref?: string;
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  readOnly?: boolean;
  [key: string]: unknown;
}
export interface Operation {
  operationId: string;
  parameters: { name: string; in: string; required: boolean }[];
  requestBody?: { content: Record<string, { schema: Schema }> };
  responses: Record<
    string,
    {
      content?: Record<string, { schema: Schema }>;
      headers?: Record<string, unknown>;
    }
  >;
}

export const operationFor = (
  snapshot: EvidenceApiSnapshot,
  routeId: string,
): Operation => {
  const route = snapshot.routes.find((item) => item.id === routeId);
  if (route === undefined) throw new Error(`Missing route: ${routeId}`);
  const operation =
    snapshot.openapi.paths[route.path]?.[route.method.toLowerCase()];
  if (operation === undefined) throw new Error(`Missing operation: ${routeId}`);
  return operation as unknown as Operation;
};

/** Resolve rather than inspecting a response $ref as though it were inline. */
export const resolveSchema = (
  contract: DeliveryContract,
  schema: Schema,
): Schema => {
  if (schema.$ref === undefined) return schema;
  const prefix = '#/components/schemas/';
  if (!schema.$ref.startsWith(prefix))
    throw new Error(`Unsupported reference: ${schema.$ref}`);
  const key = schema.$ref
    .slice(prefix.length)
    .replaceAll('~1', '/')
    .replaceAll('~0', '~');
  const resolved = contract.components.schemas[key];
  if (resolved === undefined)
    throw new Error(`Unresolved reference: ${schema.$ref}`);
  return resolved as Schema;
};
