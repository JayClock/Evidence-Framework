import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentCopilot } from './AgentCopilot';
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
  submit: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  dismissError: vi.fn(),
});

const patchReview = (
  overrides: Partial<PatchReviewController> = {},
): PatchReviewController => ({
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
  ...overrides,
});

const type = (value: string): HTMLTextAreaElement => {
  const input = screen.getByLabelText('访谈内容') as HTMLTextAreaElement;

  fireEvent.change(input, { target: { value } });

  return input;
};

describe('AgentCopilot composer', () => {
  it('sends the trimmed text and clears the composer', () => {
    const agent = controller();

    render(<AgentCopilot controller={agent} />);

    const input = type('  澄清退货履约  ');

    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    expect(agent.submit).toHaveBeenCalledWith('澄清退货履约');
    expect(input.value).toBe('');
  });

  it('submits with Cmd+Enter and leaves plain Enter alone', () => {
    const agent = controller();

    render(<AgentCopilot controller={agent} />);

    const input = type('第一行\n第二行');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(agent.submit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    expect(agent.submit).toHaveBeenCalledWith('第一行\n第二行');
  });

  it('submits with Ctrl+Enter on non-mac platforms', () => {
    const agent = controller();

    render(<AgentCopilot controller={agent} />);

    fireEvent.keyDown(type('澄清付款期限'), { key: 'Enter', ctrlKey: true });

    expect(agent.submit).toHaveBeenCalledWith('澄清付款期限');
  });

  it('never sends an empty prompt', () => {
    const agent = controller();

    render(<AgentCopilot controller={agent} />);

    type('   ');
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    expect(agent.submit).not.toHaveBeenCalled();
  });

  it('shows the running tool and steers instead of starting a run', () => {
    const agent = controller({ running: true, activeToolName: 'run_sensors' });

    render(<AgentCopilot controller={agent} />);

    expect(screen.getByTestId('agent-copilot-status')).toHaveTextContent(
      '正在执行 run_sensors',
    );

    type('运费由买方承担');
    fireEvent.click(screen.getByRole('button', { name: /插话/ }));
    fireEvent.click(screen.getByRole('button', { name: '停止' }));

    expect(agent.submit).toHaveBeenCalledWith('运费由买方承担');
    expect(agent.stop).toHaveBeenCalledTimes(1);
  });

  it('explains the idle shortcut instead of claiming work is happening', () => {
    render(<AgentCopilot controller={controller()} />);

    expect(screen.queryByTestId('agent-copilot-status')).toBeNull();
    expect(
      screen.getByText('⌘/Ctrl + Enter 发送 · 运行中发送即插话'),
    ).toBeInTheDocument();
  });

  it('stops the live run on Escape without sending a steering message', () => {
    const agent = controller({ running: true });

    render(<AgentCopilot controller={agent} />);

    fireEvent.keyDown(type('先别管运费'), { key: 'Escape' });

    expect(agent.stop).toHaveBeenCalledTimes(1);
    expect(agent.submit).not.toHaveBeenCalled();
  });

  it('moves the caret into the composer when the focus token changes', () => {
    const agent = controller();
    const { rerender } = render(
      <AgentCopilot controller={agent} focusToken={1} />,
    );
    const composer = screen.getByLabelText('访谈内容');

    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).not.toBe(composer);

    rerender(<AgentCopilot controller={agent} focusToken={2} />);

    expect(document.activeElement).toBe(composer);
  });

  it('writes a prefill into the composer and reports it once consumed', () => {
    const agent = controller();
    const onPrefillConsumed = vi.fn();

    render(
      <AgentCopilot
        controller={agent}
        prefill={{ token: 1, text: '请分析这条审查发现' }}
        onPrefillConsumed={onPrefillConsumed}
      />,
    );

    expect(screen.getByLabelText('访谈内容')).toHaveValue('请分析这条审查发现');
    expect(onPrefillConsumed).toHaveBeenCalledTimes(1);
  });

  it('appends a prefill to an unfinished draft instead of replacing it', () => {
    const agent = controller();
    const { rerender } = render(<AgentCopilot controller={agent} />);

    type('我先写了一半');
    rerender(
      <AgentCopilot
        controller={agent}
        prefill={{ token: 1, text: '请分析这条审查发现' }}
      />,
    );

    expect(screen.getByLabelText('访谈内容')).toHaveValue(
      '我先写了一半\n\n请分析这条审查发现',
    );
  });
});

