#!/usr/bin/env node
// Standalone reference SUT: Node's standard library only. It never imports the
// model, compiler, CEL evaluator or generated expectations. NOT a production API.
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import { getBusinessTime, withEvidenceClock } from './interceptors/node.mjs';

const { values: options } = parseArgs({
  options: {
    port: { type: 'string', default: '8085' },
    fault: { type: 'string', default: 'none' },
    mode: { type: 'string', default: 'v2' },
  },
});
const port = Number(options.port);
const fault = options.fault;
if (
  !Number.isInteger(port) ||
  port < 0 ||
  port > 65535 ||
  !['v1', 'v2'].includes(options.mode) ||
  ![
    'none',
    'amount',
    'accept-derived',
    'clock',
    'extra-field',
    'missing-derived',
  ].includes(fault)
) {
  throw new Error(
    'usage: node server.mjs [--port 8085] [--mode v1|v2] [--fault none|amount|accept-derived|clock|extra-field|missing-derived]',
  );
}
const agreements = new Map(),
  requests = new Map();
const server = createServer((request, response) =>
  withEvidenceClock(request, true, async () => {
    const send = (status, body) => {
      if (fault === 'missing-derived' && status === 201) {
        body = { ...body };
        delete body.total_amount;
        delete body.deposit_amount;
      }
      response.writeHead(status, { 'content-type': 'application/hal+json' });
      response.end(
        JSON.stringify(
          fault === 'extra-field' && status === 201
            ? { ...body, unmodeled: true }
            : body,
        ),
      );
    };
    const failure = (status, error) => send(status, { error });
    try {
      let text = '';
      for await (const chunk of request) {
        text += chunk;
        if (text.length > 65536) {
          failure(413, 'PAYLOAD_TOO_LARGE');
          return;
        }
      }
      const body = JSON.parse(text || '{}');
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        failure(422, 'INVALID_INPUT');
        return;
      }
      // This test-only server is bound to loopback. Time stays request-scoped;
      // missing/invalid headers fall back to the physical clock, never global state.
      const now = (fault === 'clock' ? new Date() : getBusinessTime())
        .toISOString()
        .replace('.000Z', 'Z');
      const role = request.headers['x-evidence-role'];
      const url = request.url;
      const links = (href) => ({ self: { href } });
      const valid = (allowed, required) =>
        Object.keys(body).every((key) => allowed.includes(key)) &&
        required.every((key) => Object.hasOwn(body, key)) &&
        typeof body.id === 'string';
      if (request.method === 'POST' && url === '/procurement/agreement') {
        if (!['role.buyer', 'role.seller'].includes(role)) {
          failure(403, 'FORBIDDEN');
          return;
        }
        if (!valid(['id'], ['id'])) {
          failure(422, 'INVALID_INPUT');
          return;
        }
        const agreement = {
          id: body.id,
          signed_at: now,
          _links: links(`${url}/${encodeURIComponent(body.id)}`),
        };
        agreements.set(body.id, agreement);
        send(201, agreement);
        return;
      }
      const match =
        /^\/procurement\/agreement\/([^/]+)\/(payment|deposit)\/request(?:\/([^/]+)\/confirmation)?$/.exec(
          url ?? '',
        );
      if (
        !match ||
        request.method !== 'POST' ||
        (match[2] === 'deposit' && options.mode === 'v1')
      ) {
        failure(404, 'NOT_FOUND');
        return;
      }
      const contractId = decodeURIComponent(match[1]);
      if (!agreements.has(contractId)) {
        failure(404, 'CONTRACT_NOT_FOUND');
        return;
      }
      const kind = match[2];
      if (match[3] === undefined) {
        if (role !== 'role.seller') {
          failure(403, 'FORBIDDEN');
          return;
        }
        if (
          !valid(
            ['id', 'quantity', 'unit_price'],
            ['id', 'quantity', 'unit_price'],
          ) ||
          !Number.isInteger(body.quantity) ||
          typeof body.unit_price !== 'number'
        ) {
          failure(422, 'INVALID_INPUT');
          return;
        }
        const item = {
          id: body.id,
          quantity: body.quantity,
          unit_price: body.unit_price,
          started_at: now,
          expired_at: new Date(Date.parse(now) + 86400000)
            .toISOString()
            .replace('.000Z', 'Z'),
          _links: links(`${url}/${encodeURIComponent(body.id)}`),
        };
        requests.set(`${kind}:${body.id}`, {
          contractId,
          item,
          completed: false,
        });
        send(201, item);
        return;
      }
      if (role !== 'role.buyer') {
        failure(403, 'FORBIDDEN');
        return;
      }
      // Deliberate fault modes exist solely to prove the generated gate goes red.
      const allowed =
        fault === 'accept-derived'
          ? ['id', 'note', 'total_amount']
          : ['id', 'note'];
      if (
        !valid(allowed, ['id']) ||
        (body.note !== undefined && typeof body.note !== 'string')
      ) {
        failure(422, 'INVALID_INPUT');
        return;
      }
      const entry = requests.get(`${kind}:${decodeURIComponent(match[3])}`);
      if (!entry || entry.contractId !== contractId) {
        failure(404, 'REQUEST_NOT_FOUND');
        return;
      }
      if (
        entry.completed ||
        Date.parse(now) >= Date.parse(entry.item.expired_at)
      ) {
        failure(409, 'REQUEST_CLOSED');
        return;
      }
      entry.completed = true;
      // Independent implementation, deliberately not a call into the test oracle.
      const total_amount =
        entry.item.quantity * entry.item.unit_price +
        (fault === 'amount' ? 1 : 0);
      send(201, {
        id: body.id,
        ...(body.note === undefined ? {} : { note: body.note }),
        confirmed_at: now,
        ...(kind === 'deposit'
          ? { deposit_amount: total_amount * 0.2 }
          : { total_amount }),
        _links: links(url),
      });
    } catch (error) {
      if (!response.headersSent) failure(400, 'INVALID_JSON');
      else response.destroy(error);
    }
  }),
);
server.listen(port, '127.0.0.1', () => {
  console.log(
    JSON.stringify({
      host: `http://127.0.0.1:${server.address().port}`,
      fault,
      mode: options.mode,
    }),
  );
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
