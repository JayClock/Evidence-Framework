import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createModelSession,
  UpdateEntityCommand,
} from '@evidence-poc/evidence-model-core/browser';
import type {
  LiveDeliveryInput,
  LiveDeliveryResult,
} from '../../shared/delivery';
import { installDesktopApi } from '../test-support/desktopApi';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { liveDeliveryPreview } from '../test-support/liveDelivery';
import { useDeliveryHub } from './useDeliveryHub';

const setup = () => {
  vi.useFakeTimers();
  const api = installDesktopApi();
  const base = createDesktopFixture();
  const session = createModelSession({ document: base });
  const request = vi.fn(
    async (input: LiveDeliveryInput): Promise<LiveDeliveryResult> => ({
      success: true,
      analysis: liveDeliveryPreview(input.revision),
    }),
  );
  api.projects.deliveryLivePreview = request;
  const hook = renderHook(() => useDeliveryHub('/models/test', session, base));
  const edit = (label: string) =>
    session.dispatch(new UpdateEntityCommand('evidence.contract', { label }));
  return { api, base, session, request, hook, edit };
};
const tick = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150);
  });
};
afterEach(() => vi.useRealTimers());

describe('live delivery subscription', () => {
  it('debounces document changes, ignores selection and retains the opening baseline on undo/redo', async () => {
    const { session, base, request, edit, hook } = setup();
    act(() => {
      edit('changed');
      edit('changed twice');
    });
    expect(request).not.toHaveBeenCalled();
    await tick();
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0].baseDocument).toBe(base);
    act(() => session.select('evidence.contract'));
    await tick();
    expect(request).toHaveBeenCalledOnce();
    act(() => session.undo());
    await tick();
    act(() => session.redo());
    await tick();
    expect(request).toHaveBeenCalledTimes(3);
    expect(hook.result.current.stale).toBe(false);
  });

  it('drops older replies even when they finish during the next debounce interval', async () => {
    const { request, edit, hook } = setup();
    const resolvers: ((result: LiveDeliveryResult) => void)[] = [];
    request.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    await tick();
    act(() => edit('new revision'));
    await act(async () => {
      resolvers[0]!({ success: true, analysis: liveDeliveryPreview(1) });
    });
    expect(hook.result.current.analysis).toBeNull();
    expect(hook.result.current.stale).toBe(true);
    await tick();
    const revision = request.mock.calls[1]![0].revision;
    await act(async () => {
      resolvers[1]!({ success: true, analysis: liveDeliveryPreview(revision) });
    });
    expect(hook.result.current.analysis?.revision).toBe(revision);
  });

  it('exports the accepted memory snapshot and refuses an invalidated preview', async () => {
    const { api, hook, session, edit } = setup();
    const exportDraft = vi.fn(async () => ({ status: 'cancelled' as const }));
    api.projects.exportLiveDelivery = exportDraft;
    await tick();
    await act(async () => hook.result.current.exportDelivery());
    expect(exportDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        document: session.getDocument(),
        expectedModelDigest: 'sha256:current',
      }),
    );
    act(() => edit('dirty'));
    await act(async () => hook.result.current.exportDelivery());
    expect(exportDraft).toHaveBeenCalledOnce();
  });

  it('clears the preview on failures and cancels timers at unmount', async () => {
    const { request, hook } = setup();
    request.mockRejectedValue(new Error('projection failed'));
    await tick();
    expect(hook.result.current.analysis).toBeNull();
    expect(hook.result.current.error).toBe('projection failed');
    hook.unmount();
    await tick();
    expect(request).toHaveBeenCalledOnce();
    const another = setup();
    another.hook.unmount();
    await tick();
    expect(another.request).not.toHaveBeenCalled();
  });
});
