import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasStormingBar } from './CanvasStormingBar';

const props = () => ({
  empty: false,
  open: false,
  focusToken: 0,
  busy: false,
  onClose: vi.fn(),
  onStorm: vi.fn(async () => true),
  onStop: vi.fn(),
});

describe('CanvasStormingBar', () => {
  it('shows the empty-canvas entry without stealing focus', () => {
    render(<CanvasStormingBar {...props()} empty />);

    expect(
      screen.getByRole('form', { name: '业务场景头脑风暴' }),
    ).toBeVisible();
    expect(screen.getByLabelText('业务场景')).not.toHaveFocus();
    expect(screen.getByRole('button', { name: /发起发散/ })).toBeDisabled();
  });

  it('focuses the input when invoked and keeps the draft when dismissed', () => {
    const bar = props();
    const { rerender } = render(<CanvasStormingBar {...bar} />);
    expect(screen.queryByLabelText('业务场景')).toBeNull();

    rerender(<CanvasStormingBar {...bar} open focusToken={1} />);
    const input = screen.getByLabelText('业务场景');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '一份合同' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(bar.onClose).toHaveBeenCalledOnce();
    rerender(<CanvasStormingBar {...bar} />);
    expect(screen.queryByLabelText('业务场景')).toBeNull();
    rerender(<CanvasStormingBar {...bar} open focusToken={2} />);
    expect(screen.getByLabelText('业务场景')).toHaveValue('一份合同');
  });

  it('submits a trimmed scenario on Enter, not while composing or inserting a newline', async () => {
    const bar = props();
    render(<CanvasStormingBar {...bar} empty />);
    const input = screen.getByLabelText('业务场景');
    fireEvent.change(input, { target: { value: '  买家询价\n摊主报价  ' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(bar.onStorm).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(bar.onStorm).toHaveBeenCalledExactlyOnceWith('买家询价\n摊主报价');
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('keeps a failed draft and offers a retry', async () => {
    const bar = props();
    bar.onStorm.mockResolvedValueOnce(false);
    render(<CanvasStormingBar {...bar} empty />);
    const input = screen.getByLabelText('业务场景');
    const submit = screen.getByRole('button', { name: /发起发散/ });
    fireEvent.change(input, { target: { value: '一份合同' } });
    fireEvent.click(submit);
    expect(input).toHaveValue('一份合同');
    fireEvent.click(submit);
    await waitFor(() => expect(input).toHaveValue(''));
  });
});
