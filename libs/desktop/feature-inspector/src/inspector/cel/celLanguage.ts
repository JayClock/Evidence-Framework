import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language';
import type { StreamParser, StringStream } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * Macros and keywords a CEL rule may call.
 *
 * `in` and `as` are operators, but they are spelled as words, so they travel
 * with the keyword set rather than the operator set.
 */
const KEYWORDS = new Set(['all', 'exists', 'exists_one', 'filter', 'map']);

const WORD_OPERATORS = new Set(['in', 'as']);

const ATOMS = new Set(['true', 'false', 'null']);

/** The runtime type names the schema allows as a value type. */
const TYPE_NAMES = new Set([
  'int',
  'uint',
  'double',
  'bool',
  'string',
  'bytes',
  'list',
  'map',
  'timestamp',
  'duration',
  'decimal',
  'money',
  'date',
  'enum',
  'id',
  'dynamic',
]);

export interface CelParserState {
  /** Quote character while inside a string literal, null otherwise. */
  quote: string | null;
  /** True right after a dot, so the next identifier is a member read. */
  afterDot: boolean;
}

const readString = (stream: StringStream, state: CelParserState): void => {
  while (!stream.eol()) {
    const char = stream.next();

    if (char === '\\') {
      stream.next();
      continue;
    }

    if (char === state.quote) {
      state.quote = null;
      return;
    }
  }
};

/**
 * Tokenises enough CEL to colour it and to point at member reads.
 *
 * It is a stream parser, not a grammar: the authority on whether an expression
 * holds is `analyzeCelExpression` plus the sensor engine, and this only mirrors
 * their vocabulary so the picture matches the verdict.
 */
export const celStreamParser: StreamParser<CelParserState> = {
  name: 'cel',
  startState: () => ({ quote: null, afterDot: false }),
  token: (stream, state) => {
    if (stream.eatSpace()) {
      return null;
    }

    if (state.quote !== null) {
      readString(stream, state);

      return 'string';
    }

    const char = stream.peek();

    if (char === '"' || char === "'") {
      state.quote = stream.next() ?? null;
      state.afterDot = false;
      readString(stream, state);

      return 'string';
    }

    if (stream.match(/^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/)) {
      state.afterDot = false;

      return 'number';
    }

    if (stream.eat('.')) {
      state.afterDot = true;

      return 'punctuation';
    }

    if (stream.match(/^(?:==|!=|<=|>=|&&|\|\||[<>!+\-*/%?:])/)) {
      state.afterDot = false;

      return 'operator';
    }

    if (stream.match(/^[()[\]{},]/)) {
      state.afterDot = false;

      return 'punctuation';
    }

    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const word = stream.current();
      const member = state.afterDot;

      state.afterDot = false;

      if (member) {
        return 'propertyName';
      }

      if (KEYWORDS.has(word)) {
        return 'keyword';
      }

      if (WORD_OPERATORS.has(word)) {
        return 'operator';
      }

      if (ATOMS.has(word)) {
        return 'atom';
      }

      if (TYPE_NAMES.has(word)) {
        return 'typeName';
      }

      return 'variableName';
    }

    stream.next();
    state.afterDot = false;

    return 'invalid';
  },
};

export const celLanguage = StreamLanguage.define(celStreamParser);

/**
 * A light palette that matches the inspector's ink and accent colours.
 *
 * The modeler reads formulas beside contracts, so the code block stays quiet:
 * keywords and aliases carry the structure, and nothing is louder than a
 * blocking finding.
 */
export const celHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#8250df', fontWeight: '600' },
  { tag: tags.operator, color: '#b42318' },
  { tag: tags.atom, color: '#8d6200', fontWeight: '600' },
  { tag: tags.typeName, color: '#2f5d8f' },
  { tag: tags.variableName, color: '#2f5d8f', fontWeight: '600' },
  { tag: tags.propertyName, color: '#1f2329' },
  { tag: tags.string, color: '#3d7553' },
  { tag: tags.number, color: '#2f5d8f' },
  { tag: tags.punctuation, color: '#6b7280' },
  { tag: tags.invalid, color: '#b42318', textDecoration: 'underline wavy' },
]);

export const celHighlighting = syntaxHighlighting(celHighlightStyle);
