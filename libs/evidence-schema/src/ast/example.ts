import { z } from 'zod';
import { DomainIdSchema } from './id.js';
import { JsonObjectSchema } from './json.js';

const text = z.string().regex(/\S/, 'must be a non-empty string');
const uniqueTexts = z
  .array(text)
  .refine(
    (values) => new Set(values).size === values.length,
    'must contain unique non-empty strings',
  );

/** Test-only metadata; route-dependent resolution belongs to the projector. */
export const ExampleTestASTSchema = z
  .object({
    flow: text,
    tags: uniqueTexts.optional(),
    actingRoleRef: DomainIdSchema,
    asOf: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
        'asOf must be an RFC 3339 timestamp with an explicit offset',
      )
      .refine(
        (value) => !Number.isNaN(Date.parse(value)),
        'invalid business clock',
      ),
    basedOn: uniqueTexts.optional(),
    expectedStatus: z.number().int().min(200).max(599).optional(),
    inputs: JsonObjectSchema.optional(),
    pathParameters: z
      .record(
        z
          .object({
            exampleRef: text,
            jsonpath: z.string().startsWith('$'),
          })
          .strict(),
      )
      .optional(),
    expect: JsonObjectSchema.refine(
      (value) => Object.keys(value).every((key) => key.startsWith('$')),
      'expect keys must be JSONPath expressions',
    ).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.inputs !== undefined &&
      !(value.expectedStatus !== undefined && value.expectedStatus >= 400)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['inputs'],
        message: 'inputs override is only allowed for explicit negative tests',
      });
    }
  });

export type ExampleTestAST = z.infer<typeof ExampleTestASTSchema>;
