import { chmodSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';

import {
  type EvidenceMcpAppRequest,
  type EvidenceMcpAppResult,
  EvidenceMcpError,
  type EvidenceMcpErrorCode,
} from '../types.js';
import { isNamedPipe } from './endpoint.js';
import { MAX_MESSAGE_BYTES } from './client.js';

export interface EvidenceMcpBridgeServer {
  close(): Promise<void>;
}

type BridgeRequest =
  | { id: string; request: EvidenceMcpAppRequest }
  | { id?: undefined };

const serializeError = (
  id: string,
  error: unknown,
): string => {
  const normalized =
    error instanceof EvidenceMcpError
      ? error
      : new EvidenceMcpError(
          'INTERNAL_ERROR',
          error instanceof Error ? error.message : 'Unknown MCP error.',
        );

  return `${JSON.stringify({
    id,
    success: false,
    error: { code: normalized.code, message: normalized.message },
  })}\n`;
};

/**
 * Local socket server inside the desktop main process.
 *
 * Only the current operating-system user may connect: the endpoint lives in the
 * temp directory (or a named pipe) and the Unix socket is narrowed to `0600`,
 * because the payload is confidential business model data.
 */
export const createEvidenceMcpBridgeServer = async ({
  endpoint,
  handleRequest,
  onConnectionChange,
}: {
  endpoint: string;
  handleRequest: (
    request: EvidenceMcpAppRequest,
  ) => Promise<EvidenceMcpAppResult>;
  onConnectionChange?: (connections: number) => void;
}): Promise<EvidenceMcpBridgeServer> => {
  const pipe = isNamedPipe(endpoint);

  if (!pipe) {
    await rm(endpoint, { force: true });
  }

  let connections = 0;
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let handled = false;

    connections += 1;
    onConnectionChange?.(connections);
    socket.once('close', () => {
      connections -= 1;
      onConnectionChange?.(connections);
    });

    socket.on('data', (chunk: string) => {
      if (handled) {
        return;
      }

      buffer += chunk;

      if (buffer.length > MAX_MESSAGE_BYTES) {
        handled = true;
        socket.end(
          serializeError(
            'oversized',
            new EvidenceMcpError(
              'INTERNAL_ERROR',
              'MCP bridge request exceeded the size limit.',
            ),
          ),
        );
        return;
      }

      const newline = buffer.indexOf('\n');

      if (newline < 0) {
        return;
      }

      handled = true;

      let parsed: BridgeRequest;

      try {
        parsed = JSON.parse(buffer.slice(0, newline)) as BridgeRequest;
      } catch (error) {
        socket.end(serializeError('invalid-request', error));
        return;
      }

      if (parsed.id === undefined) {
        socket.end(
          serializeError(
            'invalid-request',
            new EvidenceMcpError(
              'INTERNAL_ERROR',
              'MCP bridge request is missing its identifier.',
            ),
          ),
        );
        return;
      }

      void handleRequest(parsed.request).then(
        (result) =>
          socket.end(
            `${JSON.stringify({ id: parsed.id, success: true, result })}\n`,
          ),
        (error) => socket.end(serializeError(parsed.id ?? 'unknown', error)),
      );
    });
    socket.once('error', (error) => {
      if (!handled) {
        handled = true;
        socket.end(serializeError('socket-error', error));
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(endpoint, () => {
      server.off('error', reject);
      resolve();
    });
  });

  if (!pipe) {
    // The socket must not be reachable by other local users.
    chmodSync(endpoint, 0o600);
  }

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          void (pipe
            ? Promise.resolve()
            : rm(endpoint, { force: true })
          ).then(
            () => resolve(),
            () => resolve(),
          );
        });
      }),
  };
};

export type { EvidenceMcpErrorCode };
