import type { DeliveryContract } from '../../src/delivery/modelDelivery.js';
import type { Operation } from './contract.js';

/** Checks semantic constraints that the OpenAPI document meta-schema cannot prove. */
export const contractProblems = (contract: DeliveryContract): string[] => {
  const problems: string[] = [];
  const operationIds = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return;
    if ('$ref' in value) {
      const ref = value.$ref;
      if (typeof ref !== 'string' || !ref.startsWith('#/components/schemas/')) {
        problems.push(`Non-local schema reference: ${String(ref)}`);
      } else {
        const key = ref
          .slice('#/components/schemas/'.length)
          .replaceAll('~1', '/')
          .replaceAll('~0', '~');
        if (!Object.hasOwn(contract.components.schemas, key))
          problems.push(`Unresolved reference: ${ref}`);
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(contract);
  for (const [path, methods] of Object.entries(contract.paths)) {
    const names = [...path.matchAll(/\{([^{}]+)\}/g)]
      .map((match) => match[1])
      .sort();
    for (const [method, raw] of Object.entries(methods)) {
      const operation = raw as Operation;
      if (operationIds.has(operation.operationId))
        problems.push(`Duplicate operationId: ${operation.operationId}`);
      operationIds.add(operation.operationId);
      const parameters = operation.parameters.filter(
        (parameter) => parameter.in === 'path',
      );
      if (
        JSON.stringify(parameters.map((parameter) => parameter.name).sort()) !==
          JSON.stringify(names) ||
        parameters.some((parameter) => !parameter.required)
      ) {
        problems.push(`Invalid path parameters: ${method} ${path}`);
      }
      if (method === 'get' && operation.requestBody !== undefined)
        problems.push(`GET request body: ${path}`);
    }
  }
  return problems;
};
