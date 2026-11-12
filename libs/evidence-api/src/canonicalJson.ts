/**
 * The JSON text every generated file is written as.
 *
 * Keys are sorted, indentation is two spaces and the file ends with a newline,
 * which is what makes two projections of the same model diff cleanly. Non-ASCII
 * text is written as itself rather than `\uXXXX`, so a reviewer can read the
 * business labels in the diff.
 */

/** Recursively sorts object keys; arrays keep their order. */
export const sortedKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sortedKeys(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortedKeys((value as Record<string, unknown>)[key])]),
    );
  }

  return value;
};

/** Pretty JSON with sorted keys and a trailing newline. */
export const canonicalJson = (value: unknown): string =>
  `${JSON.stringify(sortedKeys(value), null, 2)}\n`;
