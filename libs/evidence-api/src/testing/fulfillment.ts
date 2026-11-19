import { readModelRoot } from '@evidence-poc/evidence-model-io';

import { API_FIXTURES } from './fixtures.js';

/** Two payment requests in the same contract can share one confirmation. */
export const sharedConfirmationModel = async () => {
  const { bundle } = await readModelRoot(`${API_FIXTURES}full-lifecycle/fm`);
  const payment = bundle.relationships.find(
    ({ id }) => id === 'relation.payment-request-precedes-confirmation',
  )!;
  const paymentRequest = bundle.relationships.find(
    ({ id }) => id === 'relation.contract-precedes-payment-request',
  )!;
  paymentRequest.sourceCardinality = { min: 0, max: 'many' };
  const balance = 'request.payment-balance';
  bundle.entities.push({
    ...bundle.entities.find(({ id }) => id === 'request.payment')!,
    id: balance,
    label: '尾款请求',
  });
  bundle.relationships.push(
    {
      ...paymentRequest,
      id: 'relation.contract-precedes-payment-balance',
      sourceRef: balance,
      sourceCardinality: { min: 0, max: 1 },
    },
    {
      ...payment,
      id: 'relation.shared-payment',
      targetRef: balance,
    },
  );
  return bundle;
};
