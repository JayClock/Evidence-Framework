import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../dist/app.js';
import { collectionOf } from '../dist/services/escrowService.js';
import { businessContext, requestContext } from '../dist/plugins/context.js';
import { integer, price, settle, jsonValue } from '../dist/domain/money.js';

const now = '2026-07-01T00:00:00Z';
const terms = {
  quantity: 10,
  tier_threshold: 10,
  tier1_unit_price_minor: 107,
  tier2_unit_price_minor: 99,
  tax_bps: 1300,
  retention_bps: 500,
  daily_penalty_bps: 100,
  delivery_deadline: now,
};
const base = {
  procurement: '/agreements',
  escrow: '/escrows',
  fulfillment: '/fulfillments',
  settlement: '/settlements',
};
let sequence = 0;
const uid = () => `unrelated-${++sequence}`;
async function post(app, lane, suffix, body, role, status = 201, time = now) {
  const response = await app.inject({
    method: 'POST',
    url: base[lane] + suffix,
    payload: body,
    headers: {
      'x-evidence-role': `role.${lane}-${role}`,
      'x-evidence-asof': time,
    },
  });
  assert.equal(response.statusCode, status, response.body);
  return response.json();
}
async function pair(
  app,
  lane,
  contractId,
  action,
  body = {},
  roles = ['buyer', 'seller'],
) {
  const request = await post(
    app,
    lane,
    `/${contractId}/${collectionOf(action)}`,
    { id: uid() },
    roles[0],
  );
  const url = `/${contractId}/${collectionOf(action)}/${request.id}/confirmation`;
  return post(app, lane, url, { id: uid(), ...body }, roles[1]);
}
async function ready(app) {
  const agreement = await post(
    app,
    'procurement',
    '',
    { id: uid(), ...terms },
    'buyer',
  );
  const order = await pair(app, 'procurement', agreement.id, 'order');
  await pair(
    app,
    'procurement',
    agreement.id,
    'commitment',
    { acknowledged: true },
    ['seller', 'buyer'],
  );
  const escrow = await post(
    app,
    'escrow',
    '',
    { id: uid(), order_confirmation_id: order.id },
    'buyer',
  );
  const deposit = await pair(app, 'escrow', escrow.id, 'deposit-lock', {}, [
    'buyer',
    'escrow',
  ]);
  await pair(
    app,
    'escrow',
    escrow.id,
    'custody-statement',
    { acknowledged: true },
    ['escrow', 'buyer'],
  );
  const linkage = {
    order_confirmation_id: order.id,
    deposit_confirmation_id: deposit.id,
  };
  const fulfillment = await post(
    app,
    'fulfillment',
    '',
    { id: uid(), ...linkage },
    'buyer',
  );
  await pair(app, 'fulfillment', fulfillment.id, 'delivery', {
    delivered_quantity: 10,
  });
  const acceptance = await pair(
    app,
    'fulfillment',
    fulfillment.id,
    'acceptance',
    { accepted: true },
    ['seller', 'buyer'],
  );
  const settlement = await post(
    app,
    'settlement',
    '',
    { id: uid(), ...linkage, acceptance_confirmation_id: acceptance.id },
    'seller',
  );
  const request = await post(
    app,
    'settlement',
    `/${settlement.id}/releases`,
    { id: uid() },
    'seller',
  );
  return {
    order,
    fulfillment,
    deposit,
    acceptance,
    linkage,
    url: `/${settlement.id}/releases/${request.id}/confirmation`,
    settlement,
  };
}

