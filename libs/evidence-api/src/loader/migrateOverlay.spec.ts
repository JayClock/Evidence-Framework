import { procurementEvolution } from '../testing/procurement.js';
import { loadFmFromDocument } from '../adapter/fmAdapter.js';
import { buildProjection } from '../projector.js';
import { migrateOverlay } from './migrateOverlay.js';

it('migrates v5 defaults and ledger IDs using model cardinalities, preserving summaries and journeys', () => {
  const model = procurementEvolution()[1]!;
  const old = {
    schemaVersion: '5.0',
    routes: [
      {
        id: 'route.sign.contract.agreement',
        path: '/procurement/agreement',
        summary: 'Sign terms',
      },
      {
        id: 'route.request.request.payment',
        path: '/procurement/agreement/{contractId}/payment/request',
      },
      {
        id: 'route.ledger.request.payment',
        path: '/procurement/agreement/{contractId}/payment',
      },
      {
        id: 'route.confirm.confirmation.payment',
        path: '/procurement/agreement/{contractId}/payment/request/confirmation',
      },
      {
        id: 'route.propose.proposal.quotation',
        path: '/sourcing/inquiry/{rfpId}/quotation',
      },
    ],
    journeys: [
      {
        id: 'sign',
        roleRef: 'role.buyer',
        routeId: 'route.sign.contract.agreement',
      },
    ],
  };
  const migrated = migrateOverlay(model, old);
  expect(migrated).toMatchObject({
    schemaVersion: '6.0',
    routes: [
      {
        id: 'route.sign.contract.agreement',
        path: '/agreements',
        summary: 'Sign terms',
      },
      {
        id: 'route.request.request.payment',
        path: '/agreements/{contractId}/payment',
      },
      {
        id: 'route.read.request.payment',
        path: '/agreements/{contractId}/payment',
      },
      {
        id: 'route.confirm.confirmation.payment',
        path: '/agreements/{contractId}/payment/confirmation',
      },
      {
        id: 'route.propose.proposal.quotation',
        path: '/inquiries/{inquiryId}/quotation',
      },
    ],
  });
  expect(
    buildProjection({
      index: loadFmFromDocument(model).index!,
      design: migrated,
    }).diagnostics,
  ).toEqual([]);
  expect(migrateOverlay(model, migrated)).toEqual(migrated);
  expect(old.schemaVersion).toBe('5.0');
});

it('retains custom aliases and refuses unknown identities instead of silently losing overrides', () => {
  const model = procurementEvolution()[1]!;
  expect(
    migrateOverlay(model, {
      routes: [{ id: 'route.sign.contract.agreement', path: '/custom-terms' }],
    }),
  ).toMatchObject({ routes: [{ path: '/custom-terms' }] });
  expect(() =>
    migrateOverlay(model, { routes: [{ id: 'route.missing', path: '/old' }] }),
  ).toThrow('UNKNOWN_ROUTE');
});
