import { describe, expect, it } from 'vitest';
import { strictValidateDomainModel } from '../index.js';
import {
  cloneDocument,
  loadFixtureModel,
  requireEvidence,
} from '../../tests/support/fixtures.js';

const test = {
  flow: 'payment',
  actingRoleRef: 'role.buyer',
  asOf: '2026-03-31T10:00:00Z',
};
const validate = (metadata: unknown) => {
  const model = cloneDocument(loadFixtureModel());
  Object.assign(requireEvidence(model, 'request.payment'), {
    examples: [{ label: 'request', value: {}, test: metadata }],
  });
  return strictValidateDomainModel(model);
};

describe('inline acceptance metadata', () => {
  it('accepts explicit flow, clock, dependencies and negative inputs', () => {
    expect(
      validate({
        ...test,
        basedOn: ['contract.purchase#signed'],
        pathParameters: {
          contractId: {
            exampleRef: 'contract.purchase#signed',
            jsonpath: '$.id',
          },
        },
      }).valid,
    ).toBe(true);
    expect(
      validate({
        ...test,
        expectedStatus: 422,
        inputs: { amount: -1 },
        expect: { '$.error': 'INVALID' },
      }).valid,
    ).toBe(true);
  });
  it.each([
    null,
    {},
    { ...test, flow: '' },
    { ...test, asOf: 'yesterday' },
    { ...test, asOf: '2026-03-31' },
    { ...test, expectedStatus: 201.5 },
    { ...test, inputs: {} },
    { ...test, basedOn: ['x', 'x'] },
    { ...test, pathParameters: { id: {} } },
    { ...test, extra: true },
    { ...test, expect: { error: 'INVALID' } },
    { ...test, expect: { '$.bad': Infinity } },
  ])('rejects malformed metadata %j', (metadata) => {
    expect(validate(metadata).valid).toBe(false);
  });
  it('round trips without adding a new source tree', () => {
    const model = cloneDocument(loadFixtureModel());
    requireEvidence(model, 'request.payment').examples = [
      { label: 'request', value: {}, test },
    ];
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });
});
