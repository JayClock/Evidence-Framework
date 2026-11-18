import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildDelivery, halLinksFor } from '@evidence-poc/evidence-api';
import { operationFor } from '@evidence-poc/evidence-api/testing';
import { parseModelBundleText } from '@evidence-poc/evidence-model-core';
import { projectAcceptanceTests } from './delivery/scenarioProjector.js';

function loadExample(name: string) {
  const file = new URL(
    `../../../examples/${name}/model/${name}.evidence.json`,
    import.meta.url,
  );
  const parsed = parseModelBundleText(readFileSync(file, 'utf8'));
  expect(parsed.issues).toEqual([]);
  const snapshot = buildDelivery(parsed.document);
  expect(snapshot.diagnostics).toEqual([]);
  return { snapshot, flows: projectAcceptanceTests(parsed.document).flows };
}

it('keeps advertising payment and full lifecycle as separate acceptance flows', () => {
  const { snapshot, flows } = loadExample('digital-advertising');
  const payment = flows.find(({ id }) => id === 'prepayment-only')!;
  expect(payment.steps.map(({ route }) => route.purpose)).toEqual([
    'sign',
    'request',
    'confirm',
  ]);
  expect(payment.steps[2]).toMatchObject({
    actingRoleRef: 'role.payment-gateway',
    route: {
      path: '/ads-promotion-orders/{contractId}/payment/confirmation',
      itemPath: '/payment-confirmations/{paymentConfirmationId}',
    },
  });

  const full = flows.find(({ id }) => id === 'negotiation-to-daily-report')!;
  const sign = full.steps[2]!.route;
  expect(sign.path).toBe(
    '/ads-promotion-inquiries/{inquiryId}/ads-promotion-proposal/ads-promotion-orders',
  );
  expect(sign.itemPath).toBe('/ads-promotion-orders/{contractId}');
  const [submit, publish] = full.steps.slice(-2);
  expect(submit).toMatchObject({
    status: 202,
    route: {
      entityRef: 'request.daily-report',
      path: '/ads-promotion-orders/{contractId}/daily-reports',
    },
  });
  expect(publish).toMatchObject({
    status: 201,
    route: {
      entityRef: 'confirmation.daily-report',
      path: '/ads-promotion-orders/{contractId}/daily-reports/{reportId}/confirmation',
    },
  });
  expect(publish!.parameters.reportId).toBeDefined();
  expect(submit!.captures[publish!.parameters.reportId!]).toBe('$.id');
  const monitor = snapshot.routes.find(
    ({ id }) => id === 'route.read.request.daily-report',
  )!;
  const report = snapshot.routes.find(
    ({ id }) => id === 'route.read.confirmation.daily-report',
  )!;
  const submission = operationFor(snapshot, submit!.route.id);
  expect(submission.responses['201']).toBeUndefined();
  expect(submission.responses['202']!.headers!.Location).toMatchObject({
    required: true,
    'x-evidence-uri-template': monitor.path,
  });
  expect(halLinksFor(snapshot.hypermedia, submit!.route.id).self).toMatchObject(
    { href: monitor.path },
  );
  expect(
    halLinksFor(snapshot.hypermedia, monitor.id)[
      'result:confirmation.daily-report'
    ],
  ).toMatchObject({ href: report.path, method: 'GET' });
  expect(report.path).toBe(
    '/daily-report-confirmations/{dailyReportConfirmationId}',
  );
  expect(report.allowedPartyRoleRefs).toContain('role.advertiser');
  expect(publish!.route.allowedPartyRoleRefs).toEqual(['role.agency']);
  expect(
    operationFor(snapshot, publish!.route.id).responses['201']!.headers!
      .Location,
  ).toMatchObject({ 'x-evidence-uri-template': report.path });
});

it('appends two distinct story receipts to one sprint, without replacing the baseline lock', () => {
  const { snapshot, flows } = loadExample('agile-sprint');
  const appends = flows[0]!.steps.filter(
    ({ route }) => route.entityRef === 'confirmation.story',
  );
  expect(appends.map(({ inputs }) => inputs.story_id)).toEqual([
    'story-52',
    'story-53',
  ]);
  expect(appends[0]!.parameters.contractId).toBe(
    appends[1]!.parameters.contractId,
  );
  const path = '/iteration-plans/{contractId}/story-confirmations';
  expect(appends.every(({ route }) => route.path === path)).toBe(true);
  expect(snapshot.routes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        method: 'POST',
        path: '/iteration-plans/{contractId}/backlog/confirmation',
      }),
      expect.objectContaining({
        method: 'GET',
        path,
        responseShape: 'collection',
        itemPath: '/story-confirmations/{storyConfirmationId}',
      }),
      expect.objectContaining({
        method: 'GET',
        path: '/story-confirmations/{storyConfirmationId}',
        responseShape: 'item',
      }),
    ]),
  );
});

it('credits the same revenue receipt to a quarterly request and the annual singleton', () => {
  const { snapshot, flows } = loadExample('shared-settlement');
  const steps = flows[0]!.steps;
  const quarter = steps.find(
    ({ route }) => route.entityRef === 'request.quarterly-target',
  )!;
  const year = steps.find(
    ({ route }) => route.entityRef === 'request.annual-target',
  )!;
  const receipts = steps.filter(
    ({ route }) => route.entityRef === 'confirmation.revenue',
  );
  expect(receipts).toHaveLength(1);
  expect(receipts[0]!.inputs.request_ids).toEqual([
    quarter.inputs.id,
    year.inputs.id,
  ]);
  expect(receipts[0]!.route.path).toBe('/revenue-confirmations');
  const schema = operationFor(snapshot, receipts[0]!.route.id).requestBody!
    .content['application/json']!.schema;
  expect(schema.required).toContain('request_ids');
  expect(schema.properties!.request_ids).toMatchObject({
    type: 'array',
    uniqueItems: true,
    items: { type: 'string' },
  });
  const routes = snapshot.routes.filter(
    ({ entityRef }) => entityRef === 'confirmation.revenue',
  );
  expect(
    routes.filter(({ method }) => method === 'POST').map(({ path }) => path),
  ).toEqual(['/revenue-confirmations']);
  for (const requestPath of [quarter.route.itemPath, year.route.itemPath]) {
    expect(routes).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: requestPath + '/revenue-confirmations',
        responseShape: 'collection',
        itemPath: '/revenue-confirmations/{revenueConfirmationId}',
      }),
    );
  }
  expect(steps.at(-1)!.route).toMatchObject({
    entityRef: 'confirmation.quarter-close',
    path: quarter.route.itemPath + '/confirmation',
  });
  expect(steps.at(-1)!.assertions['$["revenue_confirmation_id"]']).toBe(
    receipts[0]!.inputs.id,
  );
});
