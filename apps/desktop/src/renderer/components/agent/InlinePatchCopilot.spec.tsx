import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InlinePatchCopilot } from './InlinePatchCopilot';
import type { AgentSessionController } from '../../state/useAgentSession';
import type { PatchReviewController } from '../../state/usePatchReview';

const agent = (
  overrides: Partial<AgentSessionController['state']> = {},
): AgentSessionController => ({
  state: {
    running: false,
    transcript: '',
    activities: [],
    error: null,
    activeToolName: null,
    ...overrides,
  },
  submit: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  dismissError: vi.fn(),
});

const patchReview = (): PatchReviewController => ({
  review: {
    rationale: '新增审计员参与方',
    commands: ['create-entity'],
    addedIds: ['party.auditor'],
    removedIds: [],
    modifiedIds: [],
    overlay: { marks: new Map() },
    revertable: true,
  },
  accept: vi.fn(),
  revert: vi.fn(),
  record: vi.fn(),
});

const setup = (
  overrides: {
    focus?: { nodeId: string; label: string; kind: string } | null;
    controller?: AgentSessionController;
    patchReview?: PatchReviewController | null;
  } = {},
) => {
  const onClose = vi.fn();
  const onOpenFullInterview = vi.fn();
  const onFocusEntity = vi.fn();

  render(
    <InlinePatchCopilot
      focus={
        overrides.focus === undefined
          ? {
              nodeId: 'evidence.contract',
              label: '采购协议（Procurement Contract）',
              kind: 'evidence',
            }
          : overrides.focus
      }
      controller={overrides.controller ?? agent()}
      patchReview={
        overrides.patchReview === undefined ? null : overrides.patchReview
      }
      onFocusEntity={onFocusEntity}
      onClose={onClose}
      onOpenFullInterview={onOpenFullInterview}
    />,
  );

  return { onClose, onOpenFullInterview, onFocusEntity };
};

describe('InlinePatchCopilot', () => {
  it('names the object the question is about', () => {
    setup();

    expect(screen.getByLabelText('行内 AI 协同')).toBeVisible();
    expect(screen.getByTestId('inline-copilot-focus')).toHaveTextContent(
      '采购协议（Procurement Contract）',
    );
  });

  it('carries the selection into the prompt', async () => {
    const controller = agent();
    setup({ controller });

    fireEvent.change(screen.getByLabelText('行内协同内容'), {
      target: { value: '补一个履约确认动作' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(controller.submit).toHaveBeenCalledWith(
        '关于 采购协议（Procurement Contract）（evidence）：补一个履约确认动作',
      ),
    );
  });

  it('offers starter prompts while the modeler has a selection', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: '把金额改成严格派生' }));

    expect(screen.getByLabelText('行内协同内容')).toHaveValue(
      '把金额改成严格派生',
    );
  });

  it('asks for a selection instead of prompting about nothing', () => {
    setup({ focus: null });

    expect(
      screen.getByText('先在画布上选一个业务对象，问题会带着它的上下文进入模型。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
  });

  it('settles the patch where it was proposed', () => {
    const review = patchReview();
    setup({ patchReview: review });

    expect(screen.getByLabelText('AI 补丁复核')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保留' }));

    expect(review.accept).toHaveBeenCalled();
  });

  it('closes on Escape while no patch is waiting', () => {
    const { onClose } = setup();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('hands the long conversation to the rail when asked', () => {
    const { onOpenFullInterview } = setup();

    fireEvent.click(screen.getByRole('button', { name: '打开完整访谈' }));

    expect(onOpenFullInterview).toHaveBeenCalled();
  });
});
