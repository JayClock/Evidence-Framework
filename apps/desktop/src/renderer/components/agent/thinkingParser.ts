/**
 * Splits a streamed reply into the model's reasoning and its answer.
 *
 * Reasoning models wrap their derivation in `<thought>` or `<thinking>` tags,
 * and the harness forwards the raw text while it streams. The composer only has
 * one transcript string, so the panel derives the two views from it instead of
 * keeping a second buffer that could drift from what the model actually said.
 */
export interface ParsedTranscript {
  /** Reasoning text, or null when this turn carried none. */
  readonly thinking: string | null;
  /** The answer with the reasoning block removed. */
  readonly content: string;
  /** True while the closing tag has not arrived yet. */
  readonly thinkingActive: boolean;
}

const OPEN_TAG = '<thought>';
const CLOSE_TAG = '</thought>';
const ALT_OPEN_TAG = '<thinking>';
const ALT_CLOSE_TAG = '</thinking>';

const split = (
  raw: string,
  open: string,
  close: string,
): ParsedTranscript | null => {
  const start = raw.indexOf(open);

  if (start === -1) {
    return null;
  }

  const bodyStart = start + open.length;
  const end = raw.indexOf(close, bodyStart);

  if (end === -1) {
    const reasoning = raw.slice(bodyStart).trim();

    return {
      thinking: reasoning === '' ? null : reasoning,
      content: raw.slice(0, start).trim(),
      thinkingActive: true,
    };
  }

  const reasoning = raw.slice(bodyStart, end).trim();

  return {
    thinking: reasoning === '' ? null : reasoning,
    content: `${raw.slice(0, start)}${raw.slice(end + close.length)}`.trim(),
    thinkingActive: false,
  };
};

/**
 * Reads the first reasoning block, leaving everything else as the answer.
 *
 * Only the first block is lifted: a model that reasons twice still produced one
 * answer, and a transcript that repeats its own reasoning is not something the
 * panel should try to reassemble.
 */
export const parseStreamedTranscript = (raw: string): ParsedTranscript =>
  split(raw, OPEN_TAG, CLOSE_TAG) ??
  split(raw, ALT_OPEN_TAG, ALT_CLOSE_TAG) ?? {
    thinking: null,
    content: raw,
    thinkingActive: false,
  };