describe('AgentCopilot focus and workshop moves', () => {
  it('names the object the next question is about and can drop the focus', () => {
    const onClearFocus = vi.fn();

    render(
      <AgentCopilot
        controller={controller()}
        focus={{
          nodeId: 'request.payment',
          label: '支付申请',
          kind: 'evidence',
        }}
        onClearFocus={onClearFocus}
      />,
    );

    expect(screen.getByTestId('agent-copilot-focus')).toHaveTextContent(
      '焦点：支付申请（evidence）',
    );

    fireEvent.click(screen.getByRole('button', { name: '清除焦点' }));

    expect(onClearFocus).toHaveBeenCalledTimes(1);
  });

  it('shows no focus pill when nothing is selected', () => {
    render(<AgentCopilot controller={controller()} />);

    expect(screen.queryByTestId('agent-copilot-focus')).toBeNull();
  });

  it('sends the step the modeler picked with the message', () => {
    const agent = controller();

    render(<AgentCopilot controller={agent} />);

    fireEvent.click(
      screen.getByRole('button', { name: '3. 补上标的物与领域组件' }),
    );
    type('会员等级怎么算出来的？');
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    expect(agent.submit).toHaveBeenCalledWith(
      '【第 3 步 · 补上标的物与领域组件】\n会员等级怎么算出来的？',
    );
  });

  it('keeps the step for the next turn and can clear it again', () => {
    const agent = controller();

    render(<AgentCopilot controller={agent} />);

    const chip = screen.getByRole('button', { name: '2. 成对挖掘履约项' });

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    type('发货确认呢？');
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));
    expect(agent.submit).toHaveBeenLastCalledWith(
      '【第 2 步 · 成对挖掘履约项】\n发货确认呢？',
    );

    fireEvent.click(screen.getByRole('button', { name: '清除当前步骤' }));
    type('那违约呢？');
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    expect(agent.submit).toHaveBeenLastCalledWith('那违约呢？');
  });

  it('sends plain text when no step is chosen', () => {
    const agent = controller();

    render(<AgentCopilot controller={agent} />);

    type('先把故事讲一遍');
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    expect(agent.submit).toHaveBeenCalledWith('先把故事讲一遍');
  });

  it('lets the modeler say the business has no agreement to read', () => {
    const agent = controller();

    render(<AgentCopilot controller={agent} />);

    fireEvent.click(screen.getByRole('button', { name: '🔄 无合同逆推' }));
    type('我们只有回执和退款的微信聊天记录');
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    expect(agent.submit).toHaveBeenCalledWith(
      '【无合同逆推 · 从凭证与追责推导合约】\n我们只有回执和退款的微信聊天记录',
    );
  });
});

describe('AgentCopilot stream', () => {
  it('starts with an invitation instead of an empty column', () => {
    render(<AgentCopilot controller={controller()} />);

    expect(
      screen.getByText('从画布选一个业务对象，或直接描述经营事实。'),
    ).toBeInTheDocument();
  });

  it('folds reasoning and shows the answer without it', () => {
    render(
      <AgentCopilot
        controller={controller({
          transcript:
            '<thought>请求是时段，确认是时刻。</thought>退款需要补一个确认端。',
        })}
      />,
    );

    expect(screen.getByText('退款需要补一个确认端。')).toBeInTheDocument();
    expect(screen.queryByText('请求是时段，确认是时刻。')).toBeNull();
    expect(screen.getByText('推理过程')).toBeInTheDocument();
  });

  it('lists each tool call with its verdict', () => {
    render(
      <AgentCopilot
        controller={controller({
          activities: [
            {
              id: 'call-1',
              toolName: 'run_sensors',
              status: 'completed',
              input: {},
            },
            {
              id: 'call-2',
              toolName: 'apply_model_patch',
              status: 'failed',
              input: {},
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('运行检查器')).toBeInTheDocument();
    expect(screen.getByText('提交模型补丁')).toBeInTheDocument();
    expect(screen.getByText('已完成')).toBeInTheDocument();
    expect(screen.getByText('失败')).toBeInTheDocument();
  });

  it('shows a dismissible error without hiding the conversation', () => {
    const agent = controller({
      transcript: '退货履约同样需要确认端。',
      error: '缺少模型凭据',
    });

    render(<AgentCopilot controller={agent} />);

    expect(screen.getByText('退货履约同样需要确认端。')).toBeInTheDocument();
    expect(screen.getByText('缺少模型凭据')).toBeInTheDocument();

    fireEvent.click(screen.getByText('知道了'));
    expect(agent.dismissError).toHaveBeenCalledTimes(1);
  });

  it('reviews a pending patch where it was proposed', () => {
    const review = patchReview();
    const onFocusEntity = vi.fn();

    render(
      <AgentCopilot
        controller={controller()}
        patchReview={review}
        onFocusEntity={onFocusEntity}
      />,
    );

    expect(screen.getByLabelText('AI 补丁复核')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '定位补丁对象 request.refund' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '保留' }));

    expect(onFocusEntity).toHaveBeenCalledWith('request.refund');
    expect(review.accept).toHaveBeenCalledTimes(1);
  });
});
