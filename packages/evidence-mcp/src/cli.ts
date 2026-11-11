import { createEvidenceMcpBridgeClient } from './bridge/client.js';
import { startEvidenceMcpStdioServer } from './server/mcpServer.js';

/** Environment variable the desktop binary sets for its `--mcp-stdio` child. */
export const MCP_ENDPOINT_ENV = 'EVIDENCE_MCP_ENDPOINT';

/**
 * Runs the stdio MCP server until the client closes the pipe.
 *
 * This is the fast path external IDEs start: no window, no model, just a pipe
 * that forwards tool calls to the desktop app over the local socket.
 */
export const runEvidenceMcpStdio = async ({
  endpoint,
}: {
  endpoint: string;
}): Promise<void> => {
  const server = await startEvidenceMcpStdioServer({
    appClient: createEvidenceMcpBridgeClient({ endpoint }),
  });

  await new Promise<void>((resolve) => {
    process.stdin.once('end', () => resolve());
    process.stdin.resume();
  });

  await server.close();
};
