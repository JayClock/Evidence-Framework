import type {
  AcceptanceProjection,
  AcceptanceStep,
} from '../delivery/scenarioProjector.js';
import { assertLiteralData } from './testLiterals.js';

const ordinal = (index: number) => String(index + 1).padStart(3, '0');
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const entries = <T>(record: Record<string, T>) =>
  Object.entries(record).sort(([a], [b]) => compareText(a, b));
const block = (name: string, lines: readonly string[]) =>
  `${name} {\n${lines.map((line) => `  ${line}`).join('\n')}\n}`;
const file = (...blocks: string[]) => `${blocks.join('\n\n')}\n`;
const unsupported = (ref: string, reason: string): never => {
  throw new Error(`BRUNO_UNSUPPORTED: ${ref}: ${reason}`);
};

// Inline Bru values must not be able to create another line/block or silently trim data.
function singleLine(value: string, label: string, ref: string): string {
  if (
    !value ||
    value.trim() !== value ||
    /[\r\n\t\u2028\u2029]/.test(value) ||
    value.startsWith("'''")
  )
    unsupported(ref, `${label} must be a Bru single-line value`);
  return value;
}

function literal(value: unknown, ref: string, indent?: number): string {
  return JSON.stringify(
    value,
    (_key, item: unknown) => {
      if (
        typeof item === 'number' &&
        (!Number.isFinite(item) ||
          (Number.isInteger(item) && !Number.isSafeInteger(item)))
      )
        unsupported(ref, 'unsafe numeric literal; use an exact decimal string');
      if (
        item === undefined ||
        typeof item === 'bigint' ||
        typeof item === 'function' ||
        typeof item === 'symbol'
      )
        unsupported(ref, 'expected a JSON literal');
      return item;
    },
    indent,
  );
}

