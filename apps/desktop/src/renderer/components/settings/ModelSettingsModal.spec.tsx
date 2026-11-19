import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AiConfigStatus,
  EvidenceAiConfigApi,
} from '@evidence-poc/desktop-contracts/aiConfig';
import { ModelSettingsModal } from './ModelSettingsModal';

const status: AiConfigStatus = {
  isConfigured: false,
  activeProviderId: null,
  activeModelId: null,
  thinkingLevel: 'off',
  hasLocalPiCliConfig: true,
  availableModels: [],
};
const setup = () => {
  const api: EvidenceAiConfigApi = {
    getStatus: vi.fn(async () => status),
    save: vi.fn(async () => ({ success: true })),
    testConnection: vi.fn(async () => ({ success: true, latencyMs: 42 })),
    importCli: vi.fn(async () => ({ imported: true, providerId: 'deepseek' })),
    onChanged: () => () => undefined,
  };
  const onClose = vi.fn();
  const onStatus = vi.fn();
  render(
    <ModelSettingsModal
      api={api}
      status={status}
      onClose={onClose}
      onStatus={onStatus}
    />,
  );
  return { api, onClose, onStatus };
};
describe('model settings', () => {
  it('masks keys, tests draft settings without saving and clears keys after save', async () => {
    const { api, onClose } = setup();
    const input = screen.getByLabelText(/API 密钥/);
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.change(input, { target: { value: 'new-private-key' } });
    fireEvent.click(screen.getByRole('button', { name: '测试连通性 (15s)' }));
    await screen.findByText('连接成功 · 42 ms');
    expect(api.save).not.toHaveBeenCalled();
    expect(api.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'deepseek',
        apiKey: 'new-private-key',
        modelId: 'deepseek-chat',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '保存并立即生效' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(input).toHaveValue('');
  });
  it('clears key input when changing providers and accepts custom models and endpoints', async () => {
    const { api } = setup();
    fireEvent.change(screen.getByLabelText(/API 密钥/), {
      target: { value: 'first-provider-key' },
    });
    fireEvent.change(screen.getByLabelText(/模型提供商/), {
      target: { value: 'custom-openai-compatible' },
    });
    expect(screen.getByLabelText(/API 密钥/)).toHaveValue('');
    expect(screen.getByLabelText(/Base URL/)).toHaveValue(
      'http://localhost:11434/v1',
    );
    fireEvent.change(screen.getByLabelText('模型名称'), {
      target: { value: 'local-model' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存并立即生效' }));
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'custom-openai-compatible',
          modelId: 'local-model',
          apiKey: '',
        }),
      ),
    );
  });
  it('blocks dismissal during a test and returns focus to the invoker after cancellation', async () => {
    let finishTest!: (result: { success: true; latencyMs: number }) => void;
    const test = new Promise<{ success: true; latencyMs: number }>(
      (resolve) => {
        finishTest = resolve;
      },
    );
    const api: EvidenceAiConfigApi = {
      getStatus: vi.fn(async () => status),
      save: vi.fn(async () => ({ success: true })),
      testConnection: vi.fn(() => test),
      importCli: vi.fn(async () => ({ imported: false })),
      onChanged: () => () => undefined,
    };
    const Launcher = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>设置入口</button>
          {open ? (
            <ModelSettingsModal
              api={api}
              status={status}
              onStatus={vi.fn()}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      );
    };
    render(<Launcher />);
    const invoker = screen.getByRole('button', { name: '设置入口' });
    invoker.focus();
    fireEvent.click(invoker);
    expect(screen.getByLabelText(/模型提供商/)).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '测试连通性 (15s)' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('status')).toHaveTextContent('正在测试连通性');
    expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled();
    await act(async () => finishTest({ success: true, latencyMs: 42 }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(invoker).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('imports only on explicit action and keeps failures secret-free', async () => {
    const { api } = setup();
    expect(api.importCli).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '一键导入现有配置' }));
    await screen.findByText(/已导入安全存储/);
    vi.mocked(api.save).mockRejectedValueOnce(
      new Error('raw secret must not appear'),
    );
    fireEvent.click(screen.getByRole('button', { name: '保存并立即生效' }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent(
      'raw secret',
    );
  });
});
