/** Code-point ordering, the one Python's `sorted` uses. */
export const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Sorts a list of strings the way the reference reports print them. */
export const sortedText = (values: Iterable<string>): string[] =>
  [...values].sort(compareText);
