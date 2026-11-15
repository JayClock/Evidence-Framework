#!/usr/bin/env node
// Standalone reference SUT: Node's standard library only. It never imports the
// model, compiler, CEL evaluator or generated expectations. NOT a production API.
import { createServer } from 'node:http';

const options = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, args) => {
    if (index % 2 === 0) pairs.push([value, args[index + 1]]);
    return pairs;
  }, []),
);
const port = Number(options['--port'] ?? 8080);
const fault = options['--fault'] ?? 'none';
if (
  !Number.isInteger(port) ||
  port < 0 ||
  port > 65535 ||
  !['none', 'amount', 'accept-derived', 'clock', 'extra-field'].includes(fault)
) {
  throw new Error(
    'usage: node backend.mjs [--port 8080] [--fault none|amount|accept-derived|clock|extra-field]',
  );
}
const agreements = new Map(),
  requests = new Map();
const server = createServer(async (request, response) => {
  const send = (status, body) => {
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
    const asOf = request.headers['x-evidence-asof'];
    // Safe only because this fixture binds exclusively to loopback. Production
    // authentication and clock control must never trust these client headers.
    if (typeof asOf !== 'string' || Number.isNaN(Date.parse(asOf))) {
      failure(422, 'CLOCK_REQUIRED');
      return;
    }
    const now = fault === 'clock' ? new Date().toISOString() : asOf;
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
      /^\/procurement\/agreement\/([^/]+)\/payment\/request(?:\/([^/]+)\/confirmation)?$/.exec(
        url ?? '',
      );
    if (!match || request.method !== 'POST') {
      failure(404, 'NOT_FOUND');
      return;
    }
    const contractId = decodeURIComponent(match[1]);
    if (!agreements.has(contractId)) {
      failure(404, 'CONTRACT_NOT_FOUND');
      return;
    }
    if (match[2] === undefined) {
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
      requests.set(body.id, { contractId, item, completed: false });
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
    const entry = requests.get(decodeURIComponent(match[2]));
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
      total_amount,
      _links: links(url),
    });
  } catch (error) {
    if (!response.headersSent) failure(400, 'INVALID_JSON');
    else response.destroy(error);
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(
    JSON.stringify({
      host: `http://127.0.0.1:${server.address().port}`,
      fault,
    }),
  );
});
process.on('SIGTERM', () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
