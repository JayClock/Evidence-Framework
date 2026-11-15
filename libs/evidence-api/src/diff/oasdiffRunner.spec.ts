import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { OasdiffRunner, OASDIFF_VERSION } from './oasdiffRunner.js';

const execute = vi.hoisted(() => vi.fn());
vi.mock('node:util', () => ({ promisify: () => execute }));

const finding = {
  id: 'api-removed',
  text: 'endpoint removed',
  level: 3,
  operation: 'POST',
  path: '/orders',
};
const response = (stdout: string) => Promise.resolve({ stdout });
let directory = '';
beforeEach(() => {
  execute.mockReset();
  execute.mockImplementation(async (_binary, args, options) => {
    directory = options.cwd;
    if (args[0] === '--version')
      return response(`oasdiff version ${OASDIFF_VERSION}\n`);
    expect(
      JSON.parse(readFileSync(path.join(directory, 'base.json'), 'utf8')),
    ).toEqual({ paths: {} });
    expect(args).toContain('--allow-external-refs=false');
    return response(
      args.at(-1) === 'markdown'
        ? '# Changes\n'
        : args[0] === 'diff'
          ? '{}'
          : JSON.stringify([finding]),
    );
  });
});

it('preserves native output, isolates configuration and removes temporary inputs', async () => {
  const runner = new OasdiffRunner({ binary: '/path with spaces/oasdiff' });
  const result = await runner.compare({ paths: {} }, { paths: {} });
  expect(result).toEqual({
    changes: [finding],
    hasBreakingChanges: true,
    changelog: '# Changes\n',
    details: {},
  });
  expect(
    execute.mock.calls.every(
      ([binary, , options]) =>
        binary === '/path with spaces/oasdiff' &&
        options.timeout === 30000 &&
        options.shell === undefined,
    ),
  ).toBe(true);
  expect(existsSync(directory)).toBe(false);
});

it.each(['[]', '[{"id":"api-added","text":"added","level":1}]'])(
  'does not classify compatible changes as breaking: %s',
  async (json) => {
    execute.mockImplementation(async (_binary, args, options) => {
      directory = options.cwd;
      return response(
        args[0] === '--version'
          ? `oasdiff version ${OASDIFF_VERSION}`
          : args[0] === 'diff'
            ? '{}'
            : args.at(-1) === 'markdown'
              ? ''
              : json,
      );
    });
    expect((await new OasdiffRunner().compare({}, {})).hasBreakingChanges).toBe(
      false,
    );
  },
);

it.each(['not json', '{}', '[{"id":"x","text":"x","level":"ERR"}]'])(
  'fails closed on malformed output: %s',
  async (json) => {
    execute.mockImplementation(async (_binary, args, options) => {
      directory = options.cwd;
      return response(
        args[0] === '--version' ? `oasdiff version ${OASDIFF_VERSION}` : json,
      );
    });
    await expect(new OasdiffRunner().compare({}, {})).rejects.toThrow();
    expect(existsSync(directory)).toBe(false);
  },
);

it.each(['ENOENT', 'timeout', 'maxBuffer exceeded', 'invalid spec'])(
  'preserves tool failure diagnostics: %s',
  async (message) => {
    execute.mockImplementation(async (_binary, _args, options) => {
      directory = options.cwd;
      throw Object.assign(new Error(message), {
        stdout: 'partial',
        stderr: 'diagnostic',
      });
    });
    await expect(new OasdiffRunner().compare({}, {})).rejects.toMatchObject({
      stdout: 'partial',
      stderr: 'diagnostic',
    });
    expect(existsSync(directory)).toBe(false);
  },
);

it('rejects an unsupported executable version', async () => {
  execute.mockResolvedValue({ stdout: 'oasdiff version 0.1.0' });
  await expect(new OasdiffRunner().compare({}, {})).rejects.toThrow(
    'Expected oasdiff',
  );
});
