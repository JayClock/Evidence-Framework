import { useEffect, useState } from 'react';

import type { McpStatus } from '../../shared/mcpIpc';

const statusLabel = (status: McpStatus | null): string => {
  if (status === null) {
    return 'MCP 未启动';
  }

  if (!status.listening) {
    return 'MCP 未启动';
  }

  return status.connections > 0
    ? `MCP 已连接${status.registeredClients.length > 0 ? `（${status.registeredClients.join(' / ')}）` : ''}`
    : 'MCP 待命';
};

const dotColor = (status: McpStatus | null): string => {
  if (status === null || !status.listening) {
    return 'bg-[#c4c9d2]';
  }

  return status.connections > 0 ? 'bg-[#2f8f5b]' : 'bg-[#b9bec7]';
};

/**
 * Shows whether external agents can reach this window.
 *
 * The bridge is a local socket, so this is not a network indicator: green means an
 * IDE or CLI is actually connected and reading the model the modeler sees.
 */
export const McpStatusPill = () => {
  const [status, setStatus] = useState<McpStatus | null>(null);

  useEffect(() => {
    let active = true;

    void window.evidenceAPI.mcp.getStatus().then((next) => {
      if (active) {
        setStatus(next);
      }
    });
    const unsubscribe = window.evidenceAPI.mcp.onStatus(setStatus);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <span
      data-region="mcp-status"
      title={
        status?.endpoint === undefined || status.endpoint === null
          ? 'MCP 本地桥接尚未启动。'
          : `本地桥接：${status.endpoint}\n已服务调用：${status.calls}`
      }
      className="flex max-w-[220px] items-center gap-1 rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted"
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor(status)}`}
      />
      <span className="truncate">{statusLabel(status)}</span>
    </span>
  );
};
