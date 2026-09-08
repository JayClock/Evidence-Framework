import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import type { FmModelFile } from '../../modeling/fm/contracts.ts';

const execFileAsync = promisify(execFile);

export async function executeProcess(
  command: string,
  args: string[],
  options: { cwd: string; timeout?: number; signal?: AbortSignal },
) {
  try {
    const result = await execFileAsync(command, args, {
      ...options,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      encoding: 'utf8',
    });
    return { code: 0, killed: false, ...result };
  } catch (error) {
    const failure = error as {
      code?: number;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      code: typeof failure.code === 'number' ? failure.code : 1,
      killed: failure.killed ?? false,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message ?? '',
    };
  }
}

export async function prepareFmSkill(root: string): Promise<void> {
  const skillPath = '.pi/skills/evidence-modeling';
  await mkdir(join(root, skillPath), { recursive: true });
  for (const entry of ['requirements.txt', 'scripts', 'schemas']) {
    await cp(
      join(process.cwd(), skillPath, entry),
      join(root, skillPath, entry),
      {
        recursive: true,
        filter: (path) => basename(path) !== '__pycache__',
      },
    );
  }
}

export async function readFmFixtureFiles(name: string): Promise<FmModelFile[]> {
  const fixture = join(
    process.cwd(),
    '.pi/skills/evidence-modeling/tests/fixtures',
    name,
  );
  const paths = await readdir(fixture, { recursive: true });
  return Promise.all(
    paths
      .filter((path) => path.endsWith('.yaml'))
      .map(async (path) => ({
        path: path.replaceAll('\\', '/'),
        content: await readFile(join(fixture, path), 'utf8'),
      })),
  );
}
