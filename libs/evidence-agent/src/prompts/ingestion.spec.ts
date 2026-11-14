import { describe, expect, it } from 'vitest';

import {
  INGESTION_EXAMPLES,
  INGESTION_PROMPT,
  buildIngestionPrompt,
} from './ingestion.js';

describe('the extraction prompt', () => {
  it('states the five readings in the order the method requires', () => {
    const anchors = ['先找合约', '合约前的上下文', '成对读履约', '违约读成新履约', '分离标的物'];
    const positions = anchors.map((anchor) => INGESTION_PROMPT.indexOf(anchor));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
  });

  it('names the evidence kinds the compiler writes', () => {
    for (const kind of [
      'rfp',
      'proposal',
      'contract',
      'fulfillment_request',
      'fulfillment_confirmation',
      'other_evidence',
    ]) {
      expect(INGESTION_PROMPT).toContain(kind);
    }
  });

  it('refuses to invent a missing fact or a second role for the same party', () => {
    expect(INGESTION_PROMPT).toContain('不臆造事实');
    expect(INGESTION_PROMPT).toContain('合约只有两个角色');
    expect(INGESTION_PROMPT).toContain('不要补一个想象中的确认');
  });

  it('requires the sentence every element was read from', () => {
    expect(INGESTION_PROMPT).toContain('provenance.text');
    expect(INGESTION_PROMPT).toContain('原句');
  });
});

describe('the shipped readings', () => {
  it('are the lecture cases, so the examples teach the split and not just the JSON', () => {
    expect(INGESTION_EXAMPLES).toHaveLength(2);
    expect(INGESTION_EXAMPLES[0]?.input).toContain('企业级云服务采购协议');
    expect(INGESTION_EXAMPLES[1]?.input).toContain('断更');
  });
});

describe('building one request', () => {
  it('quotes the business text so the model reads it verbatim', () => {
    const { systemPrompt, userPrompt } = buildIngestionPrompt({
      text: '  甲方需在 5 个工作日内支付首期费用。  ',
      modelName: '云服务采购',
    });

    expect(systemPrompt).toBe(INGESTION_PROMPT);
    expect(userPrompt).toContain('模型名称：云服务采购');
    expect(userPrompt).toContain('甲方需在 5 个工作日内支付首期费用。');
    expect(userPrompt).not.toContain('  ');
  });

  it('omits the name line when the caller has no name yet', () => {
    const { userPrompt } = buildIngestionPrompt({ text: '读者订阅专栏。' });

    expect(userPrompt).not.toContain('模型名称');
    expect(userPrompt).toContain('读者订阅专栏。');
  });
});
