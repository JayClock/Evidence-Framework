import { describe, expect, it } from 'vitest';

import {
  calculateFrontier,
  type InterviewTraceDocument,
  type InterviewTraceRecord,
} from './frontierTracker.js';

const record = (
  overrides: Partial<InterviewTraceRecord> &
    Pick<InterviewTraceRecord, 'traceId'>,
): InterviewTraceRecord => ({
  timestamp: '2026-11-11T08:00:00.000Z',
  focus: { contextRef: 'context.purchase', evidenceRef: 'request.payment' },
  narrative: {
    judgment: '付款以银行回单为证明',
    story: '客户先申请付款，银行回单证明付款完成。',
  },
  qa: [{ questionId: 'Q1', question: '谁提供付款金额？' }],
  userInput: { rawText: '客户财务口头说明', confirmedFacts: [] },
  targetBindings: [],
  ...overrides,
});

const traceOf = (
  traces: readonly InterviewTraceRecord[],
): InterviewTraceDocument => ({
  schemaVersion: '5.0',
  modelId: 'product-procurement',
  traces,
});

describe('calculateFrontier', () => {
  it('returns an empty frontier before the first record', () => {
    expect(calculateFrontier({ trace: null, entityIds: [] })).toEqual({
      contextRef: null,
      evidenceRef: null,
      roleRef: null,
      story: '',
      judgment: '',
      keyData: [],
      openQuestions: [],
      gaps: [],
      closed: false,
      confirmedFacts: [],
    });
  });

  it('reads the newest focus, story and key data', () => {
    const frontier = calculateFrontier({
      trace: traceOf([
        record({ traceId: 't1' }),
        record({
          traceId: 't2',
          focus: {
            contextRef: 'context.purchase',
            evidenceRef: 'request.delivery',
            roleRef: 'role.seller',
          },
          narrative: {
            judgment: '发货以签收单为证明',
            story: '供应商发起发货请求，客户签收确认。',
            keyData: ['request.delivery#expired_at'],
          },
        }),
      ]),
      entityIds: ['request.delivery'],
    });

    expect(frontier.evidenceRef).toBe('request.delivery');
    expect(frontier.roleRef).toBe('role.seller');
    expect(frontier.judgment).toBe('发货以签收单为证明');
    expect(frontier.keyData).toEqual(['request.delivery#expired_at']);
  });

  it('reports the newest round questions minus the attributes it bound', () => {
    const frontier = calculateFrontier({
      trace: traceOf([
        record({ traceId: 't1' }),
        record({
          traceId: 't2',
          qa: [
            {
              questionId: 'Q4',
              question: '运费按什么算？',
              targetAttribute: 'request.payment#freight',
            },
            {
              questionId: 'Q5',
              question: '谁提供金额？',
              targetAttribute: 'request.payment#amount',
            },
            { questionId: 'Q6', question: '谁做对账？' },
          ],
          targetBindings: [
            {
              evidenceRef: 'request.payment',
              attributeName: 'request.payment#amount',
              sourceType: 'upstream_evidence',
            },
          ],
        }),
      ]),
      entityIds: ['request.payment'],
    });

    expect(frontier.openQuestions).toEqual([
      {
        traceId: 't2',
        questionId: 'Q4',
        question: '运费按什么算？',
        targetAttribute: 'request.payment#freight',
      },
      { traceId: 't2', questionId: 'Q6', question: '谁做对账？' },
    ]);
  });

  it('closes nothing when the newest round bound the attribute itself', () => {
    const frontier = calculateFrontier({
      trace: traceOf([
        record({
          traceId: 't1',
          qa: [
            {
              questionId: 'Q1',
              question: '谁提供金额？',
              targetAttribute: 'request.payment#amount',
            },
          ],
          targetBindings: [
            {
              evidenceRef: 'request.payment',
              attributeName: 'request.payment#amount',
              sourceType: 'system_rule',
            },
          ],
        }),
      ]),
      entityIds: ['request.payment'],
    });

    expect(frontier.openQuestions).toEqual([]);
  });

  it('reports evidence the model no longer contains', () => {
    const frontier = calculateFrontier({
      trace: traceOf([
        record({
          traceId: 't1',
          targetBindings: [
            { evidenceRef: 'request.payment', sourceType: 'document' },
            {
              evidenceRef: 'request.payment',
              upstreamEvidenceRef: 'evidence.removed',
              sourceType: 'upstream_evidence',
            },
          ],
        }),
      ]),
      entityIds: ['request.payment'],
    });

    expect(frontier.gaps).toEqual([
      {
        kind: 'dangling-evidence',
        message: '追溯记录引用了模型中不存在的凭证：evidence.removed',
        ref: 'evidence.removed',
      },
    ]);
  });

  it('only treats a closure marker for this context as closed', () => {
    const open = calculateFrontier({
      trace: traceOf([
        record({
          traceId: 't1',
          userInput: {
            rawText: '还差退货',
            confirmedFacts: ['范围结束确认：context.return'],
          },
        }),
      ]),
      entityIds: ['request.payment'],
    });
    const closed = calculateFrontier({
      trace: traceOf([
        record({
          traceId: 't1',
          userInput: {
            rawText: '本范围结束',
            confirmedFacts: ['范围结束确认：context.purchase'],
          },
        }),
      ]),
      entityIds: ['request.payment'],
    });

    expect(open.closed).toBe(false);
    expect(closed.closed).toBe(true);
    expect(closed.confirmedFacts).toEqual(['范围结束确认：context.purchase']);
  });
});
