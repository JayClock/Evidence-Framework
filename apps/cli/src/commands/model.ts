import { runModelCommand } from '@evidence-poc/evidence-model-io/commands';
import {
  stringOption,
  type CommandOptions,
  type CommandContext,
} from '../context.js';

/** Model operations remain in the I/O library, not in a second CLI parser. */
export async function modelCommand(
  command: string,
  target: string,
  options: CommandOptions,
  context: CommandContext,
): Promise<number> {
  return runModelCommand(
    command,
    {
      target,
      out: stringOption(options.out),
      scopes: [],
      compact: options.compact === true,
      sortKeys: options.sortKeys === true,
      json: options.json === true,
    },
    context,
  );
}
