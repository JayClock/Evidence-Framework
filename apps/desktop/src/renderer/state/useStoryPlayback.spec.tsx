import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import type {
  StoryInvalidatedEvent,
  StoryProjectInput,
  StoryProjectResult,
} from '@evidence-poc/desktop-contracts/story';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { WhatIfResult } from '@evidence-poc/evidence-agent';
import { installDesktopApi } from '../test-support/desktopApi';
import { storyFlow, storyResult } from '../test-support/story';
import {
  STORY_REFRESH_DELAY,
  STORY_STEP_DURATION,
  useStoryPlayback,
} from './useStoryPlayback';

const setup = (enabled = true) => {
  vi.useFakeTimers();
  const api = installDesktopApi();
  const flow = storyFlow();
  const project = vi.fn(async (_input: StoryProjectInput) => storyResult(flow));
  const listFlows = vi.fn(async () => [flow]);
  const listeners = new Set<(event: StoryInvalidatedEvent) => void>();
  api.story = {
    listFlows,
    project,
    whatIf: vi.fn(),
    onInvalidated: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const onInvalidated = vi.fn(async () => undefined);
  const hook = renderHook(
    (props: {
      document: DomainModelDocument;
      enabled: boolean;
      refreshSavedSources?: boolean;
    }) =>
      useStoryPlayback({ rootPath: '/models/test', onInvalidated, ...props }),
    {
      initialProps: { document: createDesktopFixture(), enabled } as {
        document: DomainModelDocument;
        enabled: boolean;
        refreshSavedSources?: boolean;
      },
    },
  );
  return {
    api,
    flow,
    project,
    listFlows,
    hook,
    onInvalidated,
    listeners,
    invalidate: (rootPath = '/models/test') =>
      act(() => {
        listeners.forEach((listener) => listener({ rootPath }));
      }),
  };
};
const tick = async (ms = STORY_REFRESH_DELAY) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
afterEach(() => vi.useRealTimers());

describe('story playback', () => {
  it('does no work outside walkthrough mode, debounces snapshots and guards step boundaries', async () => {
    const { hook, listFlows, project } = setup(false);
    await tick();
    expect(listFlows).not.toHaveBeenCalled();
    hook.rerender({ document: createDesktopFixture(), enabled: true });
    hook.rerender({ document: createDesktopFixture(), enabled: true });
    await tick();
    expect(project).toHaveBeenCalledOnce();
    expect(hook.result.current.currentStepSequence).toBe(1);
    expect(hook.result.current.canPrevious).toBe(false);
    act(() => hook.result.current.previous());
    act(() => hook.result.current.next());
    expect(hook.result.current.currentStepSequence).toBe(2);
    act(() => hook.result.current.next());
    act(() => hook.result.current.next());
    expect(hook.result.current.currentStepSequence).toBe(3);
    expect(hook.result.current.canNext).toBe(false);
  });

  it('resolves canonical and alias-based document dependencies for canvas focus', async () => {
    const { hook, flow, project } = setup();
    const steps = flow.steps.map((step, index) => ({
      ...step,
      actingRoleRef: 'role.buyer',
      values:
        index === 1
          ? {
              ...step.values,
              id: 'request-alias',
              ref: 'evidence.contract#example-0',
            }
          : step.values,
      basedOn:
        index === 2
          ? ['request-alias', 'evidence.contract#example-0']
          : step.basedOn,
    }));
    project.mockResolvedValue(storyResult({ ...flow, steps }));
    await tick();
    act(() => hook.result.current.next());
    act(() => hook.result.current.next());
    expect(hook.result.current.canvasFocus).toMatchObject({
      activeEntityId: 'evidence.confirmation',
      dependencyEntityIds: ['evidence.request', 'evidence.contract'],
      relatedEntityIds: ['role.buyer'],
    });
  });

  it('automatically advances, stops at the end and cleans up timers on exit', async () => {
    const { hook } = setup();
    await tick();
    act(() => hook.result.current.togglePlaying());
    await tick(STORY_STEP_DURATION);
    expect(hook.result.current.currentStepSequence).toBe(2);
    await tick(STORY_STEP_DURATION);
    expect(hook.result.current.currentStepSequence).toBe(3);
    expect(hook.result.current.isPlaying).toBe(false);
    act(() => hook.result.current.togglePlaying());
    expect(hook.result.current.currentStepSequence).toBe(1);
    hook.rerender({ document: createDesktopFixture(), enabled: false });
    await tick(STORY_STEP_DURATION * 3);
    expect(hook.result.current.currentStepSequence).toBe(1);
    expect(hook.result.current.isPlaying).toBe(false);
  });

  it('refreshes a notice received before entering playback and retries failed source reads', async () => {
    const { hook, onInvalidated, project } = setup(false);
    onInvalidated.mockRejectedValueOnce(new Error('磁盘模型暂不可读'));
    hook.rerender({
      document: createDesktopFixture(),
      enabled: true,
      refreshSavedSources: true,
    });
    await tick();
    expect(hook.result.current.error).toBe('磁盘模型暂不可读');
    expect(hook.result.current.loading).toBe(false);
    expect(project).not.toHaveBeenCalled();
    act(() => hook.result.current.retry());
    await tick();
    await tick();
    expect(onInvalidated).toHaveBeenCalledTimes(2);
    expect(project).toHaveBeenCalledOnce();
    expect(hook.result.current.ready).toBe(true);
  });

  it('coalesces scoped invalidations, preserves the current example and unsubscribes', async () => {
    const { hook, project, flow, invalidate, onInvalidated, listeners } =
      setup();
    await tick();
    act(() => hook.result.current.next());
    invalidate('/other');
    await tick();
    expect(project).toHaveBeenCalledOnce();
    invalidate();
    invalidate();
    invalidate();
    expect(hook.result.current.ready).toBe(false);
    await tick();
    expect(onInvalidated).toHaveBeenCalledOnce();
    // Insert a preceding step: sequence is presentation, example identity persists.
    project.mockResolvedValue(
      storyResult({
        ...flow,
        steps: [flow.steps[0]!, ...flow.steps].map((step, index) => ({
          ...step,
          sequence: index + 1,
        })),
      }),
    );
    await tick();
    expect(project).toHaveBeenCalledTimes(2);
    expect(hook.result.current.step?.entityId).toBe('evidence.request');
    expect(hook.result.current.currentStepSequence).toBe(3);
    hook.unmount();
    expect(listeners.size).toBe(0);
  });

  it('ignores an obsolete projection even during the next debounce interval', async () => {
    const { hook, project } = setup();
    const resolve: ((value: StoryProjectResult) => void)[] = [];
    project.mockImplementation(() => new Promise((done) => resolve.push(done)));
    await tick();
    hook.rerender({ document: createDesktopFixture(), enabled: true });
    await act(async () => resolve[0]!(storyResult(storyFlow('旧版本'))));
    expect(hook.result.current.projection).toBeUndefined();
    await tick();
    await act(async () => resolve[1]!(storyResult(storyFlow('新版本'))));
    expect(hook.result.current.projection?.storyTitle).toBe('新版本');
  });

  it('recovers from generation failures in explicit facts-only mode and handles an empty model', async () => {
    const { hook, project, listFlows } = setup();
    project.mockRejectedValueOnce(new Error('无 AI 配置'));
    await tick();
    expect(hook.result.current.error).toBe('无 AI 配置');
    act(() => hook.result.current.setSkipAi(true));
    await tick();
    expect(hook.result.current.ready).toBe(true);
    expect(project).toHaveBeenLastCalledWith(
      expect.objectContaining({ skipAi: true }),
    );
    listFlows.mockResolvedValueOnce([]);
    act(() => hook.result.current.retry());
    await tick();
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.step).toBeUndefined();
  });

  it('resets a disappeared flow and rejects stale sandbox answers after navigation', async () => {
    const { hook, api, flow, listFlows, project } = setup();
    await tick();
    let answer: (result: WhatIfResult) => void = () => undefined;
    api.story.whatIf = vi.fn(
      () =>
        new Promise<WhatIfResult>((resolve) => {
          answer = resolve;
        }),
    );
    act(() => {
      void hook.result.current.askWhatIf('如果只付300？');
    });
    expect(hook.result.current.sandbox?.loading).toBe(true);
    act(() => hook.result.current.next());
    await act(async () =>
      answer({ businessImpactExplanation: '旧答案' } as WhatIfResult),
    );
    expect(hook.result.current.sandbox).toBeUndefined();
    expect(api.story.whatIf).toHaveBeenCalledWith(
      expect.objectContaining({
        stepHash: 'step-0',
        document: expect.any(Object),
      }),
    );
    const fallback = { ...flow, flowId: '新业务流', flowTitle: '新业务流' };
    listFlows.mockResolvedValue([fallback]);
    project.mockResolvedValue(storyResult(fallback));
    act(() => hook.result.current.retry());
    await tick();
    expect(hook.result.current.activeFlowId).toBe('新业务流');
    expect(hook.result.current.currentStepSequence).toBe(1);
  });
});
