import { Type, type Static } from 'typebox';

const BusinessText = Type.String({ minLength: 1, pattern: '\\S' });

export const CurrentPositionSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal('fulfillment'),
      contract: BusinessText,
      fulfillment: BusinessText,
      point: Type.Union([
        Type.Literal('request'),
        Type.Literal('confirmation'),
      ]),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal('contract'), contract: BusinessText },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('negotiation'),
      context: BusinessText,
      object: BusinessText,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('domain'),
      context: BusinessText,
      object: BusinessText,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal('unlocated') },
    { additionalProperties: false },
  ),
]);

export const QuestionInputSchema = Type.Object(
  {
    questionId: BusinessText,
    gapKey: Type.String({
      minLength: 3,
      pattern: '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$',
    }),
    position: CurrentPositionSchema,
    known: Type.Array(BusinessText),
    prompt: BusinessText,
  },
  { additionalProperties: false },
);

export type CurrentPosition = Static<typeof CurrentPositionSchema>;
export type QuestionInput = Static<typeof QuestionInputSchema>;

export type QuestionStatus =
  | 'answered'
  | 'deferred'
  | 'stopped'
  | 'cancelled'
  | 'unavailable';

export interface QuestionResult {
  status: QuestionStatus;
  questionId: string;
  gapKey: string;
  answer?: string;
}

export const MODELING_SKILL_COMMAND = 'skill:evidence-modeling';
