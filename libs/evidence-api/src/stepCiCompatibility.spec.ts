import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runFromYAML } from '@stepci/runner';
import { expect, it } from 'vitest';
import { createAcceptanceModel } from '../tests/support/acceptance.js';
import { projectAcceptanceTests } from './delivery/scenarioProjector.js';
import { renderStepCi } from './renderer/stepCiRenderer.js';

/** Syntax/wire smoke only. Independent business behavior is tested separately. */
it('official Step CI Runner consumes emitted YAML and resolves chained captures', async () => {
  const projection = projectAcceptanceTests(createAcceptanceModel());
  const steps = projection.flows[0]!.steps;
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const step = steps[requests.length]!;
    requests.push(request.url!);
    response.writeHead(step.status, { 'content-type': 'application/json' });
    // A fixed response for the syntax smoke: not an implementation of the model.
    response.end(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(step.assertions).map(([path, value]) => [
            JSON.parse(path.slice(2, -1)),
            value,
          ]),
        ),
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const result = await runFromYAML(renderStepCi(projection), {
      env: { host },
    });
    expect(
      result.result.passed,
      JSON.stringify(result.result.tests, null, 2),
    ).toBe(true);
    expect(requests).toHaveLength(3);
    expect(requests[2]).toContain('/request/request-001/confirmation');
    expect(
      result.result.tests[0]!.steps.every(
        (step) => !step.skipped && !step.errored,
      ),
    ).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
