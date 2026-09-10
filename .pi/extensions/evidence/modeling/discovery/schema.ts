import { Type, type Static } from 'typebox';
import { FormalizationSchema } from './assessment-schema.ts';
export { FormalizationAssessmentSchema } from './assessment-schema.ts';
export type { FormalizationAssessment } from './assessment-schema.ts';

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
    {
      kind: choice('channel'),
      contextRef: candidateRef(),
      exchangeRef: nullableRef(),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: choice('contract'),
      contextRef: candidateRef(),
      fulfillmentRef: nullableRef(),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: choice('domain'),
      contextRef: candidateRef(),
      objectRef: nullableRef(),
    },
    { additionalProperties: false },
  ),
  Type.Null(),
]);

const candidateRefs = (maxItems = 100) =>
  Type.Array(candidateRef(), { maxItems, uniqueItems: true });

const RequestEvidenceSchema = Type.Object(
  {
    evidenceRef: nullableRef(),
    issuerRef: nullableRef(),
    recipientRef: nullableRef(),
    requirement: knownText(
      '请求凭证要求接收方完成什么；只保留有来源的已知部分。',
    ),
    startAt: knownText(
      '履约请求 start_at 的业务含义及来源；来源未知须标明，影响判断时澄清；不因缺公式清空已知结构；未知为 null，不编造实例日期。',
    ),
    expiredAt: knownText(
      '履约请求 expired_at 的业务含义及确定依据；字段非空不表示期限依据已解决；未知为 null，不编造期限。',
    ),
  },
  { additionalProperties: false },
);

const ConfirmationEvidenceSchema = Type.Object(
  {
    evidenceRef: nullableRef(),
    providerRef: nullableRef(),
    proves: knownText('该凭证证明哪个履约结果；不是默认人工审批或运行状态。'),
    confirmedAt: knownText(
      '履约确认 confirmed_at 的业务含义及采信依据；未知为 null。',
    ),
  },
  { additionalProperties: false },
);

const FulfillmentViewSchema = Type.Object(
  {
    candidateRef: candidateRef(),
    requestEvidence: RequestEvidenceSchema,
    confirmationEvidence: ConfirmationEvidenceSchema,
    supportingEvidenceRefs: candidateRefs(),
    participantRefs: candidateRefs(),
    thingRefs: candidateRefs(),
    parentFulfillmentRef: nullableRef(),
    trigger: knownText(),
    sourceRefs: sourcedRefs,
  },
  { additionalProperties: false },
);

