import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkshopStepSelector } from './WorkshopStepSelector';

describe('WorkshopStepSelector', () => {
  it('offers all seven steps with their hints', () => {
    render(<WorkshopStepSelector selection={null} onSelect={() => undefined} />);

    const steps = screen.getByRole('group', { name: '工作坊步骤' });

    expect(steps).toHaveTextContent('1. 锚定合约与双方');
    expect(steps).toHaveTextContent('7. 串起业务宏流程');
    expect(
      screen.getByTitle('先确定哪一份合约约束双方，甲乙方分别是谁'),
    ).toBeInTheDocument();
  });

  it('marks the chosen step and clears it when clicked again', () => {
    const onSelect = vi.fn();

    render(
      <WorkshopStepSelector selection={'pair-fulfillment'} onSelect={onSelect} />,
    );

    const chip = screen.getByRole('button', { name: '2. 成对挖掘履约项' });

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: '1. 锚定合约与双方' }),
    ).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chip);

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('lets the modeler say the business has no agreement to read', () => {
    const onSelect = vi.fn();

    render(<WorkshopStepSelector selection={null} onSelect={onSelect} />);

    const reverse = screen.getByRole('button', { name: '🔄 无合同逆推' });

    expect(reverse).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(reverse);

    expect(onSelect).toHaveBeenCalledWith('reverse-contract');
  });

  it('shows the reverse mode as the active move, not alongside a step', () => {
    render(
      <WorkshopStepSelector
        selection={'reverse-contract'}
        onSelect={() => undefined}
      />,
    );

    expect(
      screen.getByRole('button', { name: '🔄 无合同逆推' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: '3. 补上标的物与领域组件' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: '清除当前步骤' }),
    ).toBeInTheDocument();
  });
});
