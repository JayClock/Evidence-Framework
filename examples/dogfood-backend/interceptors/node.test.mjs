import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBusinessTime, parseAsOf, withEvidenceClock } from './node.mjs';

const request = (asOf) => ({ headers: { 'x-evidence-asof': asOf } });

test('isolates overlapping asynchronous request clocks, with physical fallback', async () => {
  const times = ['2026-03-31T10:00:00Z', '2027-04-01T10:00:00Z'];
  const output = await Promise.all(
    times.map((value) =>
      withEvidenceClock(request(value), true, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        const now = getBusinessTime();
        now.setFullYear(2000); // no mutation of stored state
        return getBusinessTime().toISOString();
      }),
    ),
  );
  assert.deepEqual(
    output,
    times.map((value) => new Date(value).toISOString()),
  );
  const before = Date.now();
  for (const header of [undefined, 'invalid', '2026-02-30T00:00:00Z']) {
    withEvidenceClock(request(header), true, () =>
      assert.ok(getBusinessTime().getTime() >= before),
    );
  }
  withEvidenceClock(request(times[0]), false, () =>
    assert.ok(getBusinessTime().getTime() >= before),
  );
  assert.ok(getBusinessTime().getTime() >= before);
});

test('validates explicit UTC dates and restores context after failure', async () => {
  assert.equal(parseAsOf('2026-03-31T10:00:00+08:00'), undefined);
  assert.equal(parseAsOf('2026-03-31T10:00:00.123Z').getUTCMilliseconds(), 123);
  await assert.rejects(
    withEvidenceClock(request('2001-01-01T00:00:00Z'), true, async () => {
      throw new Error('failed request');
    }),
  );
  assert.ok(getBusinessTime().getUTCFullYear() > 2001);
});
