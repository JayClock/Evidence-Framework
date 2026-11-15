import { assertLiteralData } from './testLiterals.js';
import type { AcceptanceProjection } from '../delivery/scenarioProjector.js';

/** One independent Hurl document per flow: captures never leak across cases. */
export function renderHurl(
  projection: AcceptanceProjection,
): Record<string, string> {
  return Object.fromEntries(
    projection.flows.map((flow, index) => {
      const parts = [
        '# Generated from inline model examples. Test environment only.',
      ];
      for (const step of flow.steps) {
        assertLiteralData(
          [step.inputs, step.assertions, step.captures],
          '{{',
          step.ref,
        );
        const path = step.route.path.replace(
          /\{([^{}]+)\}/g,
          (_match, name: string) => `{{${step.parameters[name]}}}`,
        );
        parts.push(
          `# ${JSON.stringify(step.ref)}`,
          `${step.route.method} {{host}}${path}`,
          'Content-Type: application/json',
          `x-evidence-role: ${step.actingRoleRef}`,
          `x-evidence-asof: ${step.asOf}`,
          JSON.stringify(step.inputs, null, 2),
          '',
          `HTTP ${step.status}`,
        );
        if (Object.keys(step.captures).length > 0) {
          parts.push(
            '[Captures]',
            ...Object.entries(step.captures).map(
              ([name, jsonpath]) =>
                `${name}: jsonpath ${JSON.stringify(jsonpath)}`,
            ),
          );
        }
        if (Object.keys(step.assertions).length > 0) {
          parts.push(
            '[Asserts]',
            ...Object.entries(step.assertions).map(([jsonpath, expected]) => {
              if (expected !== null && typeof expected === 'object')
                throw new Error(
                  `HURL_UNSUPPORTED: ${step.ref}: object/list equality at ${jsonpath}; use Step CI`,
                );
              return `jsonpath ${JSON.stringify(jsonpath)} == ${JSON.stringify(expected)}`;
            }),
          );
        }
        parts.push('');
      }
      return [
        `flow-${String(index + 1).padStart(3, '0')}.hurl`,
        parts.join('\n') + '\n',
      ];
    }),
  );
}
