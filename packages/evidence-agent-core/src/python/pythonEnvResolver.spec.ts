import { describe, expect, it } from 'vitest';

import {
  PinnedPythonMissingError,
  createPythonEnvResolver,
  pythonExecutableIn,
  type ProcessRunner,
  type ScriptRunResult,
} from './pythonEnvResolver.js';

const PROJECT_ROOT = '/workspace/project';

const runnerReturning =
  (result: ScriptRunResult): ProcessRunner =>
  async () =>
    result;

describe('pythonExecutableIn', () => {
  it('uses bin/python on posix and Scripts/python.exe on windows', () => {
    expect(pythonExecutableIn('/venv', 'darwin')).toBe('/venv/bin/python');
    expect(pythonExecutableIn('C:/venv', 'win32')).toBe(
      'C:/venv/Scripts/python.exe',
    );
  });
});

describe('createPythonEnvResolver', () => {
  it('resolves the workspace virtual environment without asking the shell', () => {
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      fileExists: () => true,
    });

    expect(resolver.resolvePinnedPython()).toEqual({
      executablePath:
        '/workspace/project/node_modules/.cache/evidence-fm-runtime/bin/python',
      venvPath: '/workspace/project/node_modules/.cache/evidence-fm-runtime',
      isValid: true,
    });
  });

  it('honours EVIDENCE_VENV and the explicit override', () => {
    const fromEnvironment = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      environment: { EVIDENCE_VENV: '/custom/venv' },
      fileExists: () => true,
    });
    const overridden = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      venvPath: '/explicit/venv',
      environment: { EVIDENCE_VENV: '/custom/venv' },
      fileExists: () => true,
    });

    expect(fromEnvironment.resolveVenvPath()).toBe('/custom/venv');
    expect(overridden.resolveVenvPath()).toBe('/explicit/venv');
  });

  it('reports drift instead of falling back to a bare python3', () => {
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      fileExists: () => false,
    });
    const info = resolver.resolvePinnedPython();

    expect(info.isValid).toBe(false);
    expect(info.driftReport).toContain('./init.sh');
  });

  it('refuses to run a script without the pinned interpreter', async () => {
    const calls: string[] = [];
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      fileExists: () => false,
      runProcess: async (command) => {
        calls.push(command);

        return { code: 0, stdout: '', stderr: '' };
      },
    });

    await expect(
      resolver.runScript('.agents/skills/evidence-fm/scripts/check_fm.py'),
    ).rejects.toBeInstanceOf(PinnedPythonMissingError);
    expect(calls).toEqual([]);
  });

  it('runs the script with the pinned interpreter and a deterministic env', async () => {
    const recorded: {
      command: string;
      args: readonly string[];
      cwd: string;
      env: NodeJS.ProcessEnv;
    }[] = [];
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      environment: { PATH: '/usr/bin' },
      fileExists: () => true,
      runProcess: async (command, args, options) => {
        recorded.push({
          command,
          args,
          cwd: options.cwd,
          env: options.env,
        });

        return { code: 1, stdout: '{"valid":false}', stderr: 'boom' };
      },
    });

    const result = await resolver.runScript(
      '.agents/skills/evidence-fm/scripts/check_fm.py',
      ['some/model'],
    );

    expect(result).toEqual({
      code: 1,
      stdout: '{"valid":false}',
      stderr: 'boom',
    });
    expect(recorded).toEqual([
      {
        command:
          '/workspace/project/node_modules/.cache/evidence-fm-runtime/bin/python',
        args: [
          '/workspace/project/.agents/skills/evidence-fm/scripts/check_fm.py',
          'some/model',
        ],
        cwd: '/workspace/project',
        env: {
          PATH: '/usr/bin',
          PYTHONIOENCODING: 'utf-8',
          PYTHONDONTWRITEBYTECODE: '1',
        },
      },
    ]);
  });

  it('reports the lock check through ./init.sh --check', async () => {
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      fileExists: () => true,
      runProcess: runnerReturning({
        code: 1,
        stdout: 'result   drift\n',
        stderr: '',
      }),
    });

    await expect(resolver.checkLock()).resolves.toEqual({
      ok: false,
      output: 'result   drift',
    });
  });
});
