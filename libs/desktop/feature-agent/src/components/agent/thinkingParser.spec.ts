import { describe, expect, it } from 'vitest';

import { parseStreamedTranscript } from './thinkingParser';

describe('parseStreamedTranscript', () => {
  it('leaves a reply without reasoning as the answer', () => {
    expect(parseStreamedTranscript('退款需要确认端。')).toEqual({
      thinking: null,
      content: '退款需要确认端。',
      thinkingActive: false,
    });
  });

  it('lifts a closed reasoning block and keeps the answer on both sides', () => {
    expect(
      parseStreamedTranscript(
        '先看模型。\n<thought>请求是时段，确认是时刻。</thought>\n补齐确认端。',
      ),
    ).toEqual({
      thinking: '请求是时段，确认是时刻。',
      content: '先看模型。\n\n补齐确认端。',
      thinkingActive: false,
    });
  });

  it('treats an unterminated block as reasoning in progress', () => {
    expect(parseStreamedTranscript('<thought>先判断这是凭证还是角色')).toEqual({
      thinking: '先判断这是凭证还是角色',
      content: '',
      thinkingActive: true,
    });
  });

  it('accepts the thinking alias', () => {
    expect(
      parseStreamedTranscript('<thinking>补上违约路径</thinking>完成。'),
    ).toEqual({
      thinking: '补上违约路径',
      content: '完成。',
      thinkingActive: false,
    });
  });

  it('reports an empty block as no reasoning at all', () => {
    expect(parseStreamedTranscript('<thought>  </thought>回答')).toEqual({
      thinking: null,
      content: '回答',
      thinkingActive: false,
    });
  });

  it('reads a tag that opens mid-sentence as reasoning', () => {
    expect(parseStreamedTranscript('a <thought> b')).toEqual({
      thinking: 'b',
      content: 'a',
      thinkingActive: true,
    });
  });
});
