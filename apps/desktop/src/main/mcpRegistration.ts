import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export interface McpClientConfig {
  /** Name the client shows in its MCP server list. */
  client: string;
  /** Absolute config file path. */
  configPath: string;
}

export const MCP_SERVER_KEY = 'evidence-desktop';

/**
 * Config files the app keeps in sync.
 *
 * A client is only touched when its own directory already exists: creating a
 * `.cursor` folder for someone who does not use Cursor would be rude, and an
 * uninstalled client cannot read the config anyway.
 */
export const mcpClientConfigs = ({
  platform,
  home = homedir(),
  appData = process.env.APPDATA,
}: {
  platform: NodeJS.Platform;
  home?: string;
  appData?: string;
}): readonly McpClientConfig[] => {
  const configs: McpClientConfig[] = [
    { client: 'Cursor', configPath: path.join(home, '.cursor', 'mcp.json') },
  ];

  if (platform === 'darwin') {
    configs.push({
      client: 'Claude Desktop',
      configPath: path.join(
        home,
        'Library',
        'Application Support',
        'Claude',
        'claude_desktop_config.json',
      ),
    });
  }

  if (platform === 'win32' && appData !== undefined) {
    configs.push({
      client: 'Claude Desktop',
      configPath: path.join(appData, 'Claude', 'claude_desktop_config.json'),
    });
  }

  return configs;
};

interface McpConfigFile {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

const readConfig = async (configPath: string): Promise<McpConfigFile> => {
  try {
    const content = await readFile(configPath, 'utf8');

    if (content.trim() === '') {
      return {};
    }

    const parsed = JSON.parse(content) as unknown;

    return typeof parsed === 'object' && parsed !== null
      ? (parsed as McpConfigFile)
      : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }

    throw error;
  }
};

const exists = async (target: string): Promise<boolean> => {
  try {
    await stat(target);

    return true;
  } catch {
    return false;
  }
};

/** Server entry every client receives; the env carries the socket path. */
export const evidenceMcpServerEntry = ({
  executablePath,
  endpoint,
}: {
  executablePath: string;
  endpoint: string;
}) => ({
  command: executablePath,
  args: ['--mcp-stdio'],
  env: { EVIDENCE_MCP_ENDPOINT: endpoint },
});

export interface SynchronizeResult {
  updated: readonly string[];
  skipped: readonly string[];
  failed: readonly { client: string; error: string }[];
}

/**
 * Merges the server entry into each installed client's config.
 *
 * The merge is idempotent and preserves every other server and key, so running
 * the app never clobbers a user's existing MCP setup.
 */
export const synchronizeEvidenceMcpRegistration = async ({
  endpoint,
  executablePath,
  configs,
}: {
  endpoint: string;
  executablePath: string;
  configs: readonly McpClientConfig[];
}): Promise<SynchronizeResult> => {
  const updated: string[] = [];
  const skipped: string[] = [];
  const failed: { client: string; error: string }[] = [];

  for (const config of configs) {
    const directory = path.dirname(config.configPath);
    const installed = await exists(directory);

    if (!installed) {
      skipped.push(config.client);
      continue;
    }

    try {
      const current = await readConfig(config.configPath);
      const servers =
        typeof current.mcpServers === 'object' && current.mcpServers !== null
          ? current.mcpServers
          : {};
      const next = {
        ...current,
        mcpServers: {
          ...servers,
          [MCP_SERVER_KEY]: evidenceMcpServerEntry({
            executablePath,
            endpoint,
          }),
        },
      };

      await mkdir(directory, { recursive: true });
      await writeFile(
        config.configPath,
        `${JSON.stringify(next, null, 2)}\n`,
        'utf8',
      );
      updated.push(config.client);
    } catch (error) {
      failed.push({
        client: config.client,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  return { updated, skipped, failed };
};
