import {
  fulfillmentBoundaryPath,
  resolveFulfillmentAlignment,
} from '../index.js';
import { createFixtureModel } from '../../tests/support/fixtureModel.js';

describe('fulfillment alignment', () => {
  const { layout } = createFixtureModel();

  it('reports the request and its result stack', () => {
    const alignment = resolveFulfillmentAlignment(
      layout,
      'evidence.delivery-request',
    )!;

    expect(alignment.groupId).toBe('fulfillment:evidence.delivery-request');
    expect(alignment.contractId).toBe('evidence.procurement-contract');
    expect(alignment.confirmationBoxes).toHaveLength(1);
    expect(alignment.proofBoxes).toHaveLength(1);
    expect(alignment.centerY).toBe(
      alignment.requestBox.y + alignment.requestBox.height / 2,
    );
    expect(alignment.aligned).toBe(true);
  });

  it('returns null for unknown or unpaired requests', () => {
    expect(
      resolveFulfillmentAlignment(layout, 'evidence.procurement-contract'),
    ).toBeNull();
  });

  it('builds a closed rounded boundary path', () => {
    const path = fulfillmentBoundaryPath(
      { x: 10, y: 20, width: 200, height: 100 },
      8,
    );

    expect(path.startsWith('M 18 20')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path).toContain('A 8 8');
  });

  it('skips rounded corners on degenerate boxes', () => {
    expect(fulfillmentBoundaryPath({ x: 0, y: 0, width: 0, height: 0 })).toBe(
      'M 0 0 H 0 V 0 H 0 Z',
    );
  });
});
