import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const MCP_SOCKET_PREFIX = 'evidence-mcp';

/**
 * Cross-platform local endpoint for the desktop bridge.
 *
 * A short, per-user path keeps two accounts (or two checkouts) from sharing one
 * socket: the model that flows through it is confidential business data.
 */
export const getEvidenceMcpBridgeEndpoint = ({
  platform,
  userDataPath,
}: {
  platform: NodeJS.Platform;
  userDataPath: string;
}): string => {
  const digest = createHash('sha1')
    .update(userDataPath)
    .digest('hex')
    .slice(0, 12);
  const name = `${MCP_SOCKET_PREFIX}-${digest}`;

  return platform === 'win32'
    ? `\\\\.\\pipe\\${name}`
    : join(tmpdir(), `${name}.sock`);
};

/** True for Windows named pipes, which have no file to unlink. */
export const isNamedPipe = (endpoint: string): boolean =>
  endpoint.startsWith('\\\\.\\pipe\\');
