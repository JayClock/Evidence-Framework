import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
  const status: AiConfigStatus = {
    isConfigured: false,
    activeProviderId: null,
    activeModelId: null,
    activeModelName: null,
    agentDir: '/test/pi',
    thinkingLevel: 'off',
    availableModels: [],
  };
  let publishStatus: (next: AiConfigStatus) => void = () => undefined;
  api.aiConfig.getStatus = async () => status;
  api.aiConfig.onChanged = (listener) => {
    publishStatus = listener;
    return () => undefined;
  };
  render(
    <AiConfigurationProvider>
      <EditorScreen rootPath="/models/procurement" />
    </AiConfigurationProvider>,
  );
  await screen.findByRole('button', { name: '配置大模型' });
  await waitFor(() =>
    expect(screen.queryByText('正在计算画布布局…')).toBeNull(),
  );
  return { api, publishStatus };
};

describe('Pi model onboarding integration', () => {
  it('enables canvas storming when a configured Pi model becomes available', async () => {
    const { api, publishStatus } = await setup();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByLabelText('业务场景')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '配置 AI 模型' }));
    expect(await screen.findByText(/没有可用模型/)).toBeVisible();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    act(() =>
      publishStatus({
        agentDir: '/test/pi',
        isConfigured: true,
        activeProviderId: 'magpie',
        activeModelId: 'routing/flash',
        activeModelName: 'Flash Gateway',
        thinkingLevel: 'off',
        availableModels: [],
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('业务场景')).not.toBeDisabled(),
    );
    expect(
      screen.getByRole('button', { name: '配置大模型' }),
    ).toHaveTextContent('Flash Gateway');
    fireEvent.change(screen.getByLabelText('业务场景'), {
      target: { value: '澄清付款条件' },
    });
    fireEvent.click(screen.getByRole('button', { name: /发起发散/ }));
    await waitFor(() => expect(api.calls.prompt).toHaveLength(1));
    expect(api.calls.open).toHaveLength(1);
    expect(api.calls.save).toEqual([]);
  });
  it('keeps stories offline and opens settings when attempting AI narration', async () => {
    const { api } = await setup();
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
    expect(screen.getByRole('dialog')).toHaveTextContent('Pi 配置目录');
  });
});
