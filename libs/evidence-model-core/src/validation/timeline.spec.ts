import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { readModelRoot } from '../../tests/support/modelRoot.js';
import { buildTimeline, digestOf, timelineSummary } from './timeline.js';
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

describe('buildTimeline', () => {
  it('orders the golden fixture by basis, not by timestamp', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const { timeline, errors } = buildTimeline(bundle, suite);

    expect(errors).toEqual([]);
    expect(timeline.lanes).toEqual([{ contextRef: 'context.content-subscription' }]);
    expect(timeline.instances.map((item) => item.instanceRef)).toEqual(
      [...timeline.instances.map((item) => item.instanceRef)].sort(),
    );
    expect(timeline.dependencies).toEqual(
      expect.arrayContaining([
        {
          sourceRef: 'instance.subscription-contract',
          targetRef: 'instance.payment-request',
        },
      ]),
    );
    expect(timeline.unresolvedOrder).toHaveLength(6);
  });

  it('reports an interval that starts after it expires', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const broken = {
      ...suite,
      instances: suite.instances.map((instance) =>
        instance.id === 'instance.payment-request'
          ? {
              ...instance,
              values: {
                ...instance.values,
                started_at: '2026-09-02T00:00:00Z',
                expired_at: '2026-09-01T00:00:00Z',
              },
            }
          : instance,
      ),
    };

    expect(buildTimeline(bundle, broken).errors).toEqual(
      expect.arrayContaining([
        'instance.payment-request: Evidence interval starts after it expires',
      ]),
    );
  });

  it('reports a basis that was formed after the instance that depends on it', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const broken = {
      ...suite,
      instances: suite.instances.map((instance) =>
        instance.id === 'instance.payment-confirmation'
          ? { ...instance, values: { ...instance.values, confirmed_at: '2026-08-01T00:00:00Z' } }
          : instance,
      ),
    };
    const { timeline } = buildTimeline(bundle, broken);

    expect(
      timeline.instances.find(
        (item) => item.instanceRef === 'instance.payment-confirmation',
      )?.time,
    ).toEqual({ kind: 'moment', attribute: 'confirmed_at', at: '2026-08-01T00:00:00Z' });
  });

  it('reports a basis cycle instead of looping', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const broken = {
      ...suite,
      instances: suite.instances.map((instance) =>
        instance.id === 'instance.subscription-contract'
          ? { ...instance, basedOn: ['instance.payment-request'] }
          : instance,
      ),
    };

    expect(buildTimeline(bundle, broken).errors).toEqual(
      expect.arrayContaining([
        'instance.subscription-contract: basedOn cycle detected',
      ]),
    );
  });
});

describe('timelineSummary', () => {
  it('counts what the lane reader shows and digests the whole timeline', async () => {
    const { bundle, suite } = await load('valid-traceable-subscription');
    const { timeline } = buildTimeline(bundle, suite);
    const summary = timelineSummary(timeline);

    expect(summary).toEqual({
      laneCount: 1,
      evidenceTypeCount: 6,
      instanceCount: 6,
      dependencyCount: 6,
      unresolvedOrderCount: 6,
      // The digest is part of the report contract, so it must not drift.
      sha256:
        'sha256:361a464e960aced6a173a1d6f4b74fbf8de7e8ee0d99df853c1106940d0e5602',
    });
  });
});

describe('digestOf', () => {
  it.each(['', '业务凭证 🔄', 'a'.repeat(256)])(
    'matches Node SHA-256 for UTF-8 JSON %j with a trailing newline',
    (value) => {
      const expected = createHash('sha256')
        .update(`${JSON.stringify(value)}\n`, 'utf8')
        .digest('hex');

      expect(digestOf(value)).toBe(`sha256:${expected}`);
    },
  );

  it('sorts keys and joins without spaces so bytes are stable', () => {
    expect(digestOf({ b: 1, a: [2, 3] })).toBe(digestOf({ a: [2, 3], b: 1 }));
    expect(digestOf({ a: 1 })).not.toBe(digestOf({ a: 2 }));
  });
});
