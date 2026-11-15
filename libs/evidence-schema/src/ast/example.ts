import { z } from 'zod';
import { DomainIdSchema } from './id.js';

/** Test-only metadata attached to a concrete model example, never a separate suite. */
export const ExampleTestASTSchema = z
  .object({
    flow: z.string().min(1),
    tags: z.array(z.string().min(1)).optional(),
    actingRoleRef: DomainIdSchema,
    asOf: z.string().min(1),
    basedOn: z.array(z.string().min(1)).optional(),
    expectedStatus: z.number().int().min(200).max(599).optional(),
    inputs: z.record(z.unknown()).optional(),
    pathParameters: z
      .record(
        z
          .object({
            exampleRef: z.string().min(1),
            jsonpath: z.string().startsWith('$'),
          })
          .strict(),
      )
      .optional(),
    expect: z.record(z.unknown()).optional(),
  })
  .strict();

export type ExampleTestAST = z.infer<typeof ExampleTestASTSchema>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Shape checks only. Model/route-dependent resolution belongs to the projector. */
export function exampleTestErrors(value: unknown): string[] {
  if (!record(value)) return ['test must be an object'];
  const errors: string[] = [];
  const keys = new Set([
    'flow',
    'tags',
    'actingRoleRef',
    'asOf',
    'basedOn',
    'expectedStatus',
    'inputs',
    'pathParameters',
    'expect',
  ]);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) errors.push(`unsupported test field '${key}'`);
  }
  for (const key of ['flow', 'actingRoleRef']) {
    if (!text(value[key])) errors.push(`${key} must be a non-empty string`);
  }
  if (
    !text(value.asOf) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      String(value.asOf),
    ) ||
    Number.isNaN(Date.parse(String(value.asOf)))
  ) {
    errors.push('asOf must be an RFC 3339 timestamp with an explicit offset');
  }
  if (
    value.tags !== undefined &&
    (!Array.isArray(value.tags) ||
      !value.tags.every(text) ||
      new Set(value.tags).size !== value.tags.length)
  )
    errors.push('tags must contain unique non-empty strings');
  if (
    value.basedOn !== undefined &&
    (!Array.isArray(value.basedOn) ||
      !value.basedOn.every(text) ||
      new Set(value.basedOn).size !== value.basedOn.length)
  ) {
    errors.push('basedOn must contain unique non-empty example references');
  }
  if (
    value.expectedStatus !== undefined &&
    (!Number.isInteger(value.expectedStatus) ||
      Number(value.expectedStatus) < 200 ||
      Number(value.expectedStatus) > 599)
  ) {
    errors.push('expectedStatus must be an HTTP response status (200..599)');
  }
  for (const key of ['inputs', 'expect']) {
    if (value[key] !== undefined && !record(value[key]))
      errors.push(`${key} must be an object`);
  }
  if (value.inputs !== undefined && !(Number(value.expectedStatus) >= 400)) {
    errors.push('inputs override is only allowed for explicit negative tests');
  }
  if (
    record(value.expect) &&
    Object.keys(value.expect).some((key) => !key.startsWith('$'))
  )
    errors.push('expect keys must be JSONPath expressions');
  if (value.pathParameters !== undefined) {
    if (!record(value.pathParameters))
      errors.push('pathParameters must be an object');
    else
      for (const source of Object.values(value.pathParameters)) {
        if (
          !record(source) ||
          Object.keys(source).some(
            (key) => !['exampleRef', 'jsonpath'].includes(key),
          ) ||
          !text(source.exampleRef) ||
          !text(source.jsonpath) ||
          !source.jsonpath.startsWith('$')
        ) {
          errors.push(
            'pathParameters entries require exampleRef and a JSONPath',
          );
        }
      }
  }
  return errors;
}