const ContextViewSchema = Type.Object(
  {
    kind: choice('channel', 'contract', 'domain'),
    contextRef: candidateRef(),
    roleRefs: Type.Array(nullableRef(), { maxItems: 20 }),
    participantRefs: candidateRefs(),
    thingRefs: candidateRefs(),
    evidenceRefs: candidateRefs(),
    agreementEvidence: Type.Union([
      Type.Object(
        {
          evidenceRef: nullableRef(),
          signedAt: knownText(
            '合同 signed_at 的业务含义及签署依据；未知为 null。',
          ),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    sourceRefs: sourcedRefs,
    fulfillments: Type.Array(FulfillmentViewSchema, { maxItems: 100 }),
  },
  { additionalProperties: false },
);

// A sourced projection of the current business modeling position, not a second
// formal FM model. Channel/domain contexts remain first-class and never need a
// fabricated contract merely to appear in the discovery UI.
export const BusinessViewSchema = Type.Object(
  {
    current: DiscussionTargetSchema,
    contexts: Type.Array(ContextViewSchema, { maxItems: 50 }),
  },
  { additionalProperties: false },
);

export const QuestionSchema = Type.Object(
  {
    id: Type.String({ pattern: '^Q-[0-9]{3,}$' }),
    gapKey: Type.String({
      minLength: 3,
      maxLength: 160,
      pattern: '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$',
      description:
        '稳定业务缺口标识，例如 c-004.payment-deadline、input.agreement。同一缺口复用原标识和 Q-ID，不因措辞变化新建。',
    }),
    focus: text(),
    target: DiscussionTargetSchema,
    prompt: text(),
    impact: text(),
    blocking: Type.Boolean(),
    sourceRefs: refs,
  },
  { additionalProperties: false },
);

// Short labels drive the card; archetypes make participants, things and
// evidence renderable without parsing prose. A candidate is still provisional.
const candidateLabel = Type.String({
  minLength: 1,
  maxLength: 40,
  pattern:
    '^[^\\s\\x00-\\x1f\\x7f](?:[^\\x00-\\x1f\\x7f\\u2028\\u2029]*[^\\s\\x00-\\x1f\\x7f])?$',
  description:
    '简短业务名称，最多40字符、单行且无首尾空白；详细分析写 description。',
});
const CandidateSchema = Type.Object(
  {
    id: Type.String({ pattern: '^C-[0-9]{3,}$' }),
    archetype: choice(
      'context',
      'fulfillment',
      'evidence',
      'role',
      'participant',
      'thing',
      'description',
    ),
    evidenceKind: Type.Union([
      choice(
        'rfp',
        'proposal',
        'contract',
        'fulfillment_request',
        'fulfillment_confirmation',
        'other_evidence',
      ),
      Type.Null(),
    ]),
    label: candidateLabel,
    description: Type.String({
      minLength: 1,
      maxLength: 4000,
      description:
        '完整业务说明，区分已明确事实、推断理由和剩余缺口，并关联来源。',
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
    businessView: BusinessViewSchema,
    notes: text(100, 1000000),
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
    candidates: Type.Array(CandidateSchema, { maxItems: 300 }),
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

// A rebuildable read model. Incomplete scope/notes are legal during discovery,
// but formalization still validates the complete content contract.
const StoredDiscoveryContentSchema = Type.Object(
  {
    ...DiscoveryContentSchema.properties,
    scope: text(0),
    excludedScope: text(0),
    notes: text(0, 1000000),
  },
  { additionalProperties: false },
);

const QuestionResolutionSchema = Type.Object(
  {
    questionId: Type.String({ pattern: '^Q-[0-9]{3,}$' }),
    conclusion: text(),
    reasoning: text(10),
    sourceRefs: sourcedRefs,
    citations: Type.Array(
      Type.Object(
        { sourceRef: text(), quote: text() },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 100 },
    ),
  },
  {
    additionalProperties: false,
    description:
      '以已有事实或确定性推导解决一个问题，不是人工回答或范围排除。每个来源都须有逐字原文摘录；reasoning 解释摘录如何充分覆盖原问题，不得补造决定或绕过冲突。',
  },
);

const AppliedModelSchema = Type.Object(
  {
    revision: Type.Integer({ minimum: 0 }),
    basisDigest: text(),
    fileHashes: Type.Record(Type.String(), Type.String()),
    includedCandidateRefs: Type.Array(candidateRef(), {
      maxItems: 200,
      uniqueItems: true,
    }),
    pendingCandidateRefs: Type.Array(candidateRef(), {
      maxItems: 200,
      uniqueItems: true,
    }),
    includedFactRefs: FormalizationSchema.properties.includedFactRefs,
    contexts: FormalizationSchema.properties.contexts,
  },
  { additionalProperties: false },
);

export const DiscoverySnapshotSchema = Type.Object(
  {
    version: Type.Literal(6),
    runId: text(),
    revision: Type.Integer({ minimum: 0 }),
    previousDigest: Type.Union([text(), Type.Null()]),
    content: Type.Union([StoredDiscoveryContentSchema, Type.Null()]),
    sourceHashes: Type.Record(Type.String(), Type.String()),
    recordHeads: Type.Record(Type.String(), Type.String()),
    withdrawnRecordKeys: Type.Array(Type.String()),
    staleRecordKeys: Type.Array(Type.String()),
    questions: Type.Array(QuestionSchema, { maxItems: 500 }),
    answers: Type.Array(AnswerSchema, { maxItems: 2000 }),
    questionResolutions: Type.Array(QuestionResolutionSchema, {
      maxItems: 500,
    }),
    modelUpdateRequested: Type.Boolean(),
    formalization: Type.Union([FormalizationSchema, Type.Null()]),
    appliedModel: Type.Union([AppliedModelSchema, Type.Null()]),
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
    recordedAt: text(0),
  },
  { additionalProperties: false },
);

const recordRef = Type.String({ pattern: '^D-[0-9]{3,}-[0-9]{3,}$' });
const supersedes = Type.Union([recordRef, Type.Null()], {
  description:
    '新对象为 null；更正须引用 recordHeads 中该对象当前的 D-ID（包括撤回记录）。不覆盖旧记录。',
});
const contextSchema = BusinessViewSchema.properties.contexts.items;
const fulfillmentSchema = contextSchema.properties.fulfillments.items;
const record = <K extends string, S extends import('typebox').TSchema>(
  kind: K,
  value: S,
) =>
  Type.Object(
    { kind: choice(kind), supersedes, value },
    { additionalProperties: false },
  );

export const DiscoveryRecordSchema = Type.Union([
  record(
    'scope',
    Type.Object(
      {
        scope: DiscoveryContentSchema.properties.scope,
        excludedScope: DiscoveryContentSchema.properties.excludedScope,
      },
      { additionalProperties: false },
    ),
  ),
  record(
    'position',
    Type.Object(
      {
        focus: DiscoveryContentSchema.properties.focus,
        current: DiscussionTargetSchema,
      },
      { additionalProperties: false },
    ),
  ),
  record('note', text(1, 30000)),
  record('resolution', QuestionResolutionSchema),
  record('source', DiscoveryContentSchema.properties.sources.items),
  record('candidate', CandidateSchema),
  record('case', DiscoveryContentSchema.properties.cases.items),
  record('context', Type.Omit(contextSchema, ['fulfillments'])),
  record(
    'fulfillment',
    Type.Object(
      {
        contextRef: candidateRef(),
        ...fulfillmentSchema.properties,
      },
      { additionalProperties: false },
    ),
  ),
  Type.Object(
    { kind: choice('withdraw'), supersedes: recordRef },
    { additionalProperties: false },
  ),
]);

export const DiscoverySubmissionSchema = Type.Object(
  {
    summary: text(10),
    sourceRefs: sourcedRefs,
    records: Type.Array(DiscoveryRecordSchema, { minItems: 1, maxItems: 200 }),
  },
  { additionalProperties: false },
);

export const DiscoveryEventSchema = Type.Union([
  Type.Object(
    {
      kind: choice('discovery'),
      submission: DiscoverySubmissionSchema,
      sourceHashes: Type.Record(Type.String(), Type.String()),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: choice('question'), question: QuestionSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: choice('answer'),
      answer: AnswerSchema,
      supersedes: Type.Union([
        Type.String({ pattern: '^A-[0-9]{3,}$' }),
        Type.Null(),
      ]),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: choice('interaction'),
      action: choice('finish', 'resume', 'skip', 'update-model', 'converge'),
      questionId: Type.Union([
        Type.String({ pattern: '^Q-[0-9]{3,}$' }),
        Type.Null(),
      ]),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: choice('formalization'), value: FormalizationSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: choice('model-applied'), value: AppliedModelSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: choice('draft'), result: DiscoverySnapshotSchema.properties.draft },
    { additionalProperties: false },
  ),
]);

export const DiscoveryEntrySchema = Type.Object(
  {
    version: Type.Literal(6),
    runId: text(),
    revision: Type.Integer({ minimum: 1 }),
    previousDigest: Type.Union([text(), Type.Null()]),
    recordedAt: text(),
    event: DiscoveryEventSchema,
  },
  { additionalProperties: false },
);

export type DiscoveryRecord = Static<typeof DiscoveryRecordSchema>;
export type DiscoverySubmission = Static<typeof DiscoverySubmissionSchema>;
export type DiscoveryEvent = Static<typeof DiscoveryEventSchema>;
export type DiscoveryEntry = Static<typeof DiscoveryEntrySchema>;

export type DiscussionTarget = Static<typeof DiscussionTargetSchema>;

export function discussionTargetObjectRef(
  target: DiscussionTarget,
): string | null {
  if (target === null) return null;
  switch (target.kind) {
    case 'channel':
      return target.exchangeRef;
    case 'contract':
      return target.fulfillmentRef;
    case 'domain':
      return target.objectRef;
  }
}

export function sameDiscussionTarget(
  left: DiscussionTarget,
  right: DiscussionTarget,
): boolean {
  return (
    left?.kind === right?.kind &&
    left?.contextRef === right?.contextRef &&
    discussionTargetObjectRef(left) === discussionTargetObjectRef(right)
  );
}
export type BusinessView = Static<typeof BusinessViewSchema>;
export type DiscoveryContent = Static<typeof DiscoveryContentSchema>;
export type DiscoveryQuestion = Static<typeof QuestionSchema>;
export type DiscoveryAnswer = Static<typeof AnswerSchema>;
export type QuestionResolution = Static<typeof QuestionResolutionSchema>;
export type DiscoverySnapshot = Static<typeof DiscoverySnapshotSchema>;
export type DiscoveryControlAction =
  | 'finish'
  | 'resume'
  | 'skip'
  | 'update-model'
  | 'converge';

export interface DiscoveryProgress {
  stage: 'discovering' | 'finalizing';
  revision: number;
  path: string | null;
  digest: string | null;
}

export function initialDiscovery(): DiscoveryProgress {
  return { stage: 'discovering', revision: 0, path: null, digest: null };
}
