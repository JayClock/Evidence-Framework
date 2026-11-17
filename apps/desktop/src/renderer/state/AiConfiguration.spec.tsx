import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import type { AiConfigStatus } from '@evidence-poc/desktop-contracts/aiConfig';
import { AiConfigurationProvider, useAiConfiguration } from './AiConfiguration';
const empty: AiConfigStatus = {
  isConfigured: false,
  activeProviderId: null,
  activeModelId: null,
  thinkingLevel: 'off',
  hasLocalPiCliConfig: false,
  availableModels: [],
};
const Harness = () => {
  const ai = useAiConfiguration();
  return (
    <button onClick={ai?.openSettings}>
      {ai?.aiConfigured ? 'configured' : 'needs setup'}
    </button>
  );
};
describe('AI application shell', () => {
  it('onboards a clean installation via shortcut, updates on change and unsubscribes', async () => {
    const api = installDesktopApi();
    api.aiConfig.getStatus = async () => empty;
    let listener: (status: AiConfigStatus) => void = () => undefined;
    const unsubscribe = vi.fn();
    api.aiConfig.onChanged = (next) => {
      listener = next;
      return unsubscribe;
    };
    const view = render(
      <AiConfigurationProvider>
        <Harness />
      </AiConfigurationProvider>,
    );
    expect(await screen.findByText('needs setup')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ',', ctrlKey: true });
    expect(screen.getByRole('dialog')).toHaveTextContent('AI Settings');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    act(() =>
      listener({
        ...empty,
        isConfigured: true,
        activeProviderId: 'deepseek',
        activeModelId: 'deepseek-chat',
      }),
    );
    expect(screen.getByText('configured')).toBeInTheDocument();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
