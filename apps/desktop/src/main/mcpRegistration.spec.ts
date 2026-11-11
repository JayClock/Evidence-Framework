import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MCP_SERVER_KEY,
  evidenceMcpServerEntry,
  mcpClientConfigs,
  synchronizeEvidenceMcpRegistration,
} from './mcpRegistration';

const workdir = async (): Promise<string> =>
  mkdtemp(path.join(tmpdir(), 'evidence-mcp-registration-'));

describe('mcpClientConfigs', () => {
  it('lists Cursor and the platform Claude Desktop config', () => {
    const mac = mcpClientConfigs({ platform: 'darwin', home: '/Users/a' });
    const win = mcpClientConfigs({
      platform: 'win32',
      home: 'C:\\Users\\a',
      appData: 'C:\\Users\\a\\AppData\\Roaming',
    });

    expect(mac.map((config) => config.client)).toEqual([
      'Cursor',
      'Claude Desktop',
    ]);
    expect(mac[0]?.configPath).toBe('/Users/a/.cursor/mcp.json');
    expect(mac[1]?.configPath).toContain('Library/Application Support/Claude');
    expect(win[1]?.configPath).toContain('AppData');
  });

  it('omits Claude Desktop on Linux where the path is unknown', () => {
    expect(
      mcpClientConfigs({ platform: 'linux', home: '/home/a' }).map(
        (config) => config.client,
      ),
    ).toEqual(['Cursor']);
  });
});

describe('evidenceMcpServerEntry', () => {
  it('starts the same binary in stdio mode with the socket endpoint', () => {
    expect(
      evidenceMcpServerEntry({
        executablePath: '/Applications/Evidence.app/Contents/MacOS/Evidence',
        endpoint: '/tmp/evidence-mcp-abc.sock',
      }),
    ).toEqual({
      command: '/Applications/Evidence.app/Contents/MacOS/Evidence',
      args: ['--mcp-stdio'],
      env: { EVIDENCE_MCP_ENDPOINT: '/tmp/evidence-mcp-abc.sock' },
    });
  });
});

describe('synchronizeEvidenceMcpRegistration', () => {
  it('merges into an existing config and keeps other servers', async () => {
    const root = await workdir();
    const configPath = path.join(root, 'mcp.json');
    const original = {
      theme: 'dark',
      mcpServers: { other: { command: 'other', args: [] } },
    };

    await writeFile(configPath, JSON.stringify(original), 'utf8');

    const result = await synchronizeEvidenceMcpRegistration({
      endpoint: '/tmp/evidence.sock',
      executablePath: '/bin/evidence',
      configs: [{ client: 'Cursor', configPath }],
    });

    const written = JSON.parse(await readFile(configPath, 'utf8')) as {
      theme: string;
      mcpServers: Record<string, unknown>;
    };

    expect(result.updated).toEqual(['Cursor']);
    expect(written.theme).toBe('dark');
    expect(Object.keys(written.mcpServers).sort()).toEqual([
      MCP_SERVER_KEY,
      'other',
    ]);
    expect(written.mcpServers[MCP_SERVER_KEY]).toMatchObject({
      command: '/bin/evidence',
      args: ['--mcp-stdio'],
    });
  });

  it('is idempotent so restarting the app changes nothing', async () => {
    const root = await workdir();
    const configPath = path.join(root, 'mcp.json');
    const register = () =>
      synchronizeEvidenceMcpRegistration({
        endpoint: '/tmp/evidence.sock',
        executablePath: '/bin/evidence',
        configs: [{ client: 'Cursor', configPath }],
      });

    await register();
    const first = await readFile(configPath, 'utf8');

    await register();
    const second = await readFile(configPath, 'utf8');

    expect(second).toBe(first);
  });

  it('skips a client whose directory does not exist', async () => {
    const root = await workdir();
    const configPath = path.join(root, 'not-installed', 'mcp.json');

    const result = await synchronizeEvidenceMcpRegistration({
      endpoint: '/tmp/evidence.sock',
      executablePath: '/bin/evidence',
      configs: [{ client: 'Claude Desktop', configPath }],
    });

    expect(result.updated).toEqual([]);
    expect(result.skipped).toEqual(['Claude Desktop']);
  });

  it('reports a broken config instead of overwriting it', async () => {
    const root = await workdir();
    const configPath = path.join(root, 'mcp.json');

    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, '{ not json', 'utf8');

    const result = await synchronizeEvidenceMcpRegistration({
      endpoint: '/tmp/evidence.sock',
      executablePath: '/bin/evidence',
      configs: [{ client: 'Cursor', configPath }],
    });

    expect(result.failed.map((entry) => entry.client)).toEqual(['Cursor']);
    expect(await readFile(configPath, 'utf8')).toBe('{ not json');
  });
});
