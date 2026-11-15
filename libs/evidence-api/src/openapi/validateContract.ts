import { Validator } from '@seriousme/openapi-schema-validator';
import type { DeliveryContract } from '../delivery/modelDelivery.js';

/** Validates a local contract against the bundled OpenAPI meta-schema. */
export const assertOpenApiContract = async (
  contract: DeliveryContract,
): Promise<void> => {
  const validator = new Validator();
  const result = await validator.validate(structuredClone({ ...contract }));
  if (!result.valid || validator.version !== '3.1')
    throw new Error(`OPENAPI_INVALID: ${JSON.stringify(result.errors)}`);
};
