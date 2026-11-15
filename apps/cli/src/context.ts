export interface CommandContext {
  readonly cwd: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly color: boolean;
}

/** cac normalizes dashed option names to camelCase. */
export type CommandOptions = Record<
  string,
  string | number | boolean | string[] | undefined
>;

export function stringOption(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Expected a nonempty option value');
  return value;
}
