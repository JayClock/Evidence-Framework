import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DependencyFrontier } from '@evidence-poc/evidence-modeling-orchestrator/browser';

import { AgentPanel } from './AgentPanel';
import type { AgentSessionController } from '../../state/useAgentSession';

const frontier = (
  overrides: Partial<DependencyFrontier> = {},
): DependencyFrontier => ({
  contextRef: 'context.purchase',
  evidenceRef: 'request.payment',
  roleRef: 'role.seller',
  story: '客户先申请付款，银行回单证明付款完成。',
  judgment: '付款以银行回单为证明',
  keyData: ['request.payment#requested_minor_units'],
  openQuestions: [
    {
      traceId: 't1',
      questionId: 'Q1',
      question: '运费由谁提供、怎么算？',
      targetAttribute: 'request.payment#freight',
    },
  ],
  gaps: [],
  closed: false,
  confirmedFacts: [],
  ...overrides,
});

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
  submit: async () => undefined,
  stop: async () => undefined,
  dismissError: () => undefined,
});

const renderPanel = (props: Partial<Parameters<typeof AgentPanel>[0]> = {}) => {
  const onFocusNode = vi.fn();

  render(
    <AgentPanel
      controller={controller()}
      frontier={frontier()}
      frontierLoading={false}
      frontierError={null}
      onRefreshFrontier={() => undefined}
      onFocusNode={onFocusNode}
      {...props}
    />,
  );

  return { onFocusNode };
};

describe('AgentPanel', () => {
  it('shows the story, key data and the open questions', () => {
    renderPanel();

    expect(screen.getByText('付款以银行回单为证明')).toBeInTheDocument();
    expect(
      screen.getByText('客户先申请付款，银行回单证明付款完成。'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('request.payment#requested_minor_units'),
    ).toBeInTheDocument();
    expect(screen.getByText('运费由谁提供、怎么算？')).toBeInTheDocument();
  });

  it('marks a recorded closure instead of claiming completion on its own', () => {
    renderPanel({ frontier: frontier({ closed: true }) });

    expect(screen.getByText('已记录结束确认')).toBeInTheDocument();
  });

  it('shows dangling references as gaps', () => {
    renderPanel({
      frontier: frontier({
        gaps: [
          {
            kind: 'dangling-evidence',
            message: '追溯记录引用了模型中不存在的凭证：evidence.removed',
            ref: 'evidence.removed',
          },
        ],
      }),
    });

    expect(
      screen.getByText('追溯记录引用了模型中不存在的凭证：evidence.removed'),
    ).toBeInTheDocument();
  });

  it('explains an empty interview instead of inventing a frontier', () => {
    renderPanel({ frontier: null });

    expect(
      screen.getByText('尚无访谈记录。在下方输入经营事实开始第一轮。'),
    ).toBeInTheDocument();
  });

  it('renders the tool stream with per-call status', () => {
    renderPanel({
      controller: controller({
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
      }),
    });

    expect(screen.getByText('run_sensors')).toBeInTheDocument();
    expect(screen.getByText('apply_model_patch')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('shows the streamed reply and a dismissible error', () => {
    const dismissError = vi.fn();

    renderPanel({
      controller: {
        ...controller({
          transcript: '退货履约同样需要确认端。',
          error: '缺少模型凭据',
        }),
        dismissError,
      },
    });

    expect(screen.getByText('退货履约同样需要确认端。')).toBeInTheDocument();
    expect(screen.getByText('缺少模型凭据')).toBeInTheDocument();

    fireEvent.click(screen.getByText('知道了'));
    expect(dismissError).toHaveBeenCalledTimes(1);
  });

  it('focuses the trace focus node when asked', () => {
    const { onFocusNode } = renderPanel();

    fireEvent.click(screen.getByText('定位本轮聚焦凭证'));

    expect(onFocusNode).toHaveBeenCalledWith('request.payment');
  });
});
