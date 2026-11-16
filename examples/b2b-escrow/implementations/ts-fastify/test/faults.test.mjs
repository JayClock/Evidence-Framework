import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../dist/app.js';

const when = '2026-06-01T00:00:00Z';
const terms = {
  id: 'fault',
  quantity: 2,
  tier_threshold: 1000,
  tier1_unit_price_minor: '10000000000000001',
  tier2_unit_price_minor: 1199,
  tax_bps: 1300,
  retention_bps: 500,
  daily_penalty_bps: 100,
  delivery_deadline: when,
};
const headers = {
  'x-evidence-asof': when,
  'x-evidence-role': 'role.procurement-buyer',
};
for (const fault of [
  'none',
  'accept-derived',
  'extra-field',
  'clock',
  'precision',
]) {
  test(`${fault} is explicit, test-only and observable`, async (t) => {
    const closed = createApp({ fault });
    const app = createApp({
      testMode: true,
      fault,
      clock: () => new Date('2026-07-09T00:00:00Z'),
    });
    t.after(async () => {
      await app.close();
      await closed.close();
    });
    const request = {
      method: 'POST',
      url: '/procurement/agreement',
      headers,
      payload: terms,
    };
    assert.equal((await closed.inject(request)).statusCode, 503);
    const response = await app.inject(request);
    assert.equal(response.statusCode, 201, response.body);
    const data = response.json();
    assert.equal(data.unmodeled === true, fault === 'extra-field');
    assert.equal(data.signed_at !== when, fault === 'clock');
    assert.equal(
      data.tier1_unit_price_minor,
      fault === 'precision' ? '10000000000000000' : '10000000000000001',
    );
    assert.equal(
      (
        await app.inject({
          ...request,
          headers: { ...headers, 'x-evidence-role': 'role.procurement-escrow' },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          ...request,
          headers: { ...headers, 'x-evidence-asof': 'bad' },
        })
      ).statusCode,
      400,
    );
    const tamper = await app.inject({
      method: 'POST',
      url: '/settlement/settlement/absent/release/request/absent/confirmation',
      headers: { ...headers, 'x-evidence-role': 'role.settlement-escrow' },
      payload: { id: 'tamper', payout_minor: 999999 },
    });
    assert.equal(tamper.statusCode, fault === 'accept-derived' ? 201 : 422);
  });
}
test('unknown faults fail closed', () => {
  assert.throws(
    () => createApp({ testMode: true, fault: 'unknown' }),
    /Unknown fault/,
  );
});
