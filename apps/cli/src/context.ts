import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

export interface CommandContext {
  readonly cwd: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly color: boolean;
}

/** Node's strict parser plus duplicate-option rejection (no silent last-wins). */
export function argumentsFor(
  argv: readonly string[],
  options: ParseArgsOptionsConfig,
) {
  const parsed = parseArgs({
    args: [...argv],
    options,
    allowPositionals: true,
    strict: true,
    tokens: true,
  });
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== 'option') continue;
    if (seen.has(token.name))
      throw new Error(`Duplicate option: --${token.name}`);
    seen.add(token.name);
  }
  return parsed;
}

export function stringOption(
  value: string | boolean | (string | boolean)[] | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Expected a nonempty option value');
  return value;
}
