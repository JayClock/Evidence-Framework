import { readModelRoot } from '@evidence-poc/evidence-model-io';

import { API_FIXTURES } from './fixtures.js';

/** A shared confirmation whose requests have different cardinalities and owners. */
export const sharedConfirmationModel = async () => {
  const { bundle } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);
  const payment = bundle.relationships.find(
    ({ id }) => id === 'relation.payment-request-precedes-confirmation',
  )!;
  const paymentRequest = bundle.relationships.find(
    ({ id }) => id === 'relation.contract-precedes-payment-request',
  )!;
  paymentRequest.sourceCardinality = { min: 0, max: 'many' };
  const chargeRequest = bundle.relationships.find(
    ({ id }) => id === 'relation.wechat-contract-precedes-charge-request',
  )!;
  chargeRequest.sourceCardinality = { min: 0, max: 1 };
  bundle.relationships.push({
    ...payment,
    id: 'relation.shared-payment',
    targetRef: 'request.wechat-charge',
  });
  return bundle;
};
