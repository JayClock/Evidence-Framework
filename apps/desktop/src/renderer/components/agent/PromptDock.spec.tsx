import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PromptDock } from './PromptDock';

const type = (value: string): HTMLTextAreaElement => {
  const input = screen.getByLabelText('访谈内容') as HTMLTextAreaElement;

  fireEvent.change(input, { target: { value } });

  return input;
};

describe('PromptDock', () => {
  it('sends the trimmed text and clears the composer', () => {
    const onSubmit = vi.fn();

    render(
      <PromptDock
        running={false}
        activeToolName={null}
        onSubmit={onSubmit}
        onStop={() => undefined}
      />,
    );

    const input = type('  澄清退货履约  ');

    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(onSubmit).toHaveBeenCalledWith('澄清退货履约');
    expect(input.value).toBe('');
  });

  it('submits with Cmd+Enter and leaves plain Enter alone', () => {
    const onSubmit = vi.fn();

    render(
      <PromptDock
        running={false}
        activeToolName={null}
        onSubmit={onSubmit}
        onStop={() => undefined}
      />,
    );

    const input = type('第一行\n第二行');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledWith('第一行\n第二行');
  });

  it('submits with Ctrl+Enter on non-mac platforms', () => {
    const onSubmit = vi.fn();

    render(
      <PromptDock
        running={false}
        activeToolName={null}
        onSubmit={onSubmit}
        onStop={() => undefined}
      />,
    );

    fireEvent.keyDown(type('澄清付款期限'), { key: 'Enter', ctrlKey: true });

    expect(onSubmit).toHaveBeenCalledWith('澄清付款期限');
  });

  it('never sends an empty prompt', () => {
    const onSubmit = vi.fn();

    render(
      <PromptDock
        running={false}
        activeToolName={null}
        onSubmit={onSubmit}
        onStop={() => undefined}
      />,
    );

    type('   ');
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the running tool and steers instead of starting a run', () => {
    const onSubmit = vi.fn();
    const onStop = vi.fn();

    render(
      <PromptDock
        running
        activeToolName="run_sensors"
        onSubmit={onSubmit}
        onStop={onStop}
      />,
    );

    expect(screen.getByTestId('prompt-dock-status')).toHaveTextContent(
      '正在执行 run_sensors',
    );

    type('运费由买方承担');
    fireEvent.click(screen.getByRole('button', { name: '插话' }));
    fireEvent.click(screen.getByRole('button', { name: '停止' }));

    expect(onSubmit).toHaveBeenCalledWith('运费由买方承担');
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('explains the idle shortcut instead of claiming work is happening', () => {
    render(
      <PromptDock
        running={false}
        activeToolName={null}
        onSubmit={() => undefined}
        onStop={() => undefined}
      />,
    );

    expect(screen.queryByTestId('prompt-dock-status')).toBeNull();
    expect(
      screen.getByText('⌘/Ctrl + Enter 发送 · 运行中发送即插话'),
    ).toBeInTheDocument();
  });

  it('names the object the next question is about and can drop the focus', () => {
    const onClearFocus = vi.fn();

    render(
      <PromptDock
        running={false}
        activeToolName={null}
        onSubmit={() => undefined}
        onStop={() => undefined}
        focus={{ nodeId: 'request.payment', label: '支付申请', kind: 'evidence' }}
        onClearFocus={onClearFocus}
      />,
    );

    expect(screen.getByTestId('prompt-dock-focus')).toHaveTextContent(
      '焦点：支付申请（evidence）',
    );

    fireEvent.click(screen.getByRole('button', { name: '清除焦点' }));

    expect(onClearFocus).toHaveBeenCalledTimes(1);
  });

  it('shows no focus pill when nothing is selected', () => {
    render(
      <PromptDock
        running={false}
        activeToolName={null}
        onSubmit={() => undefined}
        onStop={() => undefined}
      />,
    );

    expect(screen.queryByTestId('prompt-dock-focus')).toBeNull();
  });

  it('stops the live run on Escape without sending a steering message', () => {
    const onSubmit = vi.fn();
    const onStop = vi.fn();

    render(
      <PromptDock
        running
        activeToolName={null}
        onSubmit={onSubmit}
        onStop={onStop}
      />,
    );

    fireEvent.keyDown(type('先别管运费'), { key: 'Escape' });

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('moves the caret into the composer when the focus token changes', () => {
    const props = {
      running: false,
      activeToolName: null,
      onSubmit: () => undefined,
      onStop: () => undefined,
    };
    const { rerender } = render(<PromptDock {...props} focusToken={0} />);

    expect(document.activeElement).not.toBe(screen.getByLabelText('访谈内容'));

    rerender(<PromptDock {...props} focusToken={1} />);

    expect(document.activeElement).toBe(screen.getByLabelText('访谈内容'));
  });

  it('offers the seven workshop steps, each with its hint', () => {
    render(
      <PromptDock
        running={false}
        activeToolName={null}
        onSubmit={() => undefined}
        onStop={() => undefined}
      />,
    );

    const steps = screen.getByRole('group', { name: '工作坊步骤' });

    expect(steps).toHaveTextContent('1. 锚定合约与双方');
    expect(steps).toHaveTextContent('7. 串起业务宏流程');
    expect(
      screen.getByTitle('先确定哪一份合约约束双方，甲乙方分别是谁'),
    ).toBeInTheDocument();
  });

  it('sends the step the modeler picked with the message', () => {
    const onSubmit = vi.fn();

    render(
      <PromptDock
        running={false}
        activeToolName={null}
        onSubmit={onSubmit}
        onStop={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '3. 补上标的物与领域组件' }));
    type('会员等级怎么算出来的？');
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(onSubmit).toHaveBeenCalledWith(
      '【第 3 步 · 补上标的物与领域组件】\n会员等级怎么算出来的？',
    );
  });

  it('keeps the step for the next turn and can clear it again', () => {
    const onSubmit = vi.fn();

    render(
      <PromptDock
        running={false}
        activeToolName={null}
        onSubmit={onSubmit}
        onStop={() => undefined}
      />,
    );

    const chip = screen.getByRole('button', { name: '2. 成对挖掘履约项' });

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    type('发货确认呢？');
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(onSubmit).toHaveBeenLastCalledWith(
      '【第 2 步 · 成对挖掘履约项】\n发货确认呢？',
    );

    fireEvent.click(screen.getByRole('button', { name: '清除当前步骤' }));
    type('那违约呢？');
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(onSubmit).toHaveBeenLastCalledWith('那违约呢？');
  });

  it('sends plain text when no step is chosen', () => {
    const onSubmit = vi.fn();

    render(
      <PromptDock
        running={false}
        activeToolName={null}
        onSubmit={onSubmit}
        onStop={() => undefined}
      />,
    );

    type('先把故事讲一遍');
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(onSubmit).toHaveBeenCalledWith('先把故事讲一遍');
  });
});
