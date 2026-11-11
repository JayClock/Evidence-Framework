import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { McpStatusPill } from './McpStatusPill';
import { installDesktopApi } from '../test-support/desktopApi';

const status = (overrides: Partial<Parameters<ReturnType<typeof installDesktopApi>['mcpMock']['emitStatus']>[0]> = {}) => ({
  listening: true,
  endpoint: '/tmp/evidence-mcp-test.sock',
  connections: 0,
  calls: 0,
  registeredClients: [] as string[],
  error: null,
  ...overrides,
});

describe('McpStatusPill', () => {
  it('reports the bridge as waiting when nobody is connected', async () => {
    installDesktopApi();

    render(<McpStatusPill />);

    await waitFor(() => {
      expect(screen.getByText('MCP 待命')).toBeInTheDocument();
    });
  });

  it('names the clients that are connected', async () => {
    const api = installDesktopApi();

    render(<McpStatusPill />);

    await waitFor(() => {
      expect(screen.getByText('MCP 待命')).toBeInTheDocument();
    });

    act(() => {
      api.mcpMock.emitStatus(
        status({ connections: 1, registeredClients: ['Cursor'] }),
      );
    });

    expect(screen.getByText('MCP 已连接（Cursor）')).toBeInTheDocument();
  });

  it('reports a bridge that never started', async () => {
    const api = installDesktopApi();

    api.mcpMock.setStatus(status({ listening: false, endpoint: null }));

    render(<McpStatusPill />);

    await waitFor(() => {
      expect(screen.getByText('MCP 未启动')).toBeInTheDocument();
    });
  });
});
