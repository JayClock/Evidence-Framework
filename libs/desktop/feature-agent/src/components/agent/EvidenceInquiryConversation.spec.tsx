import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EvidenceInquiryConversation } from './EvidenceInquiryConversation';
import type { AgentSessionController } from '../../state/useAgentSession';
import type { PatchReviewController } from '../../state/usePatchReview';

const controller = (
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
  submit: vi.fn(async () => ({ success: true })),
  stop: vi.fn(async () => undefined),
  dismissError: vi.fn(),
  reset: vi.fn(),
});

const setup = (
  overrides: Partial<
    React.ComponentProps<typeof EvidenceInquiryConversation>
  > = {},
) => {
  const agent = controller();
  const props = {
    nodeId: 'evidence.payment',
    controller: agent,
    patchReview: {
      review: null,
      accept: vi.fn(),
      revert: vi.fn(),
      record: vi.fn(),
    } as PatchReviewController,
    onFocusEntity: vi.fn(),
    ...overrides,
  };
  render(<EvidenceInquiryConversation {...props} />);
  return props;
};

const type = (value: string) => {
  const input = screen.getByLabelText('访谈内容');
  fireEvent.change(input, { target: { value } });
  return input;
};

describe('EvidenceInquiryConversation', () => {
  it('offers settings instead of sharing the last transcript when unconfigured', () => {
    const configure = vi.fn();
    const { controller: agent } = setup({
      aiConfigured: false,
      onConfigureAi: configure,
      controller: controller({ transcript: '上一轮回复' }),
    });
    expect(screen.getByLabelText('访谈内容')).toBeDisabled();
    expect(screen.queryByText('上一轮回复')).toBeNull();
    expect(screen.getByRole('button', { name: /发送/ })).toBeDisabled();
    expect(agent.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '立刻配置 API Key' }));
    expect(configure).toHaveBeenCalledOnce();
  });

  it('pins a trimmed reply to the card, not to the current canvas selection', async () => {
    const { controller: agent } = setup();
    const input = type('  实付金额来自付款申请  ');
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    expect(agent.submit).toHaveBeenCalledExactlyOnceWith(
      '实付金额来自付款申请',
      { nodeId: 'evidence.payment' },
    );
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('leaves Enter to IME and Shift+Enter to the editor before submitting', async () => {
    const { controller: agent } = setup();
    const input = type('第一行\n第二行');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(agent.submit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(agent.submit).toHaveBeenCalledOnce();
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('shows the running tool and offers stop without steering', () => {
    const { controller: agent } = setup({
      controller: controller({ running: true, activeToolName: 'run_sensors' }),
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      '正在执行 run_sensors',
    );
    expect(screen.getByRole('button', { name: /发送/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '停止' }));
    expect(agent.submit).not.toHaveBeenCalled();
    expect(agent.stop).toHaveBeenCalledOnce();
  });

  it('folds reasoning, lists tool calls and preserves the answer when reporting an error', () => {
    const { controller: agent } = setup({
      controller: controller({
        transcript:
          '<thought>请求是时段，确认是时刻。</thought>退款需要补一个确认端。',
        activities: [
          {
            id: 'call-1',
            toolName: 'run_sensors',
            status: 'completed',
            input: {},
          },
        ],
        error: '缺少模型凭据',
      }),
    });
    expect(screen.getByLabelText('AI 回复')).toHaveTextContent(
      '退款需要补一个确认端。',
    );
    expect(screen.getByText('推理过程')).toBeInTheDocument();
    expect(screen.queryByText('请求是时段，确认是时刻。')).toBeNull();
    expect(screen.getByText('运行检查器')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('缺少模型凭据');
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(agent.dismissError).toHaveBeenCalledOnce();
  });

  it('reviews the patch in place before accepting another reply', () => {
    const { patchReview, onFocusEntity } = setup({
      patchReview: {
        review: {
          rationale: '补齐退款履约现场',
          commands: ['create-fulfillment-pair'],
          addedIds: ['request.refund'],
          removedIds: [],
          modifiedIds: [],
          overlay: { marks: new Map() },
          revertable: true,
        },
        accept: vi.fn(),
        revert: vi.fn(),
        record: vi.fn(),
      },
    });
    type('下一项');
    expect(screen.getByRole('button', { name: /发送/ })).toBeDisabled();
    expect(screen.getByLabelText('AI 补丁复核')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '定位补丁对象 request.refund' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    expect(onFocusEntity).toHaveBeenCalledWith('request.refund');
    expect(patchReview.accept).toHaveBeenCalledOnce();
  });
});
