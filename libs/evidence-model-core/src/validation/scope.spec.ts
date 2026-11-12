import { fileURLToPath } from 'node:url';

import { readModelRoot } from '../adapters/modelRoot.js';
import {
  ScopeSelectionError,
  completenessGaps,
  completenessIssues,
  pairingGaps,
  referencesOf,
  scopeSuite,
  selectScope,
  simulationRules,
} from './scope.js';
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

describe('referencesOf', () => {
  it('collects endpoints, rule bindings and instance basis', () => {
    expect(
      [
        ...referencesOf({
          sourceRef: 'a',
          targetRef: 'b',
          bindings: { x: { ref: 'c' }, y: { targetRefs: ['d'] } },
          basedOn: ['e'],
          nested: { parentContextRef: 'f' },
        }),
      ].sort(),
    ).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});

describe('selectScope', () => {
  it('keeps the selected Contract Context and what it really needs', async () => {
    const { bundle } = await load('valid-traceable-subscription');
    const scoped = selectScope(bundle, ['context.content-subscription']);
    const contextIds = scoped.entities
      .filter((entity) => entity.category === 'context')
      .map((entity) => entity.id)
      .sort();

    // The requested scope resolves to two Contexts: the Domain Context the
    // contract depends on comes along.
    expect(contextIds).toEqual(['context.cms', 'context.content-subscription']);
    expect(scoped.manifest.entryContextRefs).toEqual([
      'context.content-subscription',
    ]);
    expect(scoped.entities.every((entity) => entity.id.startsWith(''))).toBe(true);
  });

  it('refuses a child Context and a duplicated scope', async () => {
    const { bundle } = await load('valid-traceable-subscription');

    expect(() => selectScope(bundle, [])).toThrow(ScopeSelectionError);
    expect(() =>
      selectScope(bundle, [
        'context.content-subscription',
        'context.content-subscription',
      ]),
    ).toThrow(/distinct/);
    expect(() => selectScope(bundle, ['request.content-payment'])).toThrow(
      /must be an independent Context/,
    );
  });

  it('drops objects outside the scope', async () => {
    const { bundle } = await load('valid-traceable-subscription');
    const scoped = selectScope(bundle, ['context.content-subscription']);

    expect(scoped.rules.map((rule) => rule.id)).toEqual(
      expect.arrayContaining(['rule.content-payment-completed']),
    );
    expect(scoped.rules.length).toBeLessThanOrEqual(bundle.rules.length);
  });
});

describe('scopeSuite', () => {
  it('keeps the scenarios and instances the scope can run', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const scoped = scopeSuite(
      selectScope(bundle, ['context.content-subscription']),
      suite,
    );

    expect(scoped.scenarios.map((scenario) => scenario.id).sort()).toEqual([
      'scenario.content-access-after-payment',
      'scenario.overdue-payment',
      'scenario.successful-payment',
    ]);
    expect(scoped.instances.map((instance) => instance.id)).toEqual(
      expect.arrayContaining(['instance.payment-request']),
    );
  });

  it('drops a scenario the scope can neither execute nor resolve', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const scoped = scopeSuite({ ...bundle, rules: [], entities: [] }, suite);

    expect(scoped.scenarios).toEqual([]);
    expect(scoped.instances).toEqual([]);
  });
});

describe('simulationRules', () => {
  it('keeps Evidence rules and reports the rest as limitations', async () => {
    const { bundle } = await load('valid-traceable-subscription');
    const { rules, limitations } = simulationRules(bundle);

    expect(rules.map((rule) => rule.id)).toContain('rule.payment-expired');
    expect(limitations).toEqual([]);
  });
});

describe('completenessGaps', () => {
  it('reports nothing for the golden fixture', async () => {
    const { bundle } = await load('valid-traceable-subscription');

    expect(completenessIssues(bundle)).toEqual([]);
    expect(completenessGaps(bundle, [])).toEqual([]);
    expect(pairingGaps(bundle)).toEqual([]);
  });

  it('reports a Contract Context without its primary Fulfillment', async () => {
    const { bundle } = await load('valid-traceable-subscription');
    const withoutRequests = {
      ...bundle,
      entities: bundle.entities.filter(
        (entity) => entity.category !== 'evidence' || entity.kind !== 'fulfillment_request',
      ),
    };

    expect(completenessGaps(withoutRequests, [])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('requires its primary Fulfillment Request'),
      ]),
    );
  });

  it('reports a party that never holds a Fulfillment Request', async () => {
    const { bundle } = await load('valid-traceable-subscription');
    const gaps = pairingGaps(bundle);

    expect(gaps).toEqual([]);
  });
});
