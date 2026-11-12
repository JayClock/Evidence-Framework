/** Code-point ordering: the strings compared directly, with no locale collation. */
export const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Sorts a list of strings in code-point order, the order every report prints. */
export const sortedText = (values: Iterable<string>): string[] =>
  [...values].sort(compareText);
