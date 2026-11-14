import { fileURLToPath } from 'node:url';

import { readModelRoot } from '../../tests/support/modelRoot.js';
import {
  loadValidationSuite,
  validateValidationSuite,
  validationSuiteFromFiles,
} from './validationSuite.js';
import { normalizeJsonValue, validateTypedValue } from './typedValues.js';

const fixture = (name: string): string =>
  fileURLToPath(
    new URL(
      `../../tests/fixtures/models/${name}`,
      import.meta.url,
    ),
  );

describe('readModelRoot', () => {
  it('reads the model sources and the validation inputs', async () => {
    const { bundle, issues, files } = await readModelRoot(
      fixture('valid-traceable-subscription'),
    );

    expect(issues).toEqual([]);
    expect(bundle.manifest.id).toBe('traceable-subscription');
    expect(bundle.validation?.instances).toHaveLength(6);
    expect(bundle.validation?.scenarios).toHaveLength(3);
    expect(files.map((file) => file.path)).toContain(
      'validation/scenarios/scenario--successful-payment.json',
    );
  });

  it('reads a missing root as empty instead of throwing', async () => {
    expect(await readModelRoot(fixture('does-not-exist'))).toMatchObject({
      files: [],
      issues: expect.arrayContaining([
        { path: 'model.json', message: 'model.json is required at the model root.' },
      ]),
    });
  });
});

describe('loadValidationSuite', () => {
  it('parses the fixture validation documents', async () => {
    const { files } = await readModelRoot(fixture('valid-traceable-subscription'));
    const suite = loadValidationSuite(files);

    expect(suite.errors).toEqual([]);
    expect(suite.scenarios.map((scenario) => scenario.id).sort()).toEqual([
      'scenario.content-access-after-payment',
      'scenario.overdue-payment',
      'scenario.successful-payment',
    ]);
    expect(suite.instances[0]?.type).toBe('evidence_instance');
  });

  it('reports a filename that does not match its id', () => {
    const suite = validationSuiteFromFiles([
      {
        path: 'validation/instances/instance--renamed.json',
        content: JSON.stringify({
          type: 'evidence_instance',
          id: 'instance.payment-request',
          entityRef: 'request.content-payment',
          values: {},
        }),
      },
      {
        path: 'validation/scenarios/scenario--x.json',
        content: JSON.stringify({
          type: 'fm_scenario',
          id: 'scenario.x',
          label: 'x',
          asOf: '2026-09-01T00:00:00Z',
          steps: [],
          expectations: { fulfillmentStatuses: [] },
        }),
      },
    ]);

    expect(suite.errors).toEqual(
      expect.arrayContaining([
        "validation/instances/instance--renamed.json: filename must be 'instance--payment-request.json' for id 'instance.payment-request'",
        'validation/scenarios/scenario--x.json/steps: must be an array with at least one step',
      ]),
    );
  });

  it('reports duplicate ids and unknown properties', () => {
    const document = (id: string, extra = ''): string =>
      JSON.stringify({
        type: 'evidence_instance',
        id,
        entityRef: 'request.content-payment',
        values: {},
        ...(extra === '' ? {} : { [extra]: true }),
      });

    const suite = validationSuiteFromFiles([
      { path: 'validation/instances/a.json', content: document('instance.a') },
      { path: 'validation/instances/b.json', content: document('instance.a') },
      { path: 'validation/instances/c.json', content: document('instance.c', 'extra') },
    ]);

    expect(suite.errors).toEqual(
      expect.arrayContaining([
        "validation/instances/c.json: must NOT have additional property 'extra'",
        "validation/instances/b.json: duplicate validation id 'instance.a' already defined in validation/instances/a.json",
      ]),
    );
  });

  it('stays quiet when the tree carries no validation inputs at all', () => {
    expect(
      loadValidationSuite([
        { path: 'model.json', content: '{"id":"model.x"}' },
        { path: 'entities/entity--a.json', content: '{}' },
      ]),
    ).toEqual({ instances: [], scenarios: [], errors: [] });
  });
});

describe('validateValidationSuite', () => {
  it('accepts the golden fixture', async () => {
    const { bundle, files } = await readModelRoot(
      fixture('valid-traceable-subscription'),
    );

    expect(
      validateValidationSuite(bundle, loadValidationSuite(files)),
    ).toEqual([]);
  });

  it('rejects an instance whose entity is not Evidence', async () => {
    const { bundle, files } = await readModelRoot(
      fixture('valid-traceable-subscription'),
    );
    const suite = loadValidationSuite(files);
    const broken = {
      ...suite,
      instances: suite.instances.map((instance, index) =>
        index === 0 ? { ...instance, entityRef: 'role.platform-subscription' } : instance,
      ),
    };

    expect(validateValidationSuite(bundle, broken)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('entityRef must reference an Evidence Entity'),
      ]),
    );
  });

  it('rejects a step before its basedOn instance is issued', async () => {
    const { bundle, files } = await readModelRoot(
      fixture('valid-traceable-subscription'),
    );
    const suite = loadValidationSuite(files);
    const target = suite.scenarios.find(
      (scenario) => scenario.id === 'scenario.overdue-payment',
    );
    const broken = {
      ...suite,
      scenarios: suite.scenarios.map((scenario) =>
        scenario.id === 'scenario.overdue-payment'
          ? { ...scenario, givenInstanceRefs: [] }
          : scenario,
      ),
    };

    expect(target).toBeDefined();
    expect(validateValidationSuite(bundle, broken)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "basedOn instance 'instance.subscription-contract' must already be available",
        ),
      ]),
    );
  });
});

describe('validateTypedValue', () => {
  it('accepts each FM value type and reports the rest', () => {
    expect(validateTypedValue(true, 'bool')).toBeNull();
    expect(validateTypedValue(3, 'int')).toBeNull();
    expect(validateTypedValue(-1, 'uint')).toBe(
      'must be a non-negative integer',
    );
    expect(validateTypedValue('199.00', 'decimal')).toBeNull();
    expect(validateTypedValue('nope', 'decimal')).toBe(
      'must be numeric or a decimal string',
    );
    expect(validateTypedValue('2026-09-01T09:15:00Z', 'timestamp')).toBeNull();
    expect(validateTypedValue('2026-09-01', 'timestamp')).toBe(
      'must be an RFC 3339 timestamp',
    );
    expect(validateTypedValue('2026-09-01', 'date')).toBeNull();
    expect(validateTypedValue('30m', 'duration')).toBeNull();
    expect(validateTypedValue('soon', 'duration')).toBe(
      'must be a CEL duration string',
    );
    expect(validateTypedValue('role.party', 'id')).toBeNull();
    expect(validateTypedValue({ minorUnits: 1 }, 'money')).toBe(
      'currency must be a non-empty string',
    );
    expect(validateTypedValue('anything', 'dynamic')).toBeNull();
  });
});

describe('normalizeJsonValue', () => {
  it('prints timestamps in UTC seconds and keeps other values', () => {
    expect(normalizeJsonValue('2026-09-01T17:15:00+08:00')).toBe(
      '2026-09-01T09:15:00Z',
    );
    expect(normalizeJsonValue('plain text')).toBe('plain text');
    expect(normalizeJsonValue([19900, { at: '2026-09-01T09:15:00.500Z' }])).toEqual([
      19900,
      { at: '2026-09-01T09:15:00Z' },
    ]);
  });
});
