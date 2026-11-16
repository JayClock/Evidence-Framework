import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CelFormulaBar } from './CelFormulaBar';

const props = {
  entityLabel: '付款确认',
  attribute: {
    name: 'total',
    label: '总金额',
    meaning: '总金额',
    valueType: 'decimal' as const,
  },
  ruleExpression: 'contract.price * 2',
  candidates: [
    {
      alias: 'contract',
      ref: 'contract',
      label: '采购合同',
      attributes: [
        { name: 'price', label: '单价', valueType: 'decimal' as const },
        { name: 'qty', label: '数量', valueType: 'int' as const },
      ],
    },
  ],
};
describe('business formula bar', () => {
  it('defaults to labels and commits a constant without touching the bindings', () => {
    const onCommitExpression = vi.fn();
    render(
      <CelFormulaBar {...props} onCommitExpression={onCommitExpression} />,
    );
    expect(screen.getByLabelText('业务公式')).toHaveTextContent('×');
    const literal = screen.getByLabelText('公式常量 5');
    fireEvent.change(literal, { target: { value: '3' } });
    fireEvent.blur(literal);
    expect(onCommitExpression).toHaveBeenCalledWith('contract.price * 3');
    fireEvent.change(screen.getByLabelText('公式属性 1'), {
      target: { value: 'contract.qty' },
    });
    expect(onCommitExpression).toHaveBeenCalledWith('contract.qty * 2');
    fireEvent.change(literal, { target: { value: '(' } });
    fireEvent.blur(literal);
    expect(screen.getByRole('alert')).toHaveTextContent('未保存');
    expect(onCommitExpression).toHaveBeenCalledTimes(2);
  });
  it('keeps the source editor available for advanced expressions', () => {
    render(
      <CelFormulaBar
        {...props}
        ruleExpression="[1].map(x, x * 2)"
        onCommitExpression={vi.fn()}
      />,
    );
    expect(screen.getByText(/当前以 CEL 源码展示/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '业务公式' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'CEL 源码' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
