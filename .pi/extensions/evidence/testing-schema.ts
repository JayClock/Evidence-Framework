import { Type, type Static } from 'typebox';

const text = Type.String({ minLength: 1, maxLength: 2000 });
const id = (prefix: string) =>
  Type.String({ pattern: `^${prefix}-[A-Z0-9-]+$`, maxLength: 80 });
const ids = (prefix: string) =>
  Type.Array(id(prefix), { maxItems: 200, uniqueItems: true });

export const AcceptanceCatalogSchema = Type.Object(
  {
    kind: Type.Literal('acceptance-catalog'),
    version: Type.Literal(1),
    stories: Type.Array(
      Type.Object(
        {
          id: Type.String({ pattern: '^US-\\d{3}$' }),
          scenarioIds: Type.Array(
            Type.String({ pattern: '^AC-\\d{3}-\\d{2,}$' }),
            { minItems: 1, maxItems: 200, uniqueItems: true },
          ),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 200 },
    ),
  },
  { additionalProperties: false },
);
export const ProcedureCatalogSchema = Type.Object(
  {
    kind: Type.Literal('test-procedures'),
    version: Type.Literal(1),
    procedures: Type.Array(
      Type.Object(
        {
          id: id('TP'),
          quadrant: Type.Union([
            Type.Literal('Q1'),
            Type.Literal('Q2'),
            Type.Literal('Q3'),
            Type.Literal('Q4'),
          ]),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 200 },
    ),
  },
  { additionalProperties: false },
);
export const TestCheckSchema = Type.Object(
  {
    id: id('CHECK'),
    command: text,
    testFiles: Type.Array(text, {
      minItems: 1,
      maxItems: 50,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false },
);
export const TestTaskSchema = Type.Object(
  {
    id: id('TASK'),
    procedureId: id('TP'),
    scenarioIds: Type.Array(text, {
      minItems: 1,
      maxItems: 200,
      uniqueItems: true,
    }),
    mode: Type.Union([
      Type.Literal('tdd'),
      Type.Literal('verify'),
      Type.Literal('not-applicable'),
    ]),
    reason: Type.Optional(Type.String({ minLength: 10, maxLength: 2000 })),
    dependsOn: ids('TASK'),
    checks: Type.Array(TestCheckSchema, { maxItems: 50 }),
  },
  { additionalProperties: false },
);
export const TestStorySchema = Type.Object(
  {
    id: Type.String({ pattern: '^US-\\d{3}$' }),
    scenarioIds: Type.Array(text, {
      minItems: 1,
      maxItems: 200,
      uniqueItems: true,
    }),
    tasks: Type.Array(TestTaskSchema, { minItems: 1, maxItems: 200 }),
  },
  { additionalProperties: false },
);
export const TestPlanSchema = Type.Object(
  {
    kind: Type.Literal('test-plan'),
    version: Type.Literal(1),
    stories: Type.Array(TestStorySchema, { minItems: 1, maxItems: 200 }),
  },
  { additionalProperties: false },
);

export const CommandEvidenceSchema = Type.Object(
  {
    command: text,
    observation: text,
    exitCode: Type.Integer(),
    killed: Type.Boolean(),
    output: Type.String({ maxLength: 14000 }),
    recordedAt: text,
  },
  { additionalProperties: false },
);
export const FileHashesSchema = Type.Record(
  Type.String(),
  Type.String({ pattern: '^[a-f0-9]{64}$' }),
);
export const CycleBindingSchema = Type.Object(
  {
    taskId: id('TASK'),
    checkId: id('CHECK'),
    testFileHashes: FileHashesSchema,
  },
  { additionalProperties: false },
);
export const CompletedCycleSchema = Type.Object(
  {
    id: Type.Integer({ minimum: 1 }),
    taskId: id('TASK'),
    checkId: id('CHECK'),
    procedureId: id('TP'),
    scenarioIds: Type.Array(text, {
      minItems: 1,
      maxItems: 200,
      uniqueItems: true,
    }),
    testFileHashes: FileHashesSchema,
    red: CommandEvidenceSchema,
    green: CommandEvidenceSchema,
    refactor: CommandEvidenceSchema,
  },
  { additionalProperties: false },
);
export const TaskVerificationSchema = Type.Object(
  {
    taskId: id('TASK'),
    procedureId: id('TP'),
    scenarioIds: Type.Array(text, {
      minItems: 1,
      maxItems: 200,
      uniqueItems: true,
    }),
    checks: Type.Array(
      Type.Object(
        { checkId: id('CHECK'), evidence: CommandEvidenceSchema },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 50 },
    ),
  },
  { additionalProperties: false },
);
export const StoryRecordSchema = Type.Object(
  {
    version: Type.Literal(1),
    runId: text,
    storyId: Type.String({ pattern: '^US-\\d{3}$' }),
    planDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    cycles: Type.Array(CompletedCycleSchema, { minItems: 1, maxItems: 1000 }),
    verifications: Type.Array(TaskVerificationSchema, { maxItems: 1000 }),
    revisionStart: Type.Integer({ minimum: 0 }),
    changedFiles: Type.Array(text, {
      minItems: 2,
      maxItems: 2000,
      uniqueItems: true,
    }),
    summary: text,
    refactorSummary: text,
    reportPath: text,
    passed: Type.Boolean(),
  },
  { additionalProperties: false },
);
export const StoryRecordReferenceSchema = Type.Object(
  {
    digest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    markdownDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    reportDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    reportPath: text,
    files: Type.Array(text, { maxItems: 2000, uniqueItems: true }),
  },
  { additionalProperties: false },
);

export type AcceptanceCatalog = Static<typeof AcceptanceCatalogSchema>;
export type ProcedureCatalog = Static<typeof ProcedureCatalogSchema>;
export type TestPlan = Static<typeof TestPlanSchema>;
export type TestStory = Static<typeof TestStorySchema>;
export type TestTask = Static<typeof TestTaskSchema>;
export type TestCheck = Static<typeof TestCheckSchema>;
export type CycleBinding = Static<typeof CycleBindingSchema>;
export type CompletedTddCycle = Static<typeof CompletedCycleSchema>;
export type TaskVerification = Static<typeof TaskVerificationSchema>;
export type StoryRecord = Static<typeof StoryRecordSchema>;
export type StoryRecordReference = Static<typeof StoryRecordReferenceSchema>;
