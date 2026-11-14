import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewHubModal } from './ReviewHubModal';
import { installDesktopApi } from '../../test-support/desktopApi';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import type { PreviewReviewResult } from '../../../shared/review';

const input = {
  rootPath: '/model',
  document: createDesktopFixture(),
  revision: 1,
};
const result = (): Extract<PreviewReviewResult, { success: true }> => ({
  success: true,
  revision: 1,
  html: '<h1>只读</h1>',
  notice: '编辑快照预览（未保存）',
  data: {
    title: '模型',
    nodes: [],
    edges: [],
    unresolved: [],
    counts: {
      entities: 1,
      contracts: 1,
      rules: 0,
      scenarios: 0,
      capabilities: 0,
    },
    validation: {
      fm: false,
      consistent: false,
      complete: null,
      scopeRefs: [],
      contextRefs: [],
      gaps: [],
      simulationLimitations: [],
      simulation: null,
      api: null,
      runtime: false,
      unresolvedOrderCount: 0,
    },
    delivery: null,
    layout: {
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      nodes: [],
      edges: [],
      responsibilityLinks: [],
      contextGroups: [],
      fulfillmentGroups: [],
      freeNodeIds: [],
      omittedContextIds: [],
    },
    generatedAt: '',
  },
  issues: [
    {
      issueId: 'a',
      code: 'TEST',
      message: '缺少责任角色',
      severity: 'block',
      source: 'check_fm',
      targetNodeId: 'evidence.a',
    },
  ],
});

describe('review hub', () => {
  it('reuses sandboxed workbench HTML and offers explicit, revision-bound actions', async () => {
    const api = installDesktopApi();
    api.projects.previewReview = vi.fn(async () => result());
    const locate = vi.fn();
    const prompt = vi.fn();
    const close = vi.fn();
    const props = {
      input,
      onLocate: locate,
      onPrompt: prompt,
      onClose: close,
      canLocate: () => true,
    };
    const { rerender } = render(<ReviewHubModal {...props} />);
    await screen.findByText('缺少责任角色', { exact: false });
    expect(screen.getByTitle('业务对象工作台预览')).toHaveAttribute(
      'sandbox',
      'allow-scripts',
    );
    fireEvent.click(screen.getByRole('button', { name: '交由 Agent 修复' }));
    expect(prompt).toHaveBeenCalledWith(result().issues[0]);
    expect(api.calls.prompt).toHaveLength(0);
    rerender(<ReviewHubModal {...props} input={{ ...input, revision: 2 }} />);
    expect(screen.getByRole('button', { name: '画布定位' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '交由 Agent 修复' }),
    ).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });
  it('shows errors, retries, and leaves unmappable findings unlocated', async () => {
    const api = installDesktopApi();
    api.projects.previewReview = vi
      .fn()
      .mockRejectedValueOnce(new Error('读取失败'))
      .mockResolvedValue(result());
    const locate = vi.fn();
    render(
      <ReviewHubModal
        input={input}
        onLocate={locate}
        onPrompt={vi.fn()}
        onClose={vi.fn()}
        canLocate={() => false}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('读取失败');
    fireEvent.click(screen.getByRole('button', { name: '刷新审查' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '画布定位' })).toBeDisabled(),
    );
    expect(locate).not.toHaveBeenCalled();
  });
});

describe('ReviewHubModal in the console', () => {
  it('docks as a region and still closes on Escape', async () => {
    installDesktopApi();
    const close = vi.fn();
    render(
      <ReviewHubModal
        input={input}
        onLocate={vi.fn()}
        onPrompt={vi.fn()}
        onClose={close}
        canLocate={() => true}
        embedded
      />,
    );

    const region = screen.getByRole('region', { name: '审查中心' });
    expect(region).not.toHaveAttribute('aria-modal');
    fireEvent.keyDown(region, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });
});