/** Compile a single-node JSONPath, not an arbitrary expression, to a Bru JS accessor. */
function responseExpression(path: string, ref: string): string {
  if (!path.startsWith('$'))
    return unsupported(
      ref,
      `invalid response JSONPath ${JSON.stringify(path)}`,
    );
  let expression = 'res.body';
  let rest = path.slice(1);
  while (rest) {
    const segment =
      /^(?:\.([\p{L}_][\p{L}\p{N}_-]*)|\[(?:(0|[1-9]\d*)|("(?:[^"\\]|\\.)*")|'((?:[^'\\]|\\['\\])*)')\])/u.exec(
        rest,
      );
    if (!segment)
      return unsupported(
        ref,
        `expected a single-node JSONPath, got ${JSON.stringify(path)}`,
      );
    const [, dot, index, quoted, single] = segment;
    if (index !== undefined && !Number.isSafeInteger(Number(index)))
      return unsupported(
        ref,
        `unsafe JSONPath index in ${JSON.stringify(path)}`,
      );
    let key: string;
    try {
      key =
        dot ??
        index ??
        (quoted === undefined
          ? (single ?? '').replace(/\\(['\\])/g, '$1')
          : (JSON.parse(quoted) as string));
    } catch {
      return unsupported(
        ref,
        `invalid response JSONPath ${JSON.stringify(path)}`,
      );
    }
    expression += /^[A-Za-z_$][\w$]*$/.test(key)
      ? `?.${key}`
      : `?.[${index ?? JSON.stringify(key)}]`;
    rest = rest.slice(segment[0].length);
  }
  return expression;
}

function checks(step: AcceptanceStep): string[] {
  const assertions = [`res.status: eq ${step.status}`];
  const asserted = new Set<string>();
  const tests: string[] = [];
  if (step.status === 202) {
    tests.push(
      'test("202 requires a non-empty Location header", function () {',
      '  expect(res.getHeader("location")).to.be.a("string").and.match(/\\S/);',
      '});',
    );
  }
  for (const [path, expected] of entries(step.assertions)) {
    const expression = responseExpression(path, step.ref);
    const json = literal(expected, step.ref);
    // Bru parses assert keys up to the first colon and interpolates/trim strings on
    // the RHS. Use native Chai tests for any value that isn't unambiguous there.
    const native =
      expected === null ||
      typeof expected === 'boolean' ||
      typeof expected === 'number' ||
      (typeof expected === 'string' &&
        /^[\w./:\- ]+$/.test(expected) &&
        expected.trim() === expected);
    if (native && !expression.includes(':') && !asserted.has(expression)) {
      assertions.push(`${expression}: eq ${json}`);
      asserted.add(expression);
    } else {
      const deep = expected !== null && typeof expected === 'object';
      // JSON.parse preserves object keys such as __proto__ as data.
      tests.push(
        `test(${JSON.stringify(path)}, function () {`,
        `  expect(${expression}).to.${deep ? `deep.equal(JSON.parse(${JSON.stringify(json)}))` : `equal(${json})`};`,
        '});',
      );
    }
  }
  return [
    block('assert', assertions),
    ...(tests.length ? [block('tests', tests)] : []),
  ];
}

/** Render a native Bruno collection; no Node runner or legacy format involved. */
export function renderBruno(
  projection: AcceptanceProjection,
): Record<string, string> {
  const host = 'http://localhost:8080';
  const clocks = new Map<string, string>();
  const files: Record<string, string> = {
    'bruno.json': `${JSON.stringify({ version: '1', name: `${projection.modelId} acceptance`, type: 'collection' }, null, 2)}\n`,
    'collection.bru': file(
      block('docs', [
        'Generated from inline model examples. Do not edit. Test environment only.',
      ]),
    ),
    'flows/folder.bru': file(
      block('meta', ['name: Acceptance flows', 'seq: 1']),
    ),
  };
  projection.flows.forEach((flow, flowIndex) => {
    const folder = `flows/flow-${ordinal(flowIndex)}`;
    const tags = [...new Set(flow.tags ?? [])].sort(compareText);
    for (const tag of tags)
      if (!/^[\p{L}\p{N}_-]+$/u.test(tag))
        unsupported(flow.id, `invalid Bru tag ${JSON.stringify(tag)}`);
    assertLiteralData(flow.id, '{{', flow.id);
    files[`${folder}/folder.bru`] = file(
      block('meta', [
        `name: ${singleLine(flow.id, 'flow name', flow.id)}`,
        `seq: ${flowIndex + 1}`,
        ...(tags.length
          ? ['tags: [', ...tags.map((tag) => `  ${tag}`), ']']
          : []),
      ]),
    );
    // Bru runtime variables are collection-wide; every flow owns a unique namespace.
    const variables = new Map<string, string>();
    flow.steps.forEach((step, stepIndex) => {
      assertLiteralData(
        [
          step.ref,
          step.route.path,
          step.actingRoleRef,
          step.asOf,
          step.inputs,
          step.assertions,
          step.captures,
        ],
        '{{',
        step.ref,
      );
      let clock = clocks.get(step.asOf);
      if (!clock) {
        clock = clocks.size === 0 ? 'asOf' : `asOf_${clocks.size + 1}`;
        singleLine(step.asOf, 'clock', step.ref);
        clocks.set(step.asOf, clock);
      }
      const route = singleLine(step.route.path, 'route path', step.ref).replace(
        /\{([^{}]+)\}/g,
        (_match, parameter: string) => {
          const capture = step.parameters[parameter];
          const variable =
            capture === undefined ? undefined : variables.get(capture);
          if (!variable)
            return unsupported(
              step.ref,
              `missing upstream capture for '${parameter}'`,
            );
          return `{{${variable}}}`;
        },
      );
      const captures = entries(step.captures).map(([name, path], index) => {
        const variable = `capture_${flowIndex + 1}_${stepIndex + 1}_${index + 1}`;
        variables.set(name, variable);
        return `${variable}: ${responseExpression(path, step.ref)}`;
      });
      const slug = (step.ref.split('#', 1)[0] ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .slice(0, 64);
      files[`${folder}/${ordinal(stepIndex)}-${slug || 'request'}.bru`] = file(
        block('meta', [
          `name: ${singleLine(step.ref, 'step name', step.ref)}`,
          'type: http',
          `seq: ${stepIndex + 1}`,
        ]),
        block(step.route.method.toLowerCase(), [
          `url: {{host}}${route}`,
          'body: json',
          'auth: none',
        ]),
        block('headers', [
          'Content-Type: application/json',
          `x-evidence-role: ${singleLine(step.actingRoleRef, 'acting role', step.ref)}`,
          `x-evidence-asof: {{${clock}}}`,
        ]),
        block('body:json', literal(step.inputs, step.ref, 2).split('\n')),
        ...(captures.length ? [block('vars:post-response', captures)] : []),
        ...checks(step),
        block('settings', ['followRedirects: false', 'timeout: 5000']),
      );
    });
  });
  files['environments/test.bru'] = file(
    block('vars', [
      `host: ${host}`,
      ...[...clocks].map(([asOf, name]) => `${name}: ${asOf}`),
    ]),
  );
  return files;
}
