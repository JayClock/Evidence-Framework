import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CelCandidate } from '@evidence-poc/evidence-model-core/browser';

import { InlineCelEditor } from './InlineCelEditor';
import { computeCelSuggestions } from './useCelCompletion';

const candidates: readonly CelCandidate[] = [
  {
    alias: 'self',
    label: '发货请求（Shipment Request）',
    ref: 'evidence.request',
    attributes: [
      { name: 'quantity', label: '数量（Quantity）', valueType: 'int' },
      { name: 'total_amount', label: '请求金额（Total Amount）' },
    ],
  },
  {
    alias: 'contract',
    label: '采购协议（Procurement Contract）',
    ref: 'evidence.contract',
    attributes: [
      { name: 'unit_price', label: '单价（Unit Price）', valueType: 'money' },
    ],
  },
];

describe('computeCelSuggestions', () => {
  it('suggests aliases for a bare word', () => {
    const result = computeCelSuggestions({
      expression: 'con',
      caret: 3,
      candidates,
    });

    expect(result.items).toEqual([
      {
        label: 'contract',
        detail: '采购协议（Procurement Contract）',
        insert: 'contract',
        kind: 'alias',
      },
    ]);
    expect(result.replaceFrom).toBe(0);
  });

  it('suggests the attributes of the alias before the dot', () => {
    const result = computeCelSuggestions({
      expression: 'self.qu',
      caret: 7,
      candidates,
    });

    expect(result.items).toEqual([
      {
        label: 'quantity',
        detail: '数量（Quantity） · int',
        insert: 'quantity',
        kind: 'attribute',
      },
    ]);
    expect(result.replaceFrom).toBe(5);
  });

  it('offers nothing for an unknown alias', () => {
    expect(
      computeCelSuggestions({
        expression: 'nope.',
        caret: 5,
        candidates,
      }).items,
    ).toEqual([]);
  });

  it('offers nothing when the caret follows an operator', () => {
    expect(
      computeCelSuggestions({
        expression: 'self.quantity > ',
        caret: 16,
        candidates,
      }).items,
    ).toEqual([]);
  });
});

describe('InlineCelEditor', () => {
  it('shows a diagnostic for an undeclared alias', () => {
    vi.useFakeTimers();

    render(
      <InlineCelEditor
        value="self.quantity * exchange_rate"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={() => undefined}
      />,
    );

    vi.advanceTimersByTime(400);

    const diagnostics = document.querySelector('[data-cel-diagnostics]');

    expect(diagnostics?.textContent).toContain('exchange_rate');
    vi.useRealTimers();
  });

  it('inserts the completion with the keyboard', () => {
    const onCommit = vi.fn();

    render(
      <InlineCelEditor
        value=""
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={onCommit}
      />,
    );

    const editor = screen.getByLabelText('测试表达式') as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: 'cont' } });
    fireEvent.click(editor, { target: { selectionStart: 4 } });

    const listbox = screen.getByRole('listbox', { name: '测试表达式 补全' });

    expect(within(listbox).getByText('contract')).toBeInTheDocument();

    fireEvent.keyDown(editor, { key: 'Tab' });

    expect(editor.value).toBe('contract');

    fireEvent.blur(editor);

    expect(onCommit).toHaveBeenCalledWith('contract');
  });

  it('does not commit an unchanged draft', () => {
    const onCommit = vi.fn();

    render(
      <InlineCelEditor
        value="self.quantity"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={onCommit}
      />,
    );

    fireEvent.blur(screen.getByLabelText('测试表达式'));

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('lists the source aliases under the field', () => {
    render(
      <InlineCelEditor
        value="self.quantity"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={() => undefined}
      />,
    );

    expect(screen.getByText(/可用来源：self、contract/)).toBeInTheDocument();
  });
});
