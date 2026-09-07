import { Type, type Static } from 'typebox';

const text = (minLength = 1, maxLength = 4000) =>
  Type.String({ minLength, maxLength });
const refs = Type.Array(text(), { maxItems: 100, uniqueItems: true });
// Flat string enum, compatible with Pi's provider tool schemas (no literal unions).
const choice = <T extends string[]>(...values: T) =>
  Type.Unsafe<T[number]>({ type: 'string', enum: values });

const candidateRef = () => Type.String({ pattern: '^C-[0-9]{3,}$' });
const nullableRef = () => Type.Union([candidateRef(), Type.Null()]);
const knownText = () => Type.Union([text(), Type.Null()]);
const sourcedRefs = Type.Array(text(), {
  minItems: 1,
  maxItems: 100,
  uniqueItems: true,
});

export const DiscussionTargetSchema = Type.Union([
  Type.Object(
    { contractRef: candidateRef(), fulfillmentRef: nullableRef() },
    { additionalProperties: false },
  ),
  Type.Null(),
]);

// A sourced projection of discovery candidates, not a second formal FM model.
export const ContractViewSchema = Type.Object(
  {
    current: DiscussionTargetSchema,
    contracts: Type.Array(
      Type.Object(
        {
          contextRef: candidateRef(),
          roleRefs: Type.Array(nullableRef(), { minItems: 2, maxItems: 2 }),
          sourceRefs: sourcedRefs,
          fulfillments: Type.Array(
            Type.Object(
              {
                candidateRef: candidateRef(),
                rightHolderRef: nullableRef(),
                obligorRef: nullableRef(),
                request: knownText(),
                deadline: knownText(),
                confirmation: knownText(),
                parentFulfillmentRef: nullableRef(),
                trigger: knownText(),
                sourceRefs: sourcedRefs,
              },
              { additionalProperties: false },
            ),
            { maxItems: 100 },
          ),
        },
        { additionalProperties: false },
      ),
      { maxItems: 50 },
    ),
  },
  { additionalProperties: false },
);

export const QuestionSchema = Type.Object(
  {
    id: Type.String({ pattern: '^Q-[0-9]{3,}$' }),
    focus: text(),
    target: DiscussionTargetSchema,
    prompt: text(),
    impact: text(),
    blocking: Type.Boolean(),
    sourceRefs: refs,
  },
  { additionalProperties: false },
);

export const DiscoveryContentSchema = Type.Object(
  {
    scope: text(10),
    excludedScope: text(),
    focus: choice(
      'scope',
      'responsibilities',
      'evidence',
      'lineage',
      'exceptions',
      'domain',
      'replay',
    ),
    contractView: ContractViewSchema,
    notes: text(100, 30000),
    sources: Type.Array(
      Type.Object(
        {
          id: Type.String({ pattern: '^SRC-[0-9]{3,}$' }),
          path: text(),
          locator: text(),
        },
        { additionalProperties: false },
      ),
      { maxItems: 100 },
    ),
    candidates: Type.Array(
      Type.Object(
        {
          id: Type.String({ pattern: '^C-[0-9]{3,}$' }),
          description: text(),
          confidence: choice('explicit', 'inferred', 'unknown'),
          sourceRefs: refs,
          modelRefs: refs,
        },
        { additionalProperties: false },
      ),
      { maxItems: 200 },
    ),
    cases: Type.Array(
      Type.Object(
        {
          id: Type.String({ pattern: '^CASE-[0-9]{3,}$' }),
          kind: choice('normal', 'boundary', 'exception'),
          mode: choice('evidence', 'domain', 'not-applicable'),
          scenario: text(),
          expected: text(),
          sourceRefs: refs,
          gap: text(),
        },
        { additionalProperties: false },
      ),
      { maxItems: 100 },
    ),
  },
  { additionalProperties: false },
);

export const AnswerSchema = Type.Object(
  {
    id: Type.String({ pattern: '^A-[0-9]{3,}$' }),
    questionId: Type.String({ pattern: '^Q-[0-9]{3,}$' }),
    text: text(),
    respondent: text(),
    status: choice('answered', 'unknown', 'excluded'),
    recordedAt: text(),
  },
  { additionalProperties: false },
);

export const DiscoverySnapshotSchema = Type.Object(
  {
    version: Type.Literal(3),
    runId: text(),
    revision: Type.Integer({ minimum: 1 }),
    previousDigest: Type.Union([text(), Type.Null()]),
    content: Type.Union([DiscoveryContentSchema, Type.Null()]),
    sourceHashes: Type.Record(Type.String(), Type.String()),
    questions: Type.Array(QuestionSchema, { maxItems: 500 }),
    answers: Type.Array(AnswerSchema, { maxItems: 2000 }),
    // Interaction decisions are required control state, not A-* facts.
    interaction: Type.Object(
      {
        stopped: Type.Boolean(),
        activeQuestionId: Type.Union([
          Type.String({ pattern: '^Q-[0-9]{3,}$' }),
          Type.Null(),
        ]),
        needsConsolidation: Type.Boolean(),
        deferredQuestionIds: Type.Array(
          Type.String({ pattern: '^Q-[0-9]{3,}$' }),
          { maxItems: 500, uniqueItems: true },
        ),
      },
      { additionalProperties: false },
    ),
    draft: Type.Union([
      Type.Object(
        {
          filesDigest: text(),
          passed: Type.Boolean(),
          machineValidated: Type.Boolean(),
          simulationPassed: Type.Union([Type.Boolean(), Type.Null()]),
          result: text(1, 30000),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    recordedAt: text(),
  },
  { additionalProperties: false },
);

export type DiscussionTarget = Static<typeof DiscussionTargetSchema>;
export type ContractView = Static<typeof ContractViewSchema>;
export type DiscoveryContent = Static<typeof DiscoveryContentSchema>;
export type DiscoveryQuestion = Static<typeof QuestionSchema>;
export type DiscoveryAnswer = Static<typeof AnswerSchema>;
export type DiscoverySnapshot = Static<typeof DiscoverySnapshotSchema>;

export interface DiscoveryProgress {
  stage: 'discovering' | 'finalizing';
  revision: number;
  path: string | null;
  digest: string | null;
}

export function initialDiscovery(): DiscoveryProgress {
  return { stage: 'discovering', revision: 0, path: null, digest: null };
}
