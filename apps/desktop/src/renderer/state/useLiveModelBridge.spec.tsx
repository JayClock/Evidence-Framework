import type { AgentPromptResult } from '@evidence-poc/desktop-contracts/agentIpc';
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  createModelSession,
  updateEntityMutator,
} from '@evidence-poc/evidence-model-core';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
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
    session.mutate(
      (draft) =>
        updateEntityMutator(draft, 'evidence.contract', { label: 'new' }),
      'update-entity',
    ),
  );
  // Human edits are published immediately; selection changes are not.
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

it('replays a missed commit at settlement, deduplicates broadcasts, and interleaves agent and human history', async () => {
  const api = installDesktopApi();
  const base = createDesktopFixture();
  const session = createModelSession({ document: base });
  const review = vi.fn();
  const { result } = renderHook(() =>
    useLiveModelBridge('/model', session, base, review),
  );
  const edit = (name: string) =>
    session.mutate((draft) => {
      draft.manifest.name = name;
    });
  act(() => edit('local'));
  const publish = api.agentMock.emitPatch;
  api.agent.prompt = async (input) => {
    expect(input.revision).toBe(2);
    expect(session.isDocumentLocked()).toBe(true);
    expect(() => edit('racing edit')).toThrow('AI 正在编辑');
    expect(session.undo()).toBe(false);
    api.agentMock.emitPatch = () => undefined;
    const first = api.agentMock.commitPatch({
      rationale: 'first',
      patches: [{ op: 'replace', path: '/manifest/name', value: 'agent 1' }],
    });
    api.agentMock.emitPatch = publish;
    const second = api.agentMock.commitPatch({
      rationale: 'second',
      patches: [{ op: 'replace', path: '/manifest/name', value: 'agent 2' }],
    });
    publish({ ...first, editorId: 'closed editor' });
    expect(session.getDocument().manifest.name).toBe('local');
    return {
      success: false,
      error: 'provider interrupted',
      transactions: [first.transaction, second.transaction],
    } satisfies AgentPromptResult;
  };
  await act(async () => {
    const response = await result.current.prompt({
      rootPath: '/model',
      text: 'change the name',
    });
    expect(response.success).toBe(false);
  });
  expect(review).toHaveBeenCalledTimes(2);
  expect(session.getDocument().manifest.name).toBe('agent 2');
  expect(result.current.revision).toBe(4);
  expect(api.calls.modelChanged).toHaveLength(2);
  act(() => {
    session.undo();
  });
  expect(session.getDocument().manifest.name).toBe('agent 1');
  act(() => {
    session.undo();
  });
  expect(session.getDocument().manifest.name).toBe('local');
  act(() => {
    session.undo();
  });
  expect(session.getDocument()).toEqual(base);
  act(() => {
    session.redo();
    session.redo();
    session.redo();
  });
  expect(session.getDocument().manifest.name).toBe('agent 2');
  expect(api.agentMock.liveModel()?.document).toEqual(session.getDocument());
});
