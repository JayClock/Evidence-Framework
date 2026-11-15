import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { forEachDiagnostic, forceLinting } from '@codemirror/lint';

import type { CelCandidate } from '@evidence-poc/evidence-model-core';

import { CelCodeMirrorEditor } from './CelCodeMirrorEditor';
import {
  blurEditor,
  commitExpression,
  editorViewFor,
  readExpression,
  typeExpression,
} from '../../testing/codeEditor';

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
  {
    alias: 'confirmations',
    label: '交付确认（Delivery Confirmation）',
    cardinality: 'many',
    attributes: [{ name: 'confirmed_at', label: '确认时间' }],
  },
];

describe('CelCodeMirrorEditor', () => {
  it('commits the draft when the caret leaves the editor', () => {
    const onCommit = vi.fn();

    render(
      <CelCodeMirrorEditor
        value="self.quantity"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={onCommit}
      />,
    );

    expect(readExpression('测试表达式')).toBe('self.quantity');

    typeExpression('测试表达式', 'self.quantity * 2');
    blurEditor('测试表达式');

    expect(onCommit).toHaveBeenCalledWith('self.quantity * 2');
  });

  it('does not commit an unchanged draft', () => {
    const onCommit = vi.fn();

    render(
      <CelCodeMirrorEditor
        value="self.quantity"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={onCommit}
      />,
    );

    blurEditor('测试表达式');

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits once when Mod+Enter is pressed', () => {
    const onCommit = vi.fn();

    render(
      <CelCodeMirrorEditor
        value=""
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={onCommit}
      />,
    );

    typeExpression('测试表达式', 'contract.unit_price');
    commitExpression('测试表达式');

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('contract.unit_price');
  });

  it('reports the identifiers the expression reads', () => {
    const onCommit = vi.fn();
    const onCommitAliases = vi.fn();

    render(
      <CelCodeMirrorEditor
        value="self.quantity"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={onCommit}
        onCommitAliases={onCommitAliases}
      />,
    );

    typeExpression('测试表达式', 'contract.unit_price * self.quantity');
    blurEditor('测试表达式');

    expect(onCommitAliases).toHaveBeenCalledWith(['contract', 'self']);
  });

  it('underlines an undeclared alias as soon as it is typed', async () => {
    render(
      <CelCodeMirrorEditor
        value="self.quantity"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={() => undefined}
      />,
    );

    typeExpression('测试表达式', 'self.quantity * exchange_rate');
    forceLinting(editorViewFor('测试表达式'));

    await waitFor(() => {
      expect(
        document.querySelectorAll('.cm-lintRange-error').length,
      ).toBeGreaterThan(0);
    });
    expect(
      document.querySelector('[data-cel-diagnostics]')?.textContent,
    ).toContain('exchange_rate');
  });

  it('accepts multiline nested macros and commits only business aliases', () => {
    const onCommitAliases = vi.fn();
    render(
      <CelCodeMirrorEditor
        value="self.quantity"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={() => undefined}
        onCommitAliases={onCommitAliases}
      />,
    );
    typeExpression(
      '测试表达式',
      `confirmations.all(c,
      confirmations.exists(c, c.confirmed_at > self.quantity))
      && size(confirmations) > 0`,
    );
    blurEditor('测试表达式');
    expect(document.querySelector('[data-cel-diagnostics]')).toBeNull();
    expect(onCommitAliases).toHaveBeenCalledWith(['confirmations', 'self']);
  });

  it('underlines the native parser range in the untrimmed multiline document', async () => {
    render(
      <CelCodeMirrorEditor
        value="self.quantity"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={() => undefined}
      />,
    );
    const expression = '  self.quantity +\n  )';
    typeExpression('测试表达式', expression);
    const editor = editorViewFor('测试表达式');
    forceLinting(editor);
    await waitFor(() => {
      const ranges: { from: number; to: number }[] = [];
      forEachDiagnostic(editor.state, (_diagnostic, from, to) =>
        ranges.push({ from, to }),
      );
      expect(ranges).toEqual([
        { from: expression.indexOf(')'), to: expression.indexOf(')') + 1 },
      ]);
    });
  });

  it('underlines an unknown modeled attribute inside a macro', async () => {
    render(
      <CelCodeMirrorEditor
        value="self.quantity"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={() => undefined}
      />,
    );
    const expression = 'confirmations.exists(c, c.missing > 0)';
    typeExpression('测试表达式', expression);
    const editor = editorViewFor('测试表达式');
    forceLinting(editor);
    await waitFor(() => {
      const ranges: { from: number; to: number }[] = [];
      forEachDiagnostic(editor.state, (_diagnostic, from, to) =>
        ranges.push({ from, to }),
      );
      expect(ranges).toEqual([
        {
          from: expression.indexOf('missing'),
          to: expression.indexOf('missing') + 7,
        },
      ]);
    });
    expect(
      document.querySelector('[data-cel-diagnostics]')?.textContent,
    ).toContain('confirmations.missing');
  });

  it('lists the source aliases under the field', () => {
    render(
      <CelCodeMirrorEditor
        value="self.quantity"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={() => undefined}
      />,
    );

    expect(
      screen.getByText(/可用来源：self、contract、confirmations/),
    ).toBeInTheDocument();
  });

  it('replaces the draft when the model changes underneath', () => {
    const { rerender } = render(
      <CelCodeMirrorEditor
        value="self.quantity"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={() => undefined}
      />,
    );

    rerender(
      <CelCodeMirrorEditor
        value="contract.unit_price"
        candidates={candidates}
        ariaLabel="测试表达式"
        onCommit={() => undefined}
      />,
    );

    expect(readExpression('测试表达式')).toBe('contract.unit_price');
  });
});
