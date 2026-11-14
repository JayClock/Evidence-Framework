import { StreamLanguage, type StreamParser } from '@codemirror/language';

/**
 * CEL, coloured by the words that decide a derived value.
 *
 * A CEL expression on a contract is short — one line to a dozen — so the editor
 * does not need a parser to be useful: it needs the modeler to see, at a glance,
 * which identifiers are *this* request and which are the replay hooks the
 * runtime provides. That is a lexical question, and a stream tokenizer answers
 * it in microseconds without pulling a Lezer grammar into the desktop bundle.
 */
export const celStreamParser: StreamParser<null> = {
  name: 'cel',
  token(stream) {
    if (stream.eatSpace()) return null;

    // String and number literals come first: an identifier check would eat the
    // `request` inside `"request.quantity"`.
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/^'(?:[^'\\]|\\.)*'/)) return 'string';
    if (stream.match(/^\d+(?:\.\d+)?/)) return 'number';

    // CEL macros and built-ins.
    if (
      stream.match(
        /^(?:has|size|all|exists|exists_one|map|filter|type|string|int|uint|double|bool|bytes|duration|timestamp|matches|contains|startsWith|endsWith|lowerAscii|upperAscii|trim)\b/,
      )
    ) {
      return 'keyword';
    }

    // The fulfillment vocabulary the runtime binds for a rule.
    if (
      stream.match(
        /^(?:request|confirmation|evidence|contract|context|now|self|this)\b/,
      )
    ) {
      return 'atom';
    }

    if (stream.match(/^(?:true|false)\b/)) return 'bool';
    if (stream.match(/^null\b/)) return 'null';

    if (stream.match(/^(?:&&|\|\||!|==|!=|<=|>=|<|>|\+|-|\*|\/|%|\?|:)/)) {
      return 'operator';
    }

    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) return 'variableName';
    if (stream.match(/^\d/)) return 'number';

    stream.next();
    return null;
  },
};

/** The CodeMirror language extension for CEL rule expressions. */
export const celLanguage = StreamLanguage.define(celStreamParser);
