import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { installDesktopApi } from '../../test-support/desktopApi';
import { storyFlow, storyResult } from '../../test-support/story';
import {
  STORY_REFRESH_DELAY,
  useStoryPlayback,
} from '../../state/useStoryPlayback';
import { StoryPlayerBar } from './StoryPlayerBar';

const setup = async () => {
  vi.useFakeTimers();
  const api = installDesktopApi();
  const flows = [storyFlow(), storyFlow('定金预售流')];
  api.story.listFlows = vi.fn(async () => flows);
  api.story.project = vi.fn(async ({ flowId }) =>
    storyResult(flows.find((flow) => flow.flowId === flowId)),
  );
  const document = createDesktopFixture();
  const exit = vi.fn();
  const Harness = () => {
    const playback = useStoryPlayback({
      rootPath: '/models/test',
      document,
      enabled: true,
    });
    return (
      <>
        <StoryPlayerBar playback={playback} onExit={exit} />
        <output aria-label="当前步骤序号">
          {playback.currentStepSequence}
        </output>
      </>
    );
  };
  render(<Harness />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY);
  });
  return { api, exit };
};
afterEach(() => vi.useRealTimers());

describe('StoryPlayerBar', () => {
  it('steps through a flow and disables boundary buttons', async () => {
    await setup();
    expect(screen.getByRole('button', { name: /上一步/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByLabelText('当前步骤序号')).toHaveTextContent('2');
    expect(screen.getByText('步骤 2/3：办理交付请求')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByRole('button', { name: /下一步/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /上一步/ }));
    expect(screen.getByLabelText('当前步骤序号')).toHaveTextContent('2');
  });

  it('switches flows, toggles playback/facts mode and exits', async () => {
    const { api, exit } = await setup();
    fireEvent.click(screen.getByRole('button', { name: '自动播放' }));
    expect(screen.getByRole('button', { name: '暂停放映' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.change(screen.getByRole('combobox', { name: '选择业务流' }), {
      target: { value: '定金预售流' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY);
    });
    expect(api.story.project).toHaveBeenLastCalledWith(
      expect.objectContaining({ flowId: '定金预售流' }),
    );
    expect(screen.getByLabelText('当前步骤序号')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('checkbox', { name: '仅模型事实' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY);
    });
    expect(api.story.project).toHaveBeenLastCalledWith(
      expect.objectContaining({ skipAi: true }),
    );
    fireEvent.click(screen.getByRole('button', { name: '退出放映' }));
    expect(exit).toHaveBeenCalledOnce();
  });
});
