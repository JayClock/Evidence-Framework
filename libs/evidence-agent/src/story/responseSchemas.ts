import { z } from 'zod';

/** Accept an injected object or a model's JSON text, never executable content. */
export const responseObject = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  return JSON.parse(
    value.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/u, '$1'),
  );
};

const text = z.string().trim().min(1);

export const SceneDraftSchema = z
  .object({
    phaseTitle: text,
    narrative: text,
    actingRoleLabel: text,
    targetEntityLabel: text,
    documentCard: z
      .object({
        title: text,
        fields: z.array(
          z
            .object({
              name: text,
              label: text,
              value: z.string(),
              keyData: z.boolean(),
              sourceOrigin: text.optional(),
            })
            .strict(),
        ),
        basisNotes: text.optional(),
      })
      .strict(),
    pendingSuspense: text.optional(),
  })
  .strict();

export const HypothesisSchema = z
  .object({
    asOf: z.string().datetime({ offset: true }).optional(),
    values: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.asOf !== undefined || Object.keys(value.values ?? {}).length > 0,
    'The question must identify a concrete clock or input value change.',
  );

export const ImpactExplanationSchema = z
  .object({ businessImpactExplanation: text })
  .strict();
