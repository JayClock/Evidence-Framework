import { buildFmCheckReport } from './fmCheck.js';
import { fileURLToPath } from 'node:url';

import { readModelRoot } from '../../tests/support/modelRoot.js';
import {
  ScopeSelectionError,
  completenessGaps,
  completenessIssues,
  pairingGaps,
  referencesOf,
  readyScope,
  selectScope,
} from './scope.js';

const fixture = (name: string): string =>
  fileURLToPath(
    new URL(`../../tests/fixtures/models/${name}`, import.meta.url),
  );

const load = async (name: string) => {
  const { bundle } = await readModelRoot(fixture(name));

  return { bundle };
};

describe('model hand-off report v6', () => {
  it('accepts static completeness without claiming to have executed backend tests', async () => {
    const { bundle } = await load('valid-traceable-subscription');
    const { report } = buildFmCheckReport({
      model: bundle,
      scopeRefs: ['context.content-subscription'],
    });
    expect(report.valid).toBe(true);
    expect(report.checkVersion).toBe(6);
    expect(report).not.toHaveProperty('simulationPassed');
    expect(readyScope(bundle, report).entities.length).toBeGreaterThan(0);
    expect(() => readyScope(bundle, { ...report, checkVersion: 5 })).toThrow(
      'successful scope completeness',
    );
  });
  it('never treats test example refs or raw input Ref keys as model scope edges', () => {
    expect([
      ...referencesOf({
        contextRef: 'context.owner',
        examples: [
          {
            value: { contextRef: 'context.unrelated' },
            test: { basedOn: ['contract.unrelated#sample'] },
          },
        ],
      }),
    ]).toEqual(['context.owner']);
  });
});

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
    expect(scoped.entities.every((entity) => entity.id.startsWith(''))).toBe(
      true,
    );
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
        (entity) =>
          entity.category !== 'evidence' ||
          entity.kind !== 'fulfillment_request',
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
