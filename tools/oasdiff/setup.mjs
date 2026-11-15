import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const version = '1.38.0';
const archives = {
  'darwin-arm64': [
    'darwin_all',
    '8a85428df3b00e76e7d41c49d222533c9beec813e9cbdc8162f3a6e776604c18',
  ],
  'darwin-x64': [
    'darwin_all',
    '8a85428df3b00e76e7d41c49d222533c9beec813e9cbdc8162f3a6e776604c18',
  ],
  'linux-x64': [
    'linux_amd64',
    '613037fd6a1d3362a1b742d6d86c338c0eb5ab3511f4942ce3948e78720ea2da',
  ],
  'linux-arm64': [
    'linux_arm64',
    'a5ebb16d90f729f6b436a92d3054c11ba5633ddfb639dfdfb64b0023cd03680c',
  ],
  'win32-x64': [
    'windows_amd64',
    '4509a5d838849ab39c759b6ed95a0b9193b80a69e55b88c6c9e72d7bde21bbcf',
  ],
  'win32-arm64': [
    'windows_arm64',
    '2e562ef56a6447fef0fc35158c390455fff843a4e10e862aded3fb7102bc9b89',
  ],
};
const platform = `${process.platform}-${process.arch}`;
const archive = archives[platform];
if (!archive) throw new Error(`oasdiff is not packaged for ${platform}.`);
const root = fileURLToPath(new URL('../../', import.meta.url));
const parent = path.join(root, 'node_modules/.cache/evidence/oasdiff', version);
const directory = path.join(parent, platform);
const filename = process.platform === 'win32' ? 'oasdiff.exe' : 'oasdiff';
const binary = path.join(directory, filename);
const matchesVersion = async (executable) => {
  try {
    return (
      (
        await execute(executable, ['--version'], { timeout: 10000 })
      ).stdout.trim() === `oasdiff version ${version}`
    );
  } catch {
    return false;
  }
};

if (!(await matchesVersion(binary))) {
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(path.join(parent, '.download-'));
  try {
    const url = `https://github.com/oasdiff/oasdiff/releases/download/v${version}/oasdiff_${version}_${archive[0]}.tar.gz`;
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok)
      throw new Error(`oasdiff download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== archive[1])
      throw new Error('oasdiff archive checksum mismatch.');
    const file = path.join(temporary, 'archive.tar.gz');
    await writeFile(file, bytes);
    await execute('tar', ['-xzf', file, '-C', temporary, filename, 'LICENSE'], {
      timeout: 30000,
    });
    await rm(file);
    await chmod(path.join(temporary, filename), 0o755);
    if (!(await matchesVersion(path.join(temporary, filename))))
      throw new Error('oasdiff version verification failed.');
    await rm(directory, { recursive: true, force: true });
    await rename(temporary, directory);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
if (process.env.GITHUB_PATH)
  await appendFile(process.env.GITHUB_PATH, `${directory}\n`);
console.log(binary);
