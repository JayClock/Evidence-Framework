import type { CheckItem } from '../../types.ts';

export interface FmModelFile {
  path: string;
  content: string;
}

export interface FmValidationResult {
  passed: boolean;
  machineValidated: boolean;
  simulationPassed: boolean | null;
  items: CheckItem[];
}
export interface CommandResult {
  code: number;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
}

export interface CommandExecutor {
  exec: (
    command: string,
    args: string[],
    options: { cwd: string; timeout?: number; signal?: AbortSignal },
  ) => Promise<CommandResult>;
}

export interface RuntimeOptions {
  executor: CommandExecutor;
  root: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  validatePublication?: (compiledModel: unknown) => void;
}

export interface ValidationOptions extends RuntimeOptions {
  modelDir: string;
}
export interface FmValidationFiles {
  ensureDirectory(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  removeFile(path: string): Promise<void>;
  listNames(path: string): Promise<string[]>;
}
export interface FmRuntime {
  ensurePython(options: RuntimeOptions): Promise<string>;
  runProcess(
    options: RuntimeOptions,
    command: string,
    args: string[],
  ): Promise<CommandResult>;
  files: FmValidationFiles;
}
