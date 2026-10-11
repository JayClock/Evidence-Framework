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

export const ContextSelectionSchema = Type.Object(
  {
    contexts: Type.Array(
      Type.Object(
        {
          agreementRef: BusinessText,
          name: BusinessText,
          parties: Type.Array(BusinessText),
          boundary: BusinessText,
          status: Type.Union([
            Type.Literal('candidate'),
            Type.Literal('confirmed'),
          ]),
          unresolved: Type.Array(BusinessText),
          clarification: Type.Union([
            Type.Literal('open'),
            Type.Literal('completed'),
          ]),
        },
        { additionalProperties: false },
      ),
    ),
    currentAgreementRef: Type.Optional(BusinessText),
  },
  { additionalProperties: false },
);

export type ContextSelectionInput = Static<typeof ContextSelectionSchema>;
export type ContextSelectionResult =
  | { status: 'selected'; agreementRef: string }
  | { status: 'cancelled' | 'unavailable' | 'empty' };

export type CurrentPosition = Static<typeof CurrentPositionSchema>;
export type QuestionInput = Static<typeof QuestionInputSchema>;

export type QuestionStatus =
  | 'answered'
  | 'deferred'
  | 'switch-context'
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
