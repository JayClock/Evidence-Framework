import { fileURLToPath } from 'node:url';

import { readModelRoot } from '../adapters/modelRoot.js';
import { simulateScenario, simulateValidationSuite } from './simulation.js';
import { loadValidationSuite } from './validationSuite.js';

const fixture = (name: string): string =>
  fileURLToPath(
    new URL(
      `../../tests/fixtures/models/${name}`,
      import.meta.url,
    ),
  );

const load = async (name: string) => {
  const { bundle, files } = await readModelRoot(fixture(name));

  return { bundle, suite: loadValidationSuite(files) };
};

describe('simulateValidationSuite', () => {
  it('executes every scenario of the golden fixture', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const { report, errors } = simulateValidationSuite(bundle, suite);

    expect(errors).toEqual([]);
    expect(report).toMatchObject({
      schemaVersion: '5.0',
      modelId: 'traceable-subscription',
      machineValidated: true,
      simulationPassed: true,
    });
    expect(report.scenarioResults.map((result) => result.scenarioId)).toEqual([
      'scenario.content-access-after-payment',
      'scenario.overdue-payment',
      'scenario.successful-payment',
    ]);
  });

  it('derives amounts, currencies and deadlines from the bound Evidence', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const { report } = simulateValidationSuite(bundle, suite);
    const overdue = report.scenarioResults.find(
      (result) => result.scenarioId === 'scenario.overdue-payment',
    );

    expect(overdue?.evaluations).toEqual([
      { ruleRef: 'rule.payment-deadline', result: '2026-09-01T09:31:00Z', passed: true },
      { ruleRef: 'rule.payment-request-amount', result: 19900, passed: true },
      { ruleRef: 'rule.payment-request-currency', result: 'CNY', passed: true },
      { ruleRef: 'rule.payment-expired', result: true, passed: true },
    ]);
    expect(overdue?.fulfillmentStatuses).toEqual([
      {
        requestInstanceRef: 'instance.payment-request',
        requestEntityRef: 'request.content-payment',
        status: 'breached',
        expectedStatus: 'breached',
        passed: true,
      },
    ]);
  });

  it('writes a derived value back into the issued instance', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const { report } = simulateValidationSuite(bundle, suite);
    const successful = report.scenarioResults.find(
      (result) => result.scenarioId === 'scenario.successful-payment',
    );
    const request = successful?.instanceValues.find(
      (instance) => instance.instanceRef === 'instance.payment-request',
    );

    expect(request?.values).toEqual({
      started_at: '2026-09-01T09:01:00Z',
      requested_minor_units: 19900,
      currency: 'CNY',
      expired_at: '2026-09-01T09:31:00Z',
    });
  });

  it('reports a scenario that executes nothing when the suite does not validate', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const broken = {
      ...suite,
      instances: suite.instances.map((instance, index) =>
        index === 0 ? { ...instance, entityRef: 'role.subscriber' } : instance,
      ),
    };
    const { report, errors } = simulateValidationSuite(bundle, broken);

    expect(report.scenarioResults).toEqual([]);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('entityRef must reference an Evidence Entity'),
      ]),
    );
  });

  it('runs only the scenarios that were asked for', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const { report } = simulateValidationSuite(bundle, suite, [
      'scenario.overdue-payment',
    ]);

    expect(report.scenarioResults).toHaveLength(1);
    expect(report.scenarioResults[0]?.scenarioId).toBe('scenario.overdue-payment');
  });

  it('reports an unknown scenario id', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const { errors } = simulateValidationSuite(bundle, suite, ['scenario.nope']);

    expect(errors).toEqual([`unknown scenario id 'scenario.nope'`]);
  });
});

describe('simulateScenario', () => {
  it('names the rule and the values when an expectation fails', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const scenario = suite.scenarios.find(
      (item) => item.id === 'scenario.overdue-payment',
    );

    const result = simulateScenario(bundle, suite, {
      ...(scenario as NonNullable<typeof scenario>),
      evaluations: (scenario?.evaluations ?? []).map((evaluation) =>
        evaluation.ruleRef === 'rule.payment-expired'
          ? { ...evaluation, expectedResult: false }
          : evaluation,
      ),
    });

    expect(result.simulationPassed).toBe(false);
    expect(result.errors).toContain(
      "scenario.overdue-payment.evaluations[3]: Rule 'rule.payment-expired' returned true, expected false",
    );
  });

  it('reports a rule that cannot be evaluated instead of dropping the scenario', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const scenario = suite.scenarios.find(
      (item) => item.id === 'scenario.successful-payment',
    );
    const result = simulateScenario(bundle, suite, {
      ...(scenario as NonNullable<typeof scenario>),
      evaluations: [
        ...(scenario?.evaluations ?? []).slice(0, 1),
        {
          ruleRef: 'rule.payment-matches-request',
          bindings: {
            request: { instanceRef: 'instance.payment-request' },
            payment: { value: 42 },
          },
          expectedResult: true,
        },
      ],
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("cannot evaluate Rule 'rule.payment-matches-request'"),
      ]),
    );
  });
});
