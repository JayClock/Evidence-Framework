import { Type, type Static } from 'typebox';

const BusinessText = Type.String({ minLength: 1, pattern: '\\S' });

export const CurrentPositionSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal('fulfillment'),
      contract: BusinessText,
      fulfillment: BusinessText,
      evidence: Type.Optional(
        Type.String({
          minLength: 1,
          pattern: '\\S',
          description:
            '当前请求或确认凭证的业务名称；尚未识别时省略，不按类型拼接后缀。',
        }),
      ),
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
    story: Type.String({
      minLength: 1,
      pattern: '\\S',
      description:
        '从记录引用生成的简短追溯故事：正在追溯哪项凭证信息、已找到的业务来源及其证明作用、接下来追向哪里。仅陈述有依据内容，不编造实例或把未知写成事实；不使用已明确、尚缺依据等字段清单。',
    }),
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
          parties: Type.Array(BusinessText, { minItems: 2 }),
          operatingMainline: Type.Union(
            [Type.Literal('cash'), Type.Literal('target-actual')],
            {
              description:
                '经营主线：现金权责或目标与实际；由 Agent 按实际依据判断，不是合同类型。',
            },
          ),
          operatingBasis: Type.String({
            minLength: 1,
            pattern: '\\S',
            description:
              '谁与谁签订什么合同（或达成什么约定），以实现什么具体经营目的；现金收入或支出须注明观察主体。不含资料名称、路径、版本、来源 ID 或参考链接。',
          }),
          boundary: BusinessText,
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
