import Fastify from 'fastify';
import { ZodError } from 'zod';
import { BusinessError, notFound } from './domain/errors.js';
import { jsonValue } from './domain/money.js';
import {
  businessContext,
  contextFromHeaders,
  requestContext,
} from './plugins/context.js';
import {
  actions,
  collectionOf,
  contracts,
  EscrowService,
  type Lane,
} from './services/escrowService.js';
import type { Fact } from './repositories/memoryLedger.js';

export const faults = [
  'none',
  'amount',
  'clock',
  'extra-field',
  'missing-derived',
  'accept-derived',
  'precision',
] as const;
export type Fault = (typeof faults)[number];
export interface Options {
  testMode?: boolean;
  mode?: 'v1' | 'v2';
  fault?: Fault;
  clock?: () => Date;
}

export function createApp(options: Options = {}) {
  const fault = options.fault ?? 'none';
  if (!faults.includes(fault)) throw new Error('Unknown fault');
  const app = Fastify({
    logger: false,
    bodyLimit: 65536,
    onProtoPoisoning: 'error',
    onConstructorPoisoning: 'error',
  });
  const service = new EscrowService();
  const clock =
    options.clock ?? (() => new Date(Math.floor(Date.now() / 1000) * 1000));
  app.addHook('onRequest', (request, _reply, done) => {
    try {
      const context = contextFromHeaders(
        request.headers,
        options.testMode === true,
        clock,
      );
      if (fault === 'clock') context.now = clock();
      requestContext.run(context, done);
    } catch (error) {
      done(error as Error);
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError || error instanceof RangeError) {
      return reply
        .code(422)
        .send({ error: 'INVALID_INPUT', detail: error.message });
    }
    if (error instanceof BusinessError)
      return reply
        .code(error.status)
        .send({ error: error.code, detail: error.message });
    const status = (error as { statusCode?: number }).statusCode;
    return reply.code(status && status < 500 ? status : 500).send({
      error: status && status < 500 ? 'INVALID_INPUT' : 'INTERNAL_ERROR',
    });
  });

  function authorize(allowed: readonly string[]) {
    if (!allowed.includes(businessContext().role))
      throw new BusinessError(
        403,
        'FORBIDDEN',
        'Role cannot perform this operation',
      );
  }

  function representation(fact: Fact): unknown {
    const data = { ...fact.data };
    if (fault === 'amount' && fact.kind === 'confirmation.order')
      data.gross_amount_minor = (data.gross_amount_minor as bigint) + 1n;
    if (fault === 'precision')
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'bigint')
          data[key] = BigInt(Math.trunc(Number(value)));
      }
    if (fault === 'extra-field') data.unmodeled = true;
    if (fault === 'missing-derived') delete data.gross_amount_minor;
    return jsonValue({ ...data, _links: { self: { href: fact.href } } });
  }

  for (const lane of Object.keys(contracts) as Lane[]) {
    const definition = contracts[lane];
    const root = `/${collectionOf(definition.name)}`;
    const collection = (href: string, name: string, facts: Fact[]) => ({
      _links: { self: { href } },
      _embedded: { [name]: facts.map(representation) },
      total: facts.length,
    });
    app.get(root, (_request, reply) => {
      authorize(definition.roles);
      return reply
        .type('application/hal+json')
        .send(
          collection(
            root,
            collectionOf(definition.name),
            service.ledger.list('contract.' + definition.name),
          ),
        );
    });
    app.post(root, (request, reply) => {
      authorize(definition.roles);
      const fact = service.sign(lane, request.body, businessContext().now);
      return reply
        .code(201)
        .header('Location', fact.href)
        .type('application/hal+json')
        .send(representation(fact));
    });
    app.get<{ Params: { contractId: string } }>(
      `${root}/:contractId`,
      (request, reply) => {
        authorize(definition.roles);
        return reply
          .type('application/hal+json')
          .send(
            representation(
              service.ledger.get(
                request.params.contractId,
                `contract.${definition.name}`,
              ),
            ),
          );
      },
    );
    for (const [action, roles] of Object.entries(actions[lane])) {
      if (options.mode === 'v1' && /milestone/.test(action)) continue;
      const base = root + '/:contractId/' + collectionOf(action);
      const requestRole = 'role.' + lane + '-' + roles[0];
      const confirmRole = 'role.' + lane + '-' + roles[1];
      const requestFact = (contractId: string, requestId: string) => {
        const fact = service.ledger.get(requestId, 'request.' + action);
        if (fact.contractId !== contractId)
          return notFound('Request belongs to another contract');
        return fact;
      };
      app.get<{ Params: { contractId: string } }>(base, (request, reply) => {
        authorize([requestRole]);
        service.ledger.get(
          request.params.contractId,
          'contract.' + definition.name,
        );
        return reply
          .type('application/hal+json')
          .send(
            collection(
              root +
                '/' +
                encodeURIComponent(request.params.contractId) +
                '/' +
                collectionOf(action),
              collectionOf(action),
              service.ledger.list(
                'request.' + action,
                request.params.contractId,
              ),
            ),
          );
      });
      app.get<{ Params: { contractId: string; requestId: string } }>(
        base + '/:requestId',
        (request, reply) => {
          authorize([requestRole]);
          return reply
            .type('application/hal+json')
            .send(
              representation(
                requestFact(
                  request.params.contractId,
                  request.params.requestId,
                ),
              ),
            );
        },
      );
      app.get<{ Params: { contractId: string; requestId: string } }>(
        base + '/:requestId/confirmation',
        (request, reply) => {
          authorize([confirmRole]);
          requestFact(request.params.contractId, request.params.requestId);
          return reply
            .type('application/hal+json')
            .send(
              representation(
                service.ledger.confirmation(request.params.requestId),
              ),
            );
        },
      );
      app.post<{ Params: { contractId: string } }>(base, (request, reply) => {
        authorize([requestRole]);
        const fact = service.request(
          lane,
          action,
          request.params.contractId,
          request.body,
          businessContext().now,
        );
        return reply
          .code(201)
          .header('Location', fact.href)
          .type('application/hal+json')
          .send(representation(fact));
      });
      app.post<{ Params: { contractId: string; requestId: string } }>(
        `${base}/:requestId/confirmation`,
        (request, reply) => {
          authorize([confirmRole]);
          // Deliberately broken test-only mode, never a normal input path.
          if (
            fault === 'accept-derived' &&
            /release/.test(action) &&
            request.body &&
            typeof request.body === 'object' &&
            'payout_minor' in request.body
          ) {
            return reply.code(201).send(request.body);
          }
          const fact = service.confirm(
            lane,
            action,
            request.params.contractId,
            request.params.requestId,
            request.body,
            businessContext().now,
          );
          return reply
            .code(201)
            .header('Location', fact.href)
            .type('application/hal+json')
            .send(representation(fact));
        },
      );
    }
  }
  return app;
}
