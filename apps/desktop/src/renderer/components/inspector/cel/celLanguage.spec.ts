import { StringStream } from '@codemirror/language';
import { describe, expect, it } from 'vitest';

import { celStreamParser } from './celLanguage';

interface Token {
  type: string | null;
  text: string;
}

/**
 * Runs the stream parser over one line, the way CodeMirror does.
 *
 * Token names are what the highlight style maps to colours, so this asserts the
 * colouring contract without reading styles back out of the DOM.
 */
const tokenize = (line: string): readonly Token[] => {
  const stream = new StringStream(line, 4, 2, 2);
  const state = celStreamParser.startState?.(2) ?? {
    quote: null,
    afterDot: false,
  };
  const tokens: Token[] = [];

  while (!stream.eol()) {
    // CodeMirror's own loop resets the token start before every call, and
    // `stream.current()` reads from it.
    stream.start = stream.pos;
    const start = stream.pos;
    const type = (
      celStreamParser.token as (s: StringStream, st: unknown) => string | null
    )(stream, state);

    tokens.push({ type, text: line.slice(start, stream.pos) });
  }

  return tokens;
};

const typesOf = (line: string): readonly (string | null)[] =>
  tokenize(line)
    .filter((token) => token.text.trim() !== '')
    .map((token) => token.type);

describe('celLanguage', () => {
  it('separates aliases from the attributes they read', () => {
    expect(typesOf('request.quantity')).toEqual([
      'variableName',
      'punctuation',
      'propertyName',
    ]);
  });

  it('colours the macros and the operators', () => {
    // A macro called on a collection is a member read, exactly as CEL spells it.
    expect(typesOf('confirmations.exists(c, c.closed_at > 0)')).toEqual([
      'variableName',
      'punctuation',
      'propertyName',
      'punctuation',
      'variableName',
      'punctuation',
      'variableName',
      'punctuation',
      'propertyName',
      'operator',
      'number',
      'punctuation',
    ]);
  });

  it('colours a macro called on its own as a keyword', () => {
    expect(typesOf('exists(c, true)')).toEqual([
      'keyword',
      'punctuation',
      'variableName',
      'punctuation',
      'atom',
      'punctuation',
    ]);
  });

  it('keeps a string literal in one token, dots included', () => {
    expect(tokenize('self.status == "pending.review"')).toContainEqual({
      type: 'string',
      text: '"pending.review"',
    });
  });

  it('marks the schema type names and the atoms', () => {
    expect(typesOf('true && duration("1h")')).toEqual([
      'atom',
      'operator',
      'typeName',
      'punctuation',
      'string',
      'punctuation',
    ]);
  });

  it('reads a member after whitespace as a property read', () => {
    expect(typesOf('self  .  total_amount')).toEqual([
      'variableName',
      'punctuation',
      'propertyName',
    ]);
  });
});
