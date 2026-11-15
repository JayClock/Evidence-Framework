/** Generated expressions are compiler-owned; example values must stay literal. */
export function assertLiteralData(
  value: unknown,
  delimiter: string,
  ref: string,
): void {
  if (JSON.stringify(value).includes(delimiter)) {
    throw new Error(
      `TEST_TEMPLATE_UNSUPPORTED: ${ref}: literal data contains reserved delimiter '${delimiter}'`,
    );
  }
}
