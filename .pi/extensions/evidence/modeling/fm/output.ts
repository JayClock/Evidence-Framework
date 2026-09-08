import type { CommandResult } from './contracts.ts';

export function combinedOutput(result: CommandResult): string {
  return [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim()
    .slice(-6000);
}
