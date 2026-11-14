import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  createModelSession,
  UpdateEntityCommand,
} from '@evidence-poc/evidence-model-core/browser';
import { installDesktopApi } from '../test-support/desktopApi';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { useLiveModelBridge } from './useLiveModelBridge';

it('publishes each document transition immediately, not selection changes, and keeps the baseline', async () => {
  const api = installDesktopApi();
  const notify = vi.fn(api.agent.notifyModelChanged);
  api.agent.notifyModelChanged = notify;
  const base = createDesktopFixture();
  const session = createModelSession({ document: base });
  const { result, unmount } = renderHook(() =>
    useLiveModelBridge('/model', session, base),
  );
  expect(notify).toHaveBeenCalledOnce();
  act(() => session.select('evidence.contract'));
  expect(notify).toHaveBeenCalledOnce();
  act(() =>
    session.dispatch(
      new UpdateEntityCommand('evidence.contract', { label: 'new' }),
    ),
  );
  // The notification is sent synchronously during dispatch, before an agent patch is acknowledged.
  expect(notify).toHaveBeenCalledTimes(2);
  expect(notify.mock.calls[1]![0]).toMatchObject({
    revision: 2,
    document: session.getDocument(),
    baseDocument: base,
  });
  act(() => session.undo());
  await act(async () => undefined);
  expect(notify.mock.calls[2]![0]).toMatchObject({
    revision: 3,
    document: base,
    baseDocument: base,
  });
  expect(result.current.revision).toBe(3);
  unmount();
  session.redo();
  expect(notify).toHaveBeenCalledTimes(3);
});
