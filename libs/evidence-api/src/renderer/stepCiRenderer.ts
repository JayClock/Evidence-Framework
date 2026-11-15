import { stringify } from 'yaml';
import type { AcceptanceProjection } from '../delivery/scenarioProjector.js';

/** Step CI 2.x uses Liquid templates (not GitHub Actions' ${{...}} syntax). */
export function renderStepCi(projection: AcceptanceProjection): string {
  const tests = Object.fromEntries(
    projection.flows.map((flow, index) => [
      `flow_${index + 1}`,
      {
        name: flow.id,
        steps: flow.steps.map((step) => ({
          name: step.ref,
          http: {
            url: `{{env.host}}${step.route.path.replace(/\{([^{}]+)\}/g, (_match, name: string) => `{{captures.${step.parameters[name]}}}`)}`,
            method: step.route.method,
            followRedirects: false,
            timeout: '5s',
            headers: {
              'Content-Type': 'application/json',
              // Test harness protocol only; not production authorization or clock control.
              'x-evidence-role': step.actingRoleRef,
              'x-evidence-asof': step.asOf,
            },
            json: step.inputs,
            ...(Object.keys(step.captures).length === 0
              ? {}
              : {
                  captures: Object.fromEntries(
                    Object.entries(step.captures).map(([name, path]) => [
                      name,
                      { jsonpath: path },
                    ]),
                  ),
                }),
            check: {
              status: step.status,
              ...(Object.keys(step.assertions).length === 0
                ? {}
                : { jsonpath: step.assertions }),
            },
          },
        })),
      },
    ]),
  );
  return (
    '# Generated from inline model examples. Do not edit. Test environment only.\n' +
    stringify({
      version: '1.1',
      name: `${projection.modelId} acceptance`,
      env: { host: 'http://localhost:8080' },
      config: { concurrency: 1, continueOnFail: false },
      tests,
    })
  );
}