test('exact int64 parsing, half-up money, cap and conservation without double conversion', () => {
  for (const value of [
    9007199254740992,
    '01',
    '9223372036854775808',
    '-9223372036854775809',
    1.1,
  ])
    assert.equal(integer.safeParse(value).success, false);
  assert.equal(integer.parse('9223372036854775807'), 9223372036854775807n);
  const result = price({
    ...terms,
    quantity: 2n,
    tier_threshold: 10n,
    tier1_unit_price_minor: 10000000000000001n,
    tier2_unit_price_minor: 1n,
    tax_bps: 1300n,
  });
  assert.equal(result.gross_amount_minor, 22600000000000002n);
  assert.equal(jsonValue(result).gross_amount_minor, '22600000000000002');
  const payout = settle(1354870n, 500n, 100n, 15n);
  assert.equal(payout.late_penalty_minor, 203231n);
  assert.equal(
    payout.retention_minor + payout.late_penalty_minor + payout.payout_minor,
    payout.gross_amount_minor,
  );
  assert.equal(settle(100n, 500n, 10000n, 100n).payout_minor, 0n);
});

test('async contexts isolate clocks across overlapping operations and clean up afterwards', async () => {
  const seen = await Promise.all(
    [1, 2, 3].map((day) =>
      requestContext.run(
        { now: new Date(`2026-07-0${day}T00:00:00Z`), role: String(day) },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 5 - day));
          return [businessContext().role, businessContext().now.getUTCDate()];
        },
      ),
    ),
  );
  assert.deepEqual(seen, [
    ['1', 1],
    ['2', 2],
    ['3', 3],
  ]);
  assert.throws(() => businessContext(), /Missing request context/);
});

test('HTTP hooks preserve concurrent request clocks and use the injected UTC clock only when omitted', async (t) => {
  const app = createApp({
    testMode: true,
    clock: () => new Date('2026-07-09T00:00:00Z'),
  });
  t.after(() => app.close());
  const responses = await Promise.all(
    [1, 2, 3].map((day) =>
      app.inject({
        method: 'POST',
        url: base.procurement,
        payload: { id: uid(), ...terms },
        headers: {
          'x-evidence-role': 'role.procurement-buyer',
          'x-evidence-asof': `2026-07-0${day}T00:00:00Z`,
        },
      }),
    ),
  );
  assert.deepEqual(
    responses.map((r) => [r.statusCode, r.json().signed_at]),
    [
      [201, '2026-07-01T00:00:00Z'],
      [201, '2026-07-02T00:00:00Z'],
      [201, '2026-07-03T00:00:00Z'],
    ],
  );
  const defaultTime = await app.inject({
    method: 'POST',
    url: base.procurement,
    payload: { id: uid(), ...terms },
    headers: { 'x-evidence-role': 'role.procurement-seller' },
  });
  assert.equal(defaultTime.json().signed_at, '2026-07-09T00:00:00Z');
  assert.throws(() => businessContext(), /Missing request context/);
});

test('test headers are opt-in; invalid clocks, missing identities, forbidden roles and extra fields fail closed', async (t) => {
  const disabled = createApp();
  const app = createApp({ testMode: true });
  t.after(() => Promise.all([disabled.close(), app.close()]));
  assert.equal(
    (
      await disabled.inject({
        method: 'POST',
        url: base.procurement,
        payload: { id: uid(), ...terms },
      })
    ).statusCode,
    503,
  );
  assert.equal(
    (await app.inject({ url: base.procurement + '/missing' })).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        url: base.procurement + '/missing',
        headers: {
          'x-evidence-role': 'role.procurement-buyer',
          'x-evidence-asof': 'garbage',
        },
      })
    ).statusCode,
    400,
  );
  await post(app, 'procurement', '', { id: uid(), ...terms }, 'stranger', 403);
  await post(
    app,
    'procurement',
    '',
    { id: uid(), ...terms, signed_at: now },
    'buyer',
    422,
  );
  await post(
    app,
    'procurement',
    '',
    { id: uid(), ...terms, quantity: 0 },
    'buyer',
    422,
  );
  await post(
    app,
    'procurement',
    '',
    { id: uid(), ...terms, tax_bps: 10001 },
    'buyer',
    422,
  );
  await post(
    app,
    'procurement',
    '',
    { id: uid(), ...terms, quantity: '9223372036854775807' },
    'buyer',
    422,
  );
});

