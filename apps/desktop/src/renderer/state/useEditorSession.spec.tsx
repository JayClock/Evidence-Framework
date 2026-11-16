import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { updateEntityMutator } from '@evidence-poc/evidence-model-core';
import type { OpenProjectResult } from '@evidence-poc/desktop-contracts/projects';
import { installDesktopApi, projectSummary } from '../test-support/desktopApi';
import { useEditorSession } from './useEditorSession';

vi.mock('./useGraphLayout', () => ({
  useGraphLayout: () => ({
    layout: {},
    layoutPending: false,
    layoutError: null,
  }),
}));

const setup = () => {
  const api = installDesktopApi();
  const document = createDesktopFixture();
  const project = projectSummary();
  const hook = renderHook(() => useEditorSession(project, document));
  const edit = () =>
    act(() => {
      hook.result.current.state.session.mutate(
        (draft) =>
          updateEntityMutator(draft, 'evidence.contract', {
            label: '未保存修改',
          }),
        'update-entity',
      );
    });
  return { api, document, project, hook, edit };
};

describe('safe walkthrough reload', () => {
  it('silently refreshes a clean canvas', async () => {
    const { api, hook, document, project } = setup();
    const updated = {
      ...document,
      manifest: { ...document.manifest, name: '外部修改' },
    };
    api.projects.open = vi.fn(
      async (): Promise<OpenProjectResult> => ({
        success: true,
        project,
        document: updated,
        issues: [],
      }),
    );
    await act(async () => hook.result.current.reloadFromDiskIfClean());
    expect(hook.result.current.state.document.manifest.name).toBe('外部修改');
    expect(hook.result.current.state.dirty).toBe(false);
  });

  it('never reads over an already dirty canvas or overwrites edits arriving during a disk read', async () => {
    const { api, hook, edit, document, project } = setup();
    let resolve: (result: OpenProjectResult) => void = () => undefined;
    const open = vi.fn(
      () =>
        new Promise<OpenProjectResult>((done) => {
          resolve = done;
        }),
    );
    api.projects.open = open;
    let reload: Promise<void>;
    act(() => {
      reload = hook.result.current.reloadFromDiskIfClean();
    });
    edit();
    await act(async () => {
      resolve({ success: true, project, document, issues: [] });
      await reload;
    });
    expect(
      hook.result.current.state.document.entities.find(
        ({ id }) => id === 'evidence.contract',
      )?.label,
    ).toBe('未保存修改');
    expect(hook.result.current.state.dirty).toBe(true);
    await act(async () => hook.result.current.reloadFromDiskIfClean());
    expect(open).toHaveBeenCalledOnce();
  });

  it('preserves undo history for the watcher notification caused by its own save', async () => {
    const { api, hook, edit, project } = setup();
    edit();
    await act(async () => hook.result.current.save());
    const document = structuredClone(hook.result.current.state.document);
    api.projects.open = vi.fn(
      async (): Promise<OpenProjectResult> => ({
        success: true,
        project,
        document,
        issues: [],
      }),
    );
    expect(hook.result.current.state.canUndo).toBe(true);
    await act(async () => hook.result.current.reloadFromDiskIfClean());
    expect(hook.result.current.state.canUndo).toBe(true);
    act(() => {
      hook.result.current.state.session.undo();
    });
    expect(
      hook.result.current.state.document.entities.find(
        ({ id }) => id === 'evidence.contract',
      )?.label,
    ).not.toBe('未保存修改');
  });

  it('keeps edits made while saving dirty', async () => {
    const { api, hook, edit } = setup();
    let resolve: (
      value: Awaited<ReturnType<typeof api.projects.save>>,
    ) => void = () => undefined;
    api.projects.save = () =>
      new Promise((done) => {
        resolve = done;
      });
    let save: Promise<void>;
    act(() => {
      save = hook.result.current.save();
    });
    edit();
    await act(async () => {
      resolve({
        success: true,
        written: [],
        unchanged: [],
        removed: [],
        savedAt: 'now',
      });
      await save;
    });
    expect(hook.result.current.state.dirty).toBe(true);
  });
});
