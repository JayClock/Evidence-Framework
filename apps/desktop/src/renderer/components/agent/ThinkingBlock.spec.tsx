import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ThinkingBlock } from './ThinkingBlock';

describe('ThinkingBlock', () => {
  it('renders nothing when the turn carried no reasoning', () => {
    const { container } = render(
      <ThinkingBlock thinking={null} active={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('folds the reasoning and expands it on request', () => {
    render(
      <ThinkingBlock
        thinking={'先判断是否成对。\n再补确认端。'}
        active={false}
      />,
    );

    expect(screen.queryByText(/再补确认端/)).toBeNull();
    expect(screen.getByText('2 行推理')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /推理过程/ }));

    expect(screen.getByText(/再补确认端/)).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('says it is still reasoning before the first token arrives', () => {
    render(<ThinkingBlock thinking={null} active />);
    expect(screen.getByText('正在推演…')).toBeInTheDocument();
    expect(screen.getByLabelText('推理过程')).toHaveAttribute(
      'data-thinking-active',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /正在推演/ }));
    expect(screen.getByText('等待模型输出…')).toBeInTheDocument();
  });

  it('teases the tail of the reasoning while it is still streaming', () => {
    render(<ThinkingBlock thinking={'先核对请求与确认是否成对'} active />);

    expect(screen.getByText('先核对请求与确认是否成对')).toBeInTheDocument();
  });
});