test('references are explicit and order-consistent; concurrent releases commit once and failed writes do not poison the ledger', async (t) => {
  const app = createApp({ testMode: true });
  t.after(() => app.close());
  const first = await ready(app);
  const second = await ready(app);
  await post(
    app,
    'fulfillment',
    `/${first.fulfillment.id}/first-milestones`,
    { id: uid() },
    'buyer',
    409,
  );
  await post(
    app,
    'fulfillment',
    `/${first.fulfillment.id}/deliveries`,
    { id: uid() },
    'buyer',
    409,
  );
  await post(
    app,
    'fulfillment',
    '',
    { id: uid(), ...first.linkage, deposit_confirmation_id: second.deposit.id },
    'buyer',
    409,
  );
  await post(
    app,
    'settlement',
    '',
    {
      id: uid(),
      ...first.linkage,
      acceptance_confirmation_id: second.acceptance.id,
    },
    'seller',
    409,
  );
  await post(
    app,
    'escrow',
    '',
    { id: uid(), order_confirmation_id: 'not-present' },
    'buyer',
    404,
  );
  const id = uid();
  await post(
    app,
    'settlement',
    first.url,
    { id, payout_minor: 1000000 },
    'escrow',
    422,
  );
  await post(
    app,
    'settlement',
    first.url,
    { id, confirmed_at: now },
    'escrow',
    422,
  );
  await post(app, 'settlement', first.url, { id }, 'seller', 403);
  const responses = await Promise.all(
    [id, uid()].map((id) =>
      app.inject({
        method: 'POST',
        url: base.settlement + first.url,
        payload: { id },
        headers: {
          'x-evidence-role': 'role.settlement-escrow',
          'x-evidence-asof': now,
        },
      }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [201, 409]);
  assert.equal(
    responses.find((r) => r.statusCode === 409).json().error,
    'ALREADY_CONFIRMED',
  );
  const success = responses.find((r) => r.statusCode === 201).json();
  assert.equal(
    success.gross_amount_minor,
    success.retention_minor + success.late_penalty_minor + success.payout_minor,
  );
  const another = await post(
    app,
    'settlement',
    '',
    {
      id: uid(),
      ...first.linkage,
      acceptance_confirmation_id: first.acceptance.id,
    },
    'seller',
  );
  await post(
    app,
    'settlement',
    `/${another.id}/releases`,
    { id: uid() },
    'seller',
    409,
  );
  const read = await app.inject({
    url: `${base.settlement}/${first.settlement.id}`,
    headers: { 'x-evidence-role': 'role.settlement-seller' },
  });
  assert.equal(read.statusCode, 200);
  assert.equal(
    read.json()._links.self.href,
    `${base.settlement}/${first.settlement.id}`,
  );
});

test('request ownership, temporal ordering, expiry, missing prerequisites and delivery mode are enforced', async (t) => {
  const app = createApp({ testMode: true });
  t.after(() => app.close());
  const one = await post(
    app,
    'procurement',
    '',
    { id: uid(), ...terms },
    'buyer',
  );
  const two = await post(
    app,
    'procurement',
    '',
    { id: uid(), ...terms },
    'buyer',
  );
  await post(
    app,
    'procurement',
    `/${one.id}/commitments`,
    { id: uid() },
    'seller',
    409,
  );
  const request = await post(
    app,
    'procurement',
    `/${one.id}/orders`,
    { id: uid() },
    'buyer',
  );
  await post(
    app,
    'procurement',
    `/${two.id}/orders/${request.id}/confirmation`,
    { id: uid() },
    'seller',
    409,
  );
  await post(
    app,
    'procurement',
    `/${one.id}/orders/${request.id}/confirmation`,
    { id: uid() },
    'seller',
    409,
    '2026-06-30T00:00:00Z',
  );
  await post(
    app,
    'procurement',
    `/${one.id}/orders/${request.id}/confirmation`,
    { id: uid() },
    'seller',
    409,
    '2026-07-04T00:00:00Z',
  );
  const ledger = await app.inject({
    url: `${base.procurement}/${one.id}/orders/${request.id}`,
    headers: { 'x-evidence-role': 'role.procurement-buyer' },
  });
  assert.equal(ledger.statusCode, 200);
  assert.equal(ledger.json().id, request.id);
  assert.equal(ledger.json().expired_at, '2026-07-03T00:00:00Z');
  const absent = await app.inject({
    url: `${base.procurement}/${two.id}/orders`,
    headers: { 'x-evidence-role': 'role.procurement-buyer' },
  });
  assert.equal(absent.statusCode, 200);
  assert.equal(absent.json().total, 0);
  const legacy = createApp({ testMode: true, mode: 'v1' });
  t.after(() => legacy.close());
  assert.equal(
    (
      await legacy.inject({
        method: 'POST',
        url: '/fulfillments/any/first-milestones',
        payload: { id: uid() },
        headers: { 'x-evidence-role': 'role.fulfillment-buyer' },
      })
    ).statusCode,
    404,
  );
});

test('launcher rejects unsafe mode and invalid flags before listening', () => {
  for (const args of [
    [],
    ['--test-mode', '--port', '-1'],
    ['--test-mode', '--fault', 'unknown'],
    ['--test-mode', '--mode', 'v3'],
  ]) {
    const result = spawnSync(process.execPath, ['dist/server.js', ...args], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.notEqual(result.stderr, '');
  }
});

test('standalone manifests and source do not refer to the framework or sibling implementations', async () => {
  const { readdir } = await import('node:fs/promises');
  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await scan(file);
      else
        assert.doesNotMatch(
          await readFile(file, 'utf8'),
          /@evidence-poc|\.\.\/\.\.\/|readFile|generated\/|\.evidence\.json|golang-gin|java-spring|python-fastapi/,
        );
    }
  }
  await scan('src');
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.ok(
    Object.values(manifest.dependencies).every(
      (v) => !v.includes('workspace:'),
    ),
  );
});

test('each created primary URI supports GET and collection HAL links follow the same identity', async (t) => {
  const app = createApp({ testMode: true });
  t.after(() => app.close());
  const headers = (role) => ({
    'x-evidence-role': `role.procurement-${role}`,
    'x-evidence-asof': now,
  });
  const contract = await app.inject({
    method: 'POST',
    url: '/agreements',
    headers: headers('buyer'),
    payload: { id: uid(), ...terms },
  });
  const request = await app.inject({
    method: 'POST',
    url: contract.headers.location + '/orders',
    headers: headers('buyer'),
    payload: { id: uid() },
  });
  const confirmation = await app.inject({
    method: 'POST',
    url: request.headers.location + '/confirmation',
    headers: headers('seller'),
    payload: { id: uid() },
  });
  assert.equal(
    confirmation.headers.location,
    `/order-confirmations/${confirmation.json().id}`,
  );
  assert.equal(
    (
      await app.inject({
        url: confirmation.headers.location,
        headers: headers('buyer'),
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        url: `/commitment-confirmations/${confirmation.json().id}`,
        headers: headers('buyer'),
      })
    ).statusCode,
    404,
  );
  for (const [response, role] of [
    [contract, 'buyer'],
    [request, 'buyer'],
    [confirmation, 'seller'],
  ]) {
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json()._links.self.href, response.headers.location);
    const read = await app.inject({
      url: response.headers.location,
      headers: headers(role),
    });
    assert.equal(read.statusCode, 200, read.body);
    assert.deepEqual(read.json(), response.json());
  }
  const list = await app.inject({
    url: contract.headers.location + '/orders',
    headers: headers('buyer'),
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().total, 1);
  assert.equal(
    list.json()._embedded.orders[0]._links.self.href,
    request.headers.location,
  );
});
