import { createElement } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { compiledDocument } from '@evidence-poc/evidence-model-core';
import {
  projectWorkbenchData,
  workbenchLayoutOf,
  type CompiledModel,
} from '@evidence-poc/evidence-visualization';
import { EditorScreen } from '../src/renderer/screens/EditorScreen';
import {
  installDesktopApi,
  projectSummary,
} from '../src/renderer/test-support/desktopApi';
import { createDesktopFixture } from '../src/renderer/test-support/modelFixture';

describe('phase 4 review-authoring loop', () => {
  it('opens with Alt+R, prepares a repair prompt, applies a reviewable patch, and exports only saved snapshots', async () => {
    const model = createDesktopFixture();
    const api = installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary({ name: 'Phase 4' }),
        document: model,
        issues: [],
      },
    });
    api.projects.previewReview = vi.fn<typeof api.projects.previewReview>(
      async (input) => ({
        success: true,
        revision: input.revision,
        data: projectWorkbenchData({
          model: compiledDocument(input.document) as unknown as CompiledModel,
          layout: workbenchLayoutOf(input.document),
          check: {},
        }),
        html: '<h1>审查快照</h1>',
        notice: '编辑快照',
        issues: [
          {
            issueId: 'review-1',
            severity: 'warn',
            source: 'check_fm',
            code: 'FM_SCOPE_GAP',
            message: '请确认交付请求的业务责任',
            targetNodeId: 'evidence.request',
          },
        ],
      }),
    );
    render(createElement(EditorScreen, { rootPath: '/models/procurement' }));
    await screen.findByText('Phase 4');
    fireEvent.change(screen.getByLabelText('访谈内容'), {
      target: { value: '保留我的草稿' },
    });
    fireEvent.keyDown(window, { altKey: true, code: 'KeyR', key: '®' });
    const dialog = await screen.findByRole('dialog', { name: '审查中心' });
    fireEvent.click(
      await within(dialog).findByRole('button', { name: '交由 Agent 修复' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      (screen.getByLabelText('访谈内容') as HTMLTextAreaElement).value,
    ).toContain('保留我的草稿');
    expect(
      (screen.getByLabelText('访谈内容') as HTMLTextAreaElement).value,
    ).toContain('请确认交付请求的业务责任');
    expect(api.calls.prompt).toHaveLength(0);
    fireEvent.keyDown(screen.getByLabelText('访谈内容'), {
      key: 'Enter',
      ctrlKey: true,
    });
    await waitFor(() => expect(api.calls.prompt).toHaveLength(1));
    act(() =>
      api.agentMock.requestPatch({
        requestId: 'phase4-patch',
        patch: {
          rationale: '补充审计员',
          commands: [
            {
              type: 'create-entity',
              entity: {
                type: 'entity',
                id: 'party.auditor',
                category: 'participant',
                kind: 'party',
                label: '审计员',
              },
            },
          ],
        },
      }),
    );
    expect(await screen.findByLabelText('AI 补丁复核')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出差异审查' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '保留' }));
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '导出差异审查' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '导出差异审查' }));
    await waitFor(() =>
      expect(api.calls.exportDiffReview).toEqual(['/models/procurement']),
    );
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByRole('button', { name: '导出差异审查' })).toBeDisabled();
  });
});
