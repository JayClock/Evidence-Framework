import { stringify } from 'yaml';
import { assertLiteralData } from './testLiterals.js';
import type { AcceptanceProjection } from '../delivery/scenarioProjector.js';

/** Step CI 2.x configures Liquidless with the `${{...}}` delimiter. */
export function renderStepCi(projection: AcceptanceProjection): string {
  for (const flow of projection.flows)
    for (const step of flow.steps) {
      assertLiteralData(
        [
          step.ref,
          step.asOf,
          step.actingRoleRef,
          step.inputs,
          step.assertions,
          step.captures,
          step.responseSchema,
        ],
        '${{',
        step.ref,
      );
    }
  // Preserve distinct per-step clocks; env.asOf overrides the common clock via
  // the official Runner, while additional clock variables retain timeline cases.
  const clocks = [
    ...new Set(
      projection.flows.flatMap((flow) => flow.steps.map((step) => step.asOf)),
    ),
  ];
  const clockKey = (asOf: string): string => {
    const index = clocks.indexOf(asOf);
    return index === 0 ? 'asOf' : `asOf_${index + 1}`;
  };
  const tests = Object.fromEntries(
    projection.flows.map((flow, index) => [
      `flow_${index + 1}`,
      {
        name: flow.id,
        steps: flow.steps.map((step) => ({
          name: step.ref,
          http: {
            url:
              '${{env.host}}' +
              step.route.path.replace(
                /\{([^{}]+)\}/g,
                (_match, name: string) =>
                  '${{captures.' + step.parameters[name] + '}}',
              ),
            method: step.route.method,
            followRedirects: false,
            timeout: '5s',
            headers: {
              'Content-Type': 'application/json',
              // Test harness protocol only; not production authorization or clock control.
              'x-evidence-role': step.actingRoleRef,
              'x-evidence-asof': '${{env.' + clockKey(step.asOf) + '}}',
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
              ...(step.responseSchema === undefined
                ? {}
                : { schema: step.responseSchema }),
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
    stringify(
      {
        version: '1.1',
        name: `${projection.modelId} acceptance`,
        env: {
          host: 'http://localhost:8080',
          ...Object.fromEntries(
            clocks.map((clock) => [clockKey(clock), clock]),
          ),
        },
        config: { concurrency: 1, continueOnFail: false },
        tests,
      },
      // The Runner uses YAML 1.1: unquoted ISO timestamps become Date objects,
      // which its template walker reconstructs using wall time. Quote literals.
      { defaultStringType: 'QUOTE_DOUBLE' },
    )
  );
}
