import { Type, type Static } from 'typebox';

const text = (minLength = 1, maxLength = 4000) =>
  Type.String({ minLength, maxLength });
const refs = Type.Array(text(), { maxItems: 100, uniqueItems: true });
// Flat string enum, compatible with Pi's provider tool schemas (no literal unions).
const choice = <T extends string[]>(...values: T) =>
  Type.Unsafe<T[number]>({ type: 'string', enum: values });

const candidateRef = () => Type.String({ pattern: '^C-[0-9]{3,}$' });
const nullableRef = () => Type.Union([candidateRef(), Type.Null()]);
const knownText = (description?: string) =>
  Type.Union([text(), Type.Null()], description ? { description } : {});
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
                request: knownText(
                  '履约请求的要求及依据；有来源时说明谁代表权利方向谁发起、要求完成什么。未知为 null，不猜测具体经办人。',
                ),
                deadline: knownText(
                  '有来源的确定期限或计算依据；未知为 null，不设置默认期限或无期限。',
                ),
                confirmation: knownText(
                  '谁提供或形成什么凭证、证明什么履约结果；只记录有来源的部分，其余标待明确，全未知为 null。Confirmation 不默认是人工审批，不从权利方或义务方推导确认人；独立验收须有业务依据。',
                ),
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

// A short business name is not an analysis paragraph or a review status.
const candidateLabel = Type.String({
  minLength: 1,
  maxLength: 40,
  pattern:
    '^[^\\s\\x00-\\x1f\\x7f](?:[^\\x00-\\x1f\\x7f\\u2028\\u2029]*[^\\s\\x00-\\x1f\\x7f])?$',
  description:
    '简短业务名称，最多40字符、单行且无首尾空白，如“平台”“读者”“支付订阅费”。不包含职责、依据、缺口、候选标记或建模约束；详细分析写 description。',
});
const CandidateSchema = Type.Object(
  {
    id: Type.String({ pattern: '^C-[0-9]{3,}$' }),
    label: candidateLabel,
    description: Type.String({
      minLength: 1,
      maxLength: 4000,
      description:
        '完整业务说明，区分已明确事实、推断理由和剩余缺口，并关联来源；不是界面名称。不因局部未知将已有明确事实整体降为未知。',
    }),
    confidence: choice('explicit', 'inferred', 'unknown'),
    sourceRefs: refs,
    modelRefs: refs,
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
    candidates: Type.Array(CandidateSchema, { maxItems: 200 }),
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

// Read historical v3 snapshots without inventing names or rewriting their hashes.
// Only new discovery submissions use the stricter required-label schema above.
const StoredDiscoveryContentSchema = Type.Object(
  {
    ...DiscoveryContentSchema.properties,
    candidates: Type.Array(
      Type.Object(
        { ...CandidateSchema.properties, label: Type.Optional(candidateLabel) },
        { additionalProperties: false },
      ),
      { maxItems: 200 },
    ),
  },
  { additionalProperties: false },
);

export const DiscoverySnapshotSchema = Type.Object(
  {
    version: Type.Literal(3),
    runId: text(),
    revision: Type.Integer({ minimum: 1 }),
    previousDigest: Type.Union([text(), Type.Null()]),
    content: Type.Union([StoredDiscoveryContentSchema, Type.Null()]),
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
