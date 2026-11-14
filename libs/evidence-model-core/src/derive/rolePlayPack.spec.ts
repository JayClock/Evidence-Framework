import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadValidationSuite } from '../index.js';
import { readModelRoot } from '../../tests/support/modelRoot.js';
import { buildRolePlayPack, RolePlayPackError } from './rolePlayPack.js';

const FIXTURE = fileURLToPath(
  new URL('../../tests/fixtures/models/valid-traceable-subscription', import.meta.url),
);

const load = async () => {
  const { bundle, files } = await readModelRoot(FIXTURE);

  return { model: bundle, suite: loadValidationSuite(files) };
};

describe('buildRolePlayPack', () => {
  it('writes blank and source documents, role sheets and the facilitator card', async () => {
    const { model, suite } = await load();
    const pack = buildRolePlayPack({
      model,
      suite,
      scenarioId: 'scenario.successful-payment',
    });
    const paths = [...pack.files.keys()].sort();

    expect(paths).toEqual([
      'audit-checklist.md',
      'blank-documents/instance--gateway-payment-receipt.md',
      'blank-documents/instance--payment-confirmation.md',
      'blank-documents/instance--payment-request.md',
      'facilitator.md',
      'manifest.json',
      'role--platform-subscription.md',
      'role--subscriber.md',
      'source-documents/instance--subscription-contract.md',
    ]);
    // A given instance is readable; an issued one stays blank for the exercise.
    expect(pack.files.get('source-documents/instance--subscription-contract.md')).toContain(
      '`19900`',
    );
    expect(pack.files.get('blank-documents/instance--payment-request.md')).toContain(
      '________________',
    );
    expect(pack.files.get('facilitator.md')).toContain('`completed`');
  });

  it('refuses an unknown scenario and a failing one', async () => {
    const { model, suite } = await load();

    expect(() =>
      buildRolePlayPack({ model, suite, scenarioId: 'scenario.nope' }),
    ).toThrow(RolePlayPackError);

    const failing = {
      ...suite,
      instances: suite.instances.map((instance, index) =>
        index === 0 ? { ...instance, entityRef: 'role.subscriber' } : instance,
      ),
    };

    expect(() =>
      buildRolePlayPack({
        model,
        suite: failing,
        scenarioId: 'scenario.successful-payment',
      }),
    ).toThrow(/failing scenario/);
  });
});
