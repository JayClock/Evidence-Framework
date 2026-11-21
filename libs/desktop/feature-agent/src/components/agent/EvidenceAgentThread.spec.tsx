import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PiConversation } from '../../state/usePiConversation';
import { EvidenceAgentThread } from './EvidenceAgentThread';

const mount = (messages: PiConversation['messages']) => {
  const submit = vi.fn(async () => ({ success: true as const }));
  const view = render(
    <EvidenceAgentThread
      nodeId="evidence.payment"
      conversation={{
        messages,
        running: false,
        stopError: null,
        submit,
        stop: vi.fn(),
        reset: vi.fn(),
      }}
      patchReview={{
        review: null,
        record: vi.fn(),
        accept: vi.fn(),
        revert: vi.fn(),
      }}
      onFocusEntity={vi.fn()}
    />,
  );
  return { view, submit };
};

describe('EvidenceAgentThread', () => {
  it('renders Markdown and official reasoning/tool disclosures without activating model HTML or URLs', async () => {
    const { view } = mount([
      { id: 'user', role: 'user', content: '来源是？' },
      {
        id: 'assistant',
        role: 'assistant',
        content: [
          { type: 'reasoning', text: '对照台账' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'run_sensors',
            args: {},
            result: '通过',
          },
          {
            type: 'text',
            text: '**结果**：[网页](https://example.com) ![图像](https://example.com/p.png)\n\n<mark>HTML</mark>',
          },
        ],
      },
    ]);
    expect(
      await screen.findByText('结果', { selector: 'strong' }),
    ).toBeVisible();
    expect(screen.getByText('网页')).not.toHaveAttribute('href');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(view.container.querySelector('mark')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Reasoning/ }));
    expect(await screen.findByText('对照台账')).toBeVisible();
    const toolGroup = view.container.querySelector<HTMLElement>(
      '[data-slot="tool-group-trigger"]',
    );
    if (toolGroup) fireEvent.click(toolGroup);
    expect(await screen.findByText('run_sensors')).toBeVisible();
  });

  it('does not send while composing Chinese text', async () => {
    const { submit } = mount([]);
    const composer = screen.getByRole('textbox', { name: '访谈内容' });
    fireEvent.change(composer, { target: { value: '业务问题' } });
    fireEvent.keyDown(composer, { key: 'Enter', isComposing: true });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(submit).toHaveBeenCalledExactlyOnceWith('业务问题', {
      nodeId: 'evidence.payment',
    });
  });
});
