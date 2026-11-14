import { fileURLToPath } from 'node:url';

import { readModelRoot } from '../../tests/support/modelRoot.js';
import {
  replayScenario,
  replayValidationSuite,
  replayableScenarioIds,
} from './replay.js';
import { loadValidationSuite } from './validationSuite.js';

const fixture = (name: string): string =>
  fileURLToPath(
    new URL(`../../tests/fixtures/models/${name}`, import.meta.url),
  );

const load = async (name: string) => {
  const { bundle, files } = await readModelRoot(fixture(name));

  return { bundle, suite: loadValidationSuite(files) };
};

describe('replayValidationSuite', () => {
  it('plays every scenario of the golden fixture, in file order', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const report = replayValidationSuite(bundle, suite);

    expect(replayableScenarioIds(suite)).toEqual(
      report.replays.map((replay) => replay.scenarioId),
    );
    expect(report.passed).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.modelId).toBe('traceable-subscription');
  });

  it('gives one frame per declared step, in sequence order', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const replay = replayValidationSuite(bundle, suite).replays.find(
      (item) => item.scenarioId === 'scenario.successful-payment',
    );

    expect(replay?.steps.map((step) => step.sequence)).toEqual([1, 2, 3]);
    expect(replay?.steps.map((step) => step.instanceRef)).toEqual([
      'instance.payment-request',
      'instance.gateway-payment-receipt',
      'instance.payment-confirmation',
    ]);
    expect(replay?.steps.map((step) => step.actingRoleRef)).toEqual([
      'role.platform-subscription',
      'role.subscriber',
      'role.subscriber',
    ]);
  });

  it('decides each assertion at the step that made it answerable', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const replay = replayValidationSuite(bundle, suite).replays.find(
      (item) => item.scenarioId === 'scenario.content-access-after-payment',
    );
    const [, second] = replay?.steps ?? [];

    expect(second?.checkpoints.map((item) => item.ruleRef)).toEqual([
      'rule.content-access-completed',
    ]);
  });

  it('shows a request move from pending to completed between frames', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const replay = replayValidationSuite(bundle, suite).replays.find(
      (item) => item.scenarioId === 'scenario.content-access-after-payment',
    );
    const states = replay?.steps.map((step) => step.fulfillmentStates[0]?.status);

    expect(states).toEqual(['pending', 'completed']);
  });

  it('shows a payment request complete on the step that confirms it', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const replay = replayValidationSuite(bundle, suite).replays.find(
      (item) => item.scenarioId === 'scenario.successful-payment',
    );
    const states = replay?.steps.map(
      (step) =>
        step.fulfillmentStates.find(
          (state) =>
            state.requestInstanceRef === 'instance.payment-request',
        )?.status,
    );

    expect(states).toEqual(['pending', 'pending', 'completed']);
  });

  it('decides a breach on the frame whose facts already satisfy it', async () => {
    // The overdue scenario asserts the request expired without a payment, so
    // the breach rule answers true the moment the request exists. A replay that
    // hid that until the end would be inventing a pending state the model does
    // not have.
    const { bundle, suite } = await load('valid-traceable-subscription');
    const replay = replayValidationSuite(bundle, suite).replays.find(
      (item) => item.scenarioId === 'scenario.overdue-payment',
    );
    const [only] = replay?.steps ?? [];

    expect(only?.fulfillmentStates).toEqual([
      {
        requestInstanceRef: 'instance.payment-request',
        requestEntityRef: 'request.content-payment',
        status: 'breached',
      },
    ]);
    expect(only?.checkpoints.map((item) => item.ruleRef)).toContain(
      'rule.payment-expired',
    );
  });

  it('reads the business time an issued evidence carries', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const replay = replayValidationSuite(bundle, suite).replays.find(
      (item) => item.scenarioId === 'scenario.overdue-payment',
    );

    expect(replay?.steps[0]?.at).toBe('2026-09-01T09:01:00Z');
    expect(replay?.steps[0]?.evidenceKind).toBe('fulfillment_request');
    expect(replay?.steps[0]?.contextRef).toBe('context.content-subscription');
  });

  it('replays only the requested scenarios and rejects unknown ids', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const only = replayValidationSuite(bundle, suite, [
      'scenario.successful-payment',
    ]);

    expect(only.replays.map((replay) => replay.scenarioId)).toEqual([
      'scenario.successful-payment',
    ]);

    const unknown = replayValidationSuite(bundle, suite, ['scenario.absent']);

    expect(unknown.replays).toEqual([]);
    expect(unknown.passed).toBe(false);
    expect(unknown.errors).toEqual(["unknown scenario id 'scenario.absent'"]);
  });

  it('refuses to replay a suite the model does not validate', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const [first] = suite.scenarios;
    const broken = {
      ...suite,
      scenarios: [
        {
          ...(first as (typeof suite.scenarios)[number]),
          steps: [
            {
              sequence: 1,
              actingRoleRef: 'role.absent',
              issueInstanceRef: 'instance.absent',
            },
          ],
        },
      ],
    };
    const [scenario] = broken.scenarios;

    const replay = replayScenario(
      bundle,
      broken,
      scenario as (typeof broken.scenarios)[number],
    );

    expect(replay.steps).toEqual([]);
    expect(replay.passed).toBe(false);
    expect(replay.errors.join('\n')).toContain('role.absent');
  });

  it('is deterministic: replaying twice gives identical frames', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const first = replayValidationSuite(bundle, suite);
    const second = replayValidationSuite(bundle, suite);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
