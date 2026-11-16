import { Validator } from '@seriousme/openapi-schema-validator';
import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';

import { procurementEvolution } from '../testing/procurement.js';
import { contractProblems } from '../testing/openapi.js';
import {
  operationFor,
  resolveSchema,
  type Operation,
} from '../testing/contract.js';
import { readModelRoot } from '@evidence-poc/evidence-model-io';
import { fullLifecycle } from '../testing/fixtures.js';
import { buildDelivery } from '../projector.js';

const compileTypes = (source: string): readonly ts.Diagnostic[] => {
  const filename = '/virtual/contract.ts';
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (
    name,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    name === filename
      ? ts.createSourceFile(name, source, languageVersion, true)
      : original(name, languageVersion, onError, shouldCreateNewSourceFile);
  return ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
};
const diagnosticText = (diagnostics: readonly ts.Diagnostic[]): string[] =>
  diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  );

const stages = procurementEvolution();
const validator = new Validator();

describe('OpenAPI consumer contract', () => {
  it.each(stages.map((document, index) => [index + 1, document] as const))(
    'validates lifecycle stage %s with the bundled OpenAPI 3.1 meta-schema',
    async (_stage, document) => {
      const snapshot = buildDelivery(document);
      const original = JSON.stringify(snapshot);
      const result = await validator.validate({ ...snapshot.openapi });
      expect(result.valid, JSON.stringify(result.errors)).toBe(true);
      expect(validator.version).toBe('3.1');
      expect(contractProblems(snapshot.openapi)).toEqual([]);
      expect(JSON.stringify(snapshot)).toBe(original);
      // The whole generated surface must reject server-owned values, not just one sample route.
      for (const route of snapshot.routes.filter(
        (route) => route.method === 'POST',
      )) {
        const operation = operationFor(snapshot, route.id);
        const input =
          operation.requestBody!.content['application/json']!.schema;
        expect(input.additionalProperties).toBe(false);
        expect(Object.keys(input.properties!).sort()).toEqual(
          route.fields.map((field) => field.name).sort(),
        );
        for (const field of [...route.derived, ...route.stamped]) {
          expect(input.properties).not.toHaveProperty(field.name);
          const output = resolveSchema(
            snapshot.openapi,
            operation.responses['201']!.content!['application/hal+json']!
              .schema,
          );
          expect(output.properties![field.name]).toMatchObject({
            readOnly: true,
            'x-evidence-caller-input': false,
          });
        }
      }
    },
  );

  it('also validates the full saved model through the same generation path', async () => {
    const { bundle } = await readModelRoot(fullLifecycle().modelRoot);
    const contract = buildDelivery(bundle).openapi;
    const result = await validator.validate({ ...contract });
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
    expect(contractProblems(contract)).toEqual([]);
  });

  it('projects entity examples into request, response and component examples', async () => {
    const document = structuredClone(stages[3]!);
    const baseline = buildDelivery(document);
    const route = baseline.routes.find(
      (item) => item.id === 'route.confirm.confirmation.payment',
    )!;
    const entity = document.entities.find(
      (item) => item.id === route.entityRef,
    )!;
    entity.examples = [
      {
        label: 'standard',
        description: 'A complete business moment.',
        value: Object.fromEntries(
          route.outputFields.map((field) => [
            field.name,
            field.valueType === 'timestamp'
              ? '2026-01-01T00:00:00Z'
              : ['money', 'decimal', 'int', 'uint', 'double'].includes(
                    field.valueType,
                  )
                ? 42
                : 'sample',
          ]),
        ),
      },
    ];

    const snapshot = buildDelivery(document);
    const operation = operationFor(snapshot, route.id);
    const requestExamples =
      operation.requestBody!.content['application/json']!.examples!;
    const responseExamples =
      operation.responses['201']!.content!['application/hal+json']!.examples!;
    const componentExamples = snapshot.openapi.components.examples;

    expect(snapshot.diagnostics).toEqual([]);
    expect(Object.values(requestExamples)).toHaveLength(1);
    expect(Object.values(requestExamples)[0]).toMatchObject({
      summary: 'standard',
      value: Object.fromEntries(
        route.fields.map((field) => [
          field.name,
          entity.examples![0]!.value[field.name],
        ]),
      ),
    });
    expect(Object.values(responseExamples)[0]).toMatchObject({
      summary: 'standard',
    });
    expect(Object.values(componentExamples)).toHaveLength(1);
    expect(contractProblems(snapshot.openapi)).toEqual([]);
    expect((await validator.validate({ ...snapshot.openapi })).valid).toBe(
      true,
    );
  });
  it.each([
    { label: 'missing', value: {} },
    {
      label: 'wrong-type',
      value: {
        id: 123,
        proof_id: 'p',
        total_amount: 'invalid',
        confirmed_at: 'not a timestamp',
      },
    },
    {
      label: 'extra',
      value: {
        id: 'a',
        proof_id: 'p',
        total_amount: 42,
        confirmed_at: '2026-01-01T00:00:00Z',
        unexpected: true,
      },
    },
  ])('rejects invalid example facts: $label', (example) => {
    const document = structuredClone(stages[3]!);
    document.entities.find(
      (entity) => entity.id === 'confirmation.payment',
    )!.examples = [example];
    expect(buildDelivery(document).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'API_EXAMPLE_INVALID' }),
    );
  });

  it('rejects invalid OpenAPI structure instead of accepting a JSON-shaped object', async () => {
    const contract = structuredClone(buildDelivery(stages[3]!).openapi);
    const raw: Record<string, unknown> = { ...contract };
    raw['info'] = { title: 'Missing version' };
    expect((await validator.validate(raw)).valid).toBe(false);
  });

  it.each(['reference', 'duplicate-id', 'path-parameter', 'get-body'] as const)(
    'detects semantic corruption: %s',
    (kind) => {
      const contract = structuredClone(buildDelivery(stages[3]!).openapi);
      const operations = Object.values(contract.paths).flatMap((methods) =>
        Object.entries(methods).map(
          ([method, operation]) => [method, operation as Operation] as const,
        ),
      );
      const post = operations.find(([method]) => method === 'post')![1];
      const get = operations.find(
        ([method, operation]) =>
          method === 'get' && operation.parameters.length > 0,
      )![1];
      if (kind === 'reference')
        contract.components.schemas['Broken'] = {
          $ref: '#/components/schemas/Absent',
        };
      if (kind === 'duplicate-id') get.operationId = post.operationId;
      if (kind === 'path-parameter') get.parameters[0]!.required = false;
      if (kind === 'get-body') get.requestBody = post.requestBody;
      expect(contractProblems(contract).length).toBeGreaterThan(0);
    },
  );

  it('generates and strictly compiles real consumer types with no scalar type escape', async () => {
    const contract = buildDelivery(stages[3]!).openapi;
    // A local object with checked local refs: generation never fetches a document.
    expect(contractProblems(contract)).toEqual([]);
    const original = JSON.stringify(contract);
    const ast = await openapiTS(JSON.stringify(contract), { silent: true });
    const source = astToString(ast);
    expect(JSON.stringify(contract)).toBe(original);
    const escapes: string[] = [];
    const inspect = (node: ts.Node): void => {
      // HTTP response headers are an open transport map, not a payload type escape.
      if (ts.isPropertySignature(node) && node.name.getText() === 'headers')
        return;
      if (
        node.kind === ts.SyntaxKind.AnyKeyword ||
        node.kind === ts.SyntaxKind.UnknownKeyword
      )
        escapes.push(ts.SyntaxKind[node.kind]!);
      ts.forEachChild(node, inspect);
    };
    inspect(
      ts.createSourceFile('types.ts', source, ts.ScriptTarget.Latest, true),
    );
    expect(escapes).toEqual([]);
    const usage = `
      type Assert<T extends true> = T;
      type Confirm = operations["confirmConfirmationPayment"];
      type Input = Confirm["requestBody"]["content"]["application/json"];
      type Output = Confirm["responses"][201]["content"]["application/hal+json"];
      type NoAmountInput = Assert<"total_amount" extends keyof Input ? false : true>;
      type NoTimeInput = Assert<"confirmed_at" extends keyof Input ? false : true>;
      type AmountOutput = Assert<Output["total_amount"] extends number ? true : false>;
      type TimeOutput = Assert<Output["confirmed_at"] extends string ? true : false>;
      type CallerProof = Assert<Input["proof_id"] extends string ? true : false>;
      type PathParameters = Assert<Confirm["parameters"]["path"]["contractId"] extends string ? true : false>;
      type Navigation = Assert<Output["_links"][string]["href"] extends string ? true : false>;
    `;
    expect(diagnosticText(compileTypes(source + usage))).toEqual([]);
    // Negative control: compiler diagnostics really run, and cannot accept a forged caller amount.
    expect(
      compileTypes(
        source +
          usage +
          '\nconst forged: Input = { id: "a", proof_id: "p", total_amount: 1 };',
      ).some((diagnostic) => diagnostic.code === 2353),
    ).toBe(true);
  }, 15000);
});
