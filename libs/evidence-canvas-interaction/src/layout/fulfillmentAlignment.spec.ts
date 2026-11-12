import {
  fulfillmentBoundaryPath,
  resolveFulfillmentAlignment,
  resolveFulfillmentBand,
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

  it('reads the request as an interval and the results as moments', () => {
    const band = resolveFulfillmentBand(layout, 'evidence.delivery-request')!;
    const request = layout.nodeById.get('evidence.delivery-request')!;

    expect(band.groupId).toBe('fulfillment:evidence.delivery-request');
    expect(band.intervalBar).toEqual(request.box);
    expect(band.centerY).toBe(request.box.y + request.box.height / 2);
    expect(band.moments.map((moment) => moment.kind)).toEqual([
      'confirmation',
      'proof',
    ]);
  });

  it('reports a moment that answers the request on its own row', () => {
    const band = resolveFulfillmentBand(layout, 'evidence.delivery-request')!;
    const confirmation = band.moments.find(
      (moment) => moment.kind === 'confirmation',
    )!;

    expect(confirmation.nodeId).toBe('evidence.delivery-confirmation');
    expect(confirmation.onRequestRow).toBe(true);
    expect(band.alignedMomentIds).toContain(confirmation.nodeId);
  });

  it('returns null for a band whose request is not placed', () => {
    expect(
      resolveFulfillmentBand(layout, 'evidence.procurement-contract'),
    ).toBeNull();
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
