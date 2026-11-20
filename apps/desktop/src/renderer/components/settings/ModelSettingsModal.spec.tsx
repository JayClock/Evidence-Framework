import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AiConfigStatus } from '@evidence-poc/desktop-contracts/aiConfig';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import { ModelSettingsModal } from './ModelSettingsModal';

const status: AiConfigStatus = {
  agentDir: '/test/pi',
  isConfigured: true,
  activeProviderId: 'local-gateway',
  activeModelId: 'route/flash',
  activeModelName: 'Gateway Flash',
  thinkingLevel: 'low',
  availableModels: [
    {
      provider: 'local-gateway',
      id: 'route/flash',
      name: 'Gateway Flash',
      thinkingLevels: ['off', 'low', 'high'],
    },
    {
      provider: 'another-gateway',
      id: 'route/flash',
      name: 'Another Flash',
      thinkingLevels: ['off', 'xhigh'],
    },
  ],
};

const setup = (initial: AiConfigStatus | null = status) => {
  const api = installDesktopApi().aiConfig;
  api.selectModel = vi.fn(async () => status);
  api.testConnection = vi.fn(async () => ({ success: true, latencyMs: 12 }));
  const onStatus = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <ModelSettingsModal
      api={api}
      status={initial}
      onStatus={onStatus}
      onClose={onClose}
    />,
  );
  return { api, onStatus, onClose, view };
};

describe('Pi model settings', () => {
  it('groups models from Pi by provider and saves the exact provider/model pair', async () => {
    const { api, onStatus, onClose } = setup();
    expect(screen.getByText(/当前：Gateway Flash/)).toBeVisible();
    const group = screen.getByRole('group', { name: 'another-gateway' });
    const option = within(group).getByRole<HTMLOptionElement>('option', {
      name: 'Another Flash',
    });
    fireEvent.change(screen.getByLabelText('模型'), {
      target: { value: option.value },
    });
    expect(api.selectModel).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('思考级别'), {
      target: { value: 'xhigh' },
    });
    fireEvent.click(screen.getByRole('button', { name: '设为默认模型' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(api.selectModel).toHaveBeenCalledExactlyOnceWith({
      providerId: 'another-gateway',
      modelId: 'route/flash',
      thinkingLevel: 'xhigh',
    });
    expect(onStatus).toHaveBeenCalledWith(status);
  });

  it('tests the selected model without saving a new default', async () => {
    const { api } = setup();
    fireEvent.click(screen.getByRole('button', { name: '测试连通性' }));
    expect(await screen.findByText('连接成功 · 12 ms')).toBeVisible();
    expect(api.testConnection).toHaveBeenCalledExactlyOnceWith({
      providerId: 'local-gateway',
      modelId: 'route/flash',
    });
    expect(api.selectModel).not.toHaveBeenCalled();
  });

  it('opens the Pi directory and refreshes available models without changing the default', async () => {
    const { api, onStatus } = setup({
      ...status,
      availableModels: [],
      isConfigured: false,
    });
    api.openConfigDirectory = vi.fn(async () => undefined);
    api.reload = vi.fn(async () => status);
    fireEvent.click(screen.getByRole('button', { name: '打开 Pi 配置目录' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '重新加载 Pi 配置' }),
      ).toBeEnabled(),
    );
    expect(api.openConfigDirectory).toHaveBeenCalledExactlyOnceWith();
    fireEvent.click(screen.getByRole('button', { name: '重新加载 Pi 配置' }));
    expect(await screen.findByText('已重新读取 Pi 配置。')).toBeVisible();
    expect(onStatus).toHaveBeenCalledExactlyOnceWith(status);
    expect(api.selectModel).not.toHaveBeenCalled();
  });

  it('shows a Pi setup hint rather than an editable API-key form when no models are available', () => {
    setup({
      ...status,
      isConfigured: false,
      activeProviderId: null,
      activeModelId: null,
      activeModelName: null,
      availableModels: [],
    });
    expect(screen.getByText(/没有可用模型/)).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
