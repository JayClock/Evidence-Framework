import { Type, type Static } from 'typebox';

const text = (minLength = 1) => Type.String({ minLength, maxLength: 4000 });
const choice = <T extends string[]>(...values: T) =>
  Type.Unsafe<T[number]>({ type: 'string', enum: values });
const refs = () => Type.Array(text(), { maxItems: 200, uniqueItems: true });
const sources = () =>
  Type.Array(text(), { minItems: 1, maxItems: 100, uniqueItems: true });
const candidate = () => Type.String({ pattern: '^C-[0-9]{3,}$' });
const fact = () => Type.String({ pattern: '^C-[0-9]{3,}\\.[a-z][a-z0-9_]*$' });
const facts = () => Type.Array(fact(), { maxItems: 1000, uniqueItems: true });
const object = <T extends import('typebox').TProperties>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });

export const ContextAssessmentSchema = object({
  contextRef: candidate(),
  kind: choice('domain', 'channel', 'contract', 'fulfillment'),
  responsibility: text(10),
  sourceRefs: sources(),
  candidateRefs: Type.Array(candidate(), {
    minItems: 1,
    maxItems: 200,
    uniqueItems: true,
  }),
  remainingScope: text(),
  facts: Type.Array(
    object({
      key: Type.String({ pattern: '^[a-z][a-z0-9_]*$', maxLength: 100 }),
      candidateRef: candidate(),
      dimension: choice(
        'identity',
        'structure',
        'rule',
        'parties',
        'agreement',
        'evidence',
        'validity',
        'response',
        'request',
        'deadline',
        'confirmation',
      ),
      statement: text(),
      status: choice('known', 'unknown'),
      sourceRefs: refs(),
    }),
    { minItems: 1, maxItems: 100 },
  ),
  requiredFactRefs: Type.Array(fact(), {
    minItems: 1,
    maxItems: 100,
    uniqueItems: true,
  }),
  dependencies: Type.Array(
    object({
      consumerFactRef: fact(),
      providerFactRef: fact(),
      kind: choice('structure', 'provenance', 'decision'),
      purpose: text(10),
      sourceRefs: sources(),
    }),
    { maxItems: 300 },
  ),
  caseRefs: refs(),
});
export const FormalizationAssessmentSchema = object({
  version: Type.Literal(1),
  applicability: object({
    applicable: Type.Boolean(),
    rationale: text(40),
    sourceRefs: sources(),
  }),
  contexts: Type.Array(ContextAssessmentSchema, { maxItems: 200 }),
  questions: Type.Array(
    object({
      questionId: Type.String({ pattern: '^Q-[0-9]{3,}$' }),
      affectedFactRefs: Type.Union([
        Type.Array(fact(), { minItems: 1, maxItems: 1000, uniqueItems: true }),
        Type.Null(),
      ]),
      reasoning: text(10),
      sourceRefs: sources(),
    }),
    { maxItems: 500 },
  ),
});
export const FormalizationSchema = object({
  revision: Type.Integer({ minimum: 0 }),
  assessment: FormalizationAssessmentSchema,
  includedCandidateRefs: refs(),
  pendingCandidateRefs: refs(),
  includedFactRefs: facts(),
  contexts: Type.Array(
    object({
      contextRef: candidate(),
      status: choice('ready', 'support', 'pending'),
      includedFactRefs: facts(),
      missingFactRefs: facts(),
    }),
    { maxItems: 200 },
  ),
  blockers: Type.Array(object({ factRef: fact(), reasons: refs() }), {
    maxItems: 1000,
  }),
});
export type ContextAssessment = Static<typeof ContextAssessmentSchema>;
export type FormalizationAssessment = Static<
  typeof FormalizationAssessmentSchema
>;
export type Formalization = Static<typeof FormalizationSchema>;
