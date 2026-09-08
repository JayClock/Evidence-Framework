import type {
  CommandResult,
  RuntimeOptions,
} from '../modeling/fm/contracts.ts';

export async function runProcess(
  options: RuntimeOptions,
  command: string,
  args: string[],
): Promise<CommandResult> {
  try {
    return await options.executor.exec(command, args, {
      cwd: options.root,
      timeout: options.timeoutMs,
      signal: options.signal,
    });
  } catch (error) {
    return {
      code: 1,
      stderr: error instanceof Error ? error.message : String(error),
      killed: options.signal?.aborted ?? false,
    };
  }
}
