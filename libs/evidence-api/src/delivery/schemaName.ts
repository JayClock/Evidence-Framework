/** A schema component name: dots and punctuation folded into underscores. */
export const componentName = (identifier: string): string =>
  identifier.replaceAll('.', '_').replace(/[^A-Za-z0-9._-]/g, '_');
