import { describe, expect, it } from 'vitest';

import {
  PinnedPythonMissingError,
  PYTHON_RUNTIME_RESOURCE_DIRECTORY,
  createPythonEnvResolver,
  pythonExecutableIn,
  pythonExecutablesIn,
  resolveBundledPythonVenv,
  type ProcessRunner,
  type ScriptRunResult,
} from './pythonEnvResolver.js';

const PROJECT_ROOT = '/workspace/project';
const RESOURCES_PATH = '/Applications/Evidence Modeling.app/Contents/Resources';

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

  it('also accepts a standalone distribution that keeps python.exe at its root', () => {
    expect(pythonExecutablesIn('C:/runtime', 'win32')).toEqual([
      'C:/runtime/Scripts/python.exe',
      'C:/runtime/python.exe',
    ]);
  });
});

describe('resolveBundledPythonVenv', () => {
  it('reads the runtime next to app.asar when Electron defines one', () => {
    expect(resolveBundledPythonVenv(RESOURCES_PATH)).toBe(
      `/Applications/Evidence Modeling.app/Contents/Resources/${PYTHON_RUNTIME_RESOURCE_DIRECTORY}`,
    );
  });

  it('is null in a plain node process, so the workspace venv still wins', () => {
    expect(resolveBundledPythonVenv('')).toBeNull();
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

  it('prefers the interpreter the packaged app ships with', () => {
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      resourcesPath: RESOURCES_PATH,
      fileExists: (candidate) => candidate.endsWith('/python-runtime/bin/python'),
    });

    expect(resolver.bundledVenvPath).toBe(
      `${RESOURCES_PATH}/${PYTHON_RUNTIME_RESOURCE_DIRECTORY}`,
    );
    expect(resolver.resolveVenvPath()).toBe(resolver.bundledVenvPath);
    expect(resolver.resolvePinnedPython()).toEqual({
      executablePath: `${RESOURCES_PATH}/python-runtime/bin/python`,
      venvPath: `${RESOURCES_PATH}/python-runtime`,
      isValid: true,
    });
  });

  it('lets EVIDENCE_VENV override the bundled runtime', () => {
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      resourcesPath: RESOURCES_PATH,
      environment: { EVIDENCE_VENV: '/custom/venv' },
      fileExists: () => true,
    });

    expect(resolver.resolveVenvPath()).toBe('/custom/venv');
  });

  it('finds the interpreter of a portable windows distribution', () => {
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      resourcesPath: RESOURCES_PATH,
      platform: 'win32',
      fileExists: (candidate) =>
        candidate === `${RESOURCES_PATH}/python-runtime/python.exe`,
    });

    expect(resolver.resolvePinnedPython()).toEqual({
      executablePath: `${RESOURCES_PATH}/python-runtime/python.exe`,
      venvPath: `${RESOURCES_PATH}/python-runtime`,
      isValid: true,
    });
  });

  it('ignores a resources directory that holds no runtime', () => {
    // An Electron dev build also defines resourcesPath, but ships no Python.
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      resourcesPath: RESOURCES_PATH,
      fileExists: (candidate) =>
        candidate ===
        '/workspace/project/node_modules/.cache/evidence-fm-runtime/bin/python',
    });

    expect(resolver.resolveVenvPath()).toBe(
      '/workspace/project/node_modules/.cache/evidence-fm-runtime',
    );
  });

  it('reports drift instead of falling back to a bare python3', () => {    const resolver = createPythonEnvResolver({
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

  it('drops inherited PYTHONHOME and PYTHONPATH from the script env', async () => {
    const seen: NodeJS.ProcessEnv[] = [];
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      environment: {
        PATH: '/usr/bin',
        PYTHONHOME: '/usr/local/lib/python3.9',
        PYTHONPATH: '/usr/local/lib/python3.9/site-packages',
      },
      fileExists: () => true,
      runProcess: async (_command, _args, options) => {
        seen.push(options.env);

        return { code: 0, stdout: '{}', stderr: '' };
      },
    });

    await resolver.runScript('/skills/evidence-fm/scripts/check_fm.py');

    expect(seen[0]).toEqual({
      PATH: '/usr/bin',
      PYTHONIOENCODING: 'utf-8',
      PYTHONDONTWRITEBYTECODE: '1',
    });
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
