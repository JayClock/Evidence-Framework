import { act, renderHook, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { collectFlowScenarios } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import { storyResult } from '@evidence-poc/desktop-testing/story';
// Golden example data, not a cross-project source-code dependency.
// eslint-disable-next-line @nx/enforce-module-boundaries
import modelText from '../../../../../examples/full-spectrum-procurement/model/full-spectrum-procurement.evidence.json?raw';
import { StoryPlayerBar } from '../components/story/StoryPlayerBar';
import { STORY_REFRESH_DELAY, useStoryPlayback } from './useStoryPlayback';

afterEach(() => vi.useRealTimers());

it('walks across responsibility lanes, resets branch focus when switching scenarios and never saves', async () => {
  vi.useFakeTimers();
  const document = JSON.parse(modelText) as DomainModelDocument;
  const before = JSON.stringify(document);
  const flows = collectFlowScenarios(document);
  const api = installDesktopApi();
  api.story.listFlows = vi.fn(async () => flows);
  api.story.project = vi.fn(async ({ flowId }) =>
    storyResult(flows.find((f) => f.flowId === flowId)!),
  );
  const hook = renderHook(() =>
    useStoryPlayback({
      api: api.story,
      document,
      enabled: true,
      rootPath: '/test',
      aiConfigured: false,
    }),
  );
  const load = async () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(STORY_REFRESH_DELAY);
    });
  await load();
  const advanceTo = (id: string) => {
    for (let i = 0; i < 30 && hook.result.current.step?.entityId !== id; i++)
      act(() => hook.result.current.next());
    expect(hook.result.current.step?.entityId).toBe(id);
  };
  act(() => hook.result.current.selectFlow('late-delivery'));
  expect(hook.result.current.canvasFocus).toBeNull();
  await load();
  advanceTo('conf-equipment-delivery');
  expect(hook.result.current.canvasFocus?.flowKind).toBe('breach_compensation');
  expect(hook.result.current.canvasFocus?.triggeredRuleIds).toContain(
    'rule-breach-detection-overdue',
  );
  const bar = render(<StoryPlayerBar playback={hook.result.current} />);
  expect(screen.getByLabelText('当前旅程分支')).toHaveTextContent('违约补偿');
  expect(screen.getByText(/发货交期逾期自动判定/)).toBeInTheDocument();
  act(() => hook.result.current.selectFlow('defect-escalation'));
  expect(hook.result.current.canvasFocus).toBeNull();
  await load();
  advanceTo('req-escrow-freeze');
  expect(hook.result.current.canvasFocus?.relatedEntityIds).toContain(
    'role-collateral-voucher',
  );
  expect(hook.result.current.canvasFocus?.flowKind).toBe('escalation');
  expect(hook.result.current.canvasFocus?.activeValues).toHaveProperty(
    'expired_at',
  );
  act(() => hook.result.current.selectFlow('happy-path'));
  await load();
  advanceTo('conf-escrow-release');
  bar.rerender(<StoryPlayerBar playback={hook.result.current} />);
  expect(screen.getByLabelText('当前旅程分支')).toHaveTextContent('正常履约');
  expect(hook.result.current.canvasFocus?.triggeredRuleIds).toEqual([]);
  expect(JSON.stringify(document)).toBe(before);
  expect(api.calls.save).toEqual([]);
});
