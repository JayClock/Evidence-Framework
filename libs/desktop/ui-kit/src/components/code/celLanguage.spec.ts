import { StringStream } from '@codemirror/language';
import { describe, expect, it } from 'vitest';

import { celStreamParser } from './celLanguage';

/** Tokenizes a whole expression, skipping the whitespace between tokens. */
const tokenize = (expression: string): readonly string[] => {
  const stream = new StringStream(expression, 4, 2);
  const tokens: string[] = [];
  while (!stream.eol()) {
    const start = stream.pos;
    const token = celStreamParser.token(stream, null);

    // A tokenizer that skipped the whitespace itself leaves the stream moved;
    // only a token that consumed nothing needs the caller to advance it.
    if (stream.pos === start) stream.next();
    if (token !== null) tokens.push(token);
  }
  return tokens;
};

describe('CEL stream language', () => {
  it('separates the fulfillment vocabulary from the caller fields', () => {
    expect(tokenize('request.quantity * request.unitPrice')).toEqual([
      'atom',
      'variableName',
      'operator',
      'atom',
      'variableName',
    ]);
  });

  it('colours macros, literals and operators the way a rule reads', () => {
    expect(tokenize('has(evidence) && size(contract.fields) > 2')).toEqual([
      'keyword',
      'atom',
      'operator',
      'keyword',
      'atom',
      'variableName',
      'operator',
      'number',
    ]);
    expect(tokenize('"request.quantity" == "x"')).toEqual([
      'string',
      'operator',
      'string',
    ]);
    expect(tokenize('true && null')).toEqual(['bool', 'operator', 'null']);
  });

  it('does not treat a string literal as the request binding', () => {
    expect(tokenize('"request"')).toEqual(['string']);
  });
});
