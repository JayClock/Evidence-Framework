import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Absolute path of the locked virtual environment, relative to the project root.
 * It matches `EVIDENCE_VENV`'s default in `init.sh` and the path
 * `ENVIRONMENT.md` documents, so the resolver and the scripts agree on one tree.
 */
export const VENV_CACHE_DIRECTORY = path.join(
  'node_modules',
  '.cache',
  'evidence-fm-runtime',
);

/** Environment variable `init.sh` honours for a relocated virtual environment. */
export const VENV_ENVIRONMENT_VARIABLE = 'EVIDENCE_VENV';

/** Exit status and captured streams of one pinned-interpreter run. */
export interface ScriptRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Injected process boundary so tests never spawn a real interpreter. */
export type ProcessRunner = (
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    signal?: AbortSignal;
  },
) => Promise<ScriptRunResult>;

export interface PinnedPythonInfo {
  /** Absolute path of the interpreter the resolver will run. */
  executablePath: string;
  /** Absolute path of the virtual environment that owns it. */
  venvPath: string;
  /** True only when the interpreter exists on disk. */
  isValid: boolean;
  /** Human-readable repair instruction when `isValid` is false. */
  driftReport?: string;
}

export interface PythonEnvResolverOptions {
  projectRoot: string;
  /** Overrides `EVIDENCE_VENV` and the workspace default. */
  venvPath?: string;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  fileExists?: (candidate: string) => boolean;
  runProcess?: ProcessRunner;
}

export interface ScriptRunOptions {
  signal?: AbortSignal;
  cwd?: string;
}

export class PinnedPythonMissingError extends Error {
  readonly executablePath: string;

  constructor(info: PinnedPythonInfo) {
    super(
      info.driftReport ??
        `Pinned interpreter is missing: ${info.executablePath}. Run ./init.sh.`,
    );
    this.name = 'PinnedPythonMissingError';
    this.executablePath = info.executablePath;
  }
}

const defaultRunProcess: ProcessRunner = (command, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        cwd: options.cwd,
        env: options.env,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
      (error, stdout, stderr) => {
        if (error !== null && typeof error.code === 'string') {
          // Spawn failures (ENOENT, EACCES) are not exit statuses.
          reject(error);
          return;
        }

        resolve({
          code:
            error === null
              ? 0
              : typeof error.code === 'number'
                ? error.code
                : null,
          stdout,
          stderr,
        });
      },
    );
  });

/** Interpreter path inside a virtual environment, platform aware. */
export const pythonExecutableIn = (
  venvPath: string,
  platform: NodeJS.Platform = process.platform,
): string =>
  platform === 'win32'
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');

/**
 * Resolves the pinned interpreter and runs skill scripts with it.
 *
 * Modeling scripts are the quality gate, so this resolver never falls back to a
 * bare `python3`: a missing virtual environment is a reported drift, not a
 * silent downgrade.
 */
export const createPythonEnvResolver = ({
  projectRoot,
  venvPath,
  environment = process.env,
  platform = process.platform,
  fileExists = existsSync,
  runProcess = defaultRunProcess,
}: PythonEnvResolverOptions) => {
  const root = path.resolve(projectRoot);

  const resolvedVenvPath = (): string => {
    if (venvPath !== undefined) {
      return path.resolve(root, venvPath);
    }

    const configured = environment[VENV_ENVIRONMENT_VARIABLE];

    if (configured !== undefined && configured.trim() !== '') {
      return path.resolve(configured);
    }

    return path.join(root, VENV_CACHE_DIRECTORY);
  };

  const resolvePinnedPython = (): PinnedPythonInfo => {
    const resolvedVenv = resolvedVenvPath();
    const executablePath = pythonExecutableIn(resolvedVenv, platform);

    if (fileExists(executablePath)) {
      return { executablePath, venvPath: resolvedVenv, isValid: true };
    }

    return {
      executablePath,
      venvPath: resolvedVenv,
      isValid: false,
      driftReport: `未找到锁定的 Python 解释器：${executablePath}。请先运行 ./init.sh 修复环境。`,
    };
  };

  const runScript = async (
    scriptPath: string,
    args: readonly string[] = [],
    options: ScriptRunOptions = {},
  ): Promise<ScriptRunResult> => {
    const info = resolvePinnedPython();

    if (!info.isValid) {
      throw new PinnedPythonMissingError(info);
    }

    return runProcess(
      info.executablePath,
      [path.resolve(root, scriptPath), ...args],
      {
        cwd: path.resolve(root, options.cwd ?? '.'),
        env: {
          ...environment,
          PYTHONIOENCODING: 'utf-8',
          PYTHONDONTWRITEBYTECODE: '1',
        },
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
  };

  /**
   * Runs `./init.sh --check` so a drifted pin (interpreter, packages, skills) is
   * reported before any modeling script claims to have proven something.
   */
  const checkLock = async (
    options: ScriptRunOptions = {},
  ): Promise<{ ok: boolean; output: string }> => {
    const script = path.join(root, 'init.sh');
    const result = await runProcess('bash', [script, '--check'], {
      cwd: root,
      env: { ...environment },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    return {
      ok: result.code === 0,
      output: `${result.stdout}${result.stderr}`.trim(),
    };
  };

  return {
    projectRoot: root,
    resolveVenvPath: resolvedVenvPath,
    resolvePinnedPython,
    runScript,
    checkLock,
  };
};

export type PythonEnvResolver = ReturnType<typeof createPythonEnvResolver>;
