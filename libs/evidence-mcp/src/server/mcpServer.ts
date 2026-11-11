import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  type EvidenceMcpAppClient,
} from '../types.js';
import {
  SERVER_INSTRUCTIONS,
  createEvidenceTools,
  type EvidenceToolResult,
} from './toolset.js';

const toCallToolResult = (result: EvidenceToolResult): CallToolResult => ({
  ...(result.isError === true ? { isError: true } : {}),
  content: [
    { type: 'text' as const, text: result.text },
    ...(result.image === undefined
      ? []
      : [
          {
            type: 'image' as const,
            data: result.image.data,
            mimeType: result.image.mimeType,
          },
        ]),
  ],
});

const errorResult = (error: unknown): CallToolResult => ({
  isError: true,
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify({
        error: {
          message: error instanceof Error ? error.message : 'Unknown error.',
        },
      }),
    },
  ],
});

/** Creates the MCP server and registers every tool over one app client. */
export const createEvidenceMcpServer = ({
  appClient,
}: {
  appClient: EvidenceMcpAppClient;
}): McpServer => {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );
  const tools = createEvidenceTools(appClient);

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (input: Record<string, unknown>) => {
        try {
          return toCallToolResult(await tool.run(input));
        } catch (error) {
          return errorResult(error);
        }
      },
    );
  }

  return server;
};

/** Connects the MCP server to stdio, which is how `--mcp-stdio` runs. */
export const startEvidenceMcpStdioServer = async ({
  appClient,
}: {
  appClient: EvidenceMcpAppClient;
}): Promise<McpServer> => {
  const server = createEvidenceMcpServer({ appClient });
  const transport = new StdioServerTransport();

  await server.connect(transport);

  return server;
};
