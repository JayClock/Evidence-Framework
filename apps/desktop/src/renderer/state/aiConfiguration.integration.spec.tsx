import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  installDesktopApi,
  projectSummary,
} from '@evidence-poc/desktop-testing/desktopApi';
import { storyFlow, storyResult } from '@evidence-poc/desktop-testing/story';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import type { AiConfigStatus } from '@evidence-poc/desktop-contracts/aiConfig';
import { AiConfigurationProvider } from './AiConfiguration';
import { EditorScreen } from '../screens/EditorScreen';

const setup = async () => {
  const api = installDesktopApi({
    openResult: {
      success: true,
      project: projectSummary(),
      document: createDesktopFixture(),
      issues: [],
    },
  });
  let status: AiConfigStatus = {
    isConfigured: false,
    activeProviderId: null,
    activeModelId: null,
    thinkingLevel: 'off',
    hasLocalPiCliConfig: false,
    availableModels: [],
  };
  api.aiConfig.getStatus = async () => status;
  api.aiConfig.save = vi.fn(async () => {
    status = {
      ...status,
      isConfigured: true,
      activeProviderId: 'deepseek',
      activeModelId: 'deepseek-chat',
    };
    return { success: true };
  });
  render(
    <AiConfigurationProvider>
      <EditorScreen rootPath="/models/procurement" />
    </AiConfigurationProvider>,
  );
  await screen.findByRole('button', { name: '配置大模型' });
  await waitFor(() =>
    expect(screen.queryByText('正在计算画布布局…')).toBeNull(),
  );
  return api;
};

describe('new-install AI onboarding integration', () => {
  it('configures from canvas storming and enables a prompt without reloading the project', async () => {
    const api = await setup();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByLabelText('业务场景')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '配置 AI 模型' }));
    fireEvent.change(screen.getByLabelText(/API 密钥/), {
      target: { value: 'private-input-only' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存并立即生效' }));
    await waitFor(() =>
      expect(screen.getByLabelText('业务场景')).not.toBeDisabled(),
    );
    expect(
      screen.getByRole('button', { name: '配置大模型' }),
    ).toHaveTextContent('deepseek-chat');
    fireEvent.change(screen.getByLabelText('业务场景'), {
      target: { value: '澄清付款条件' },
    });
    fireEvent.click(screen.getByRole('button', { name: /发起发散/ }));
    await waitFor(() => expect(api.calls.prompt).toHaveLength(1));
    expect(api.calls.open).toHaveLength(1);
    expect(api.calls.save).toEqual([]);
  });
  it('keeps stories offline and opens settings when attempting AI narration', async () => {
    const api = await setup();
    api.story.listFlows = async () => [storyFlow()];
    api.story.project = vi.fn(async () => storyResult());
    fireEvent.click(screen.getByRole('button', { name: /业务流放映/ }));
    await waitFor(() =>
      expect(api.story.project).toHaveBeenCalledWith(
        expect.objectContaining({ skipAi: true }),
      ),
    );
    const offline = screen.getByRole('checkbox', { name: '仅模型事实' });
    expect(offline).toBeChecked();
    fireEvent.click(offline);
    expect(
      screen.getByRole('dialog', { name: /AI Model Settings/ }),
    ).toBeVisible();
    expect(api.calls.prompt).toEqual([]);
  });
  it('exposes model settings through the command palette', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '打开快速命令' }));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'AI Settings' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /配置大模型/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('API Key');
  });
});
