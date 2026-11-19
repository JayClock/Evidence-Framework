import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiagnosticIndex } from '@evidence-poc/desktop-feature-canvas';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { DomainLedgerTable } from './DomainLedgerTable';
import { useEntityLedger } from './useEntityLedger';

const model = createDesktopFixture();
model.rules.push({
  type: 'rule',
  id: 'rule.contract-date',
  label: '合同时间',
  description: '合同签署先于请求',
  kind: 'invariant',
  contextRef: 'context.procurement',
  bindings: {
    contract: { ref: 'evidence.contract' },
    limit: { type: 'timestamp' },
  },
  expression: 'contract.signed_at < limit',
  resultType: 'bool',
});

const renderLedger = (diagnostics: DiagnosticIndex | null = null) => {
  const reveal = vi.fn();
  const Ledger = () => (
    <DomainLedgerTable
      ledger={useEntityLedger(model, diagnostics, true)}
      selectedNodeId="evidence.contract"
      onRevealOnGraph={reveal}
    />
  );
  render(<Ledger />);
  return reveal;
};

const rowFor = (id: string) => {
  const row = screen.getByRole('rowheader', { name: id }).closest('tr');
  if (row === null) throw new Error(`Missing row for ${id}`);
  return row;
};

describe('DomainLedgerTable', () => {
  // TanStack measures client dimensions after mounting; jsdom has no layout.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(640);
  });
  afterEach(() => vi.restoreAllMocks());
  it('renders a semantic table with the seven design columns, not field editor rows', () => {
    renderLedger();
    const table = screen.getByRole('table', { name: '领域实体与门禁发现' });
    expect(table).toHaveAttribute('aria-rowcount', '9');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      '实体标识 (ID)',
      '中文名称 / 分类',
      '所属上下文 (Context)',
      '字段数',
      '业务不变量 (CEL 规则)',
      '门禁状态',
      '操作',
    ]);
    const row = rowFor('evidence.contract');
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row).toHaveTextContent('context.procurement');
    expect(row).toHaveTextContent('1 个字段');
    expect(row).toHaveTextContent('contract.signed_at < limit');
    expect(row).toHaveTextContent('待检查');
    expect(within(table).queryByRole('textbox')).toBeNull();
  });

  it('combines category counts and CEL filtering and explains the Thread empty state', () => {
    renderLedger();
    const search = screen.getByRole('searchbox', {
      name: '过滤实体或 CEL 规则',
    });
    fireEvent.click(
      screen.getByRole('radio', { name: '核心凭证 Evidence (3)' }),
    );
    expect(screen.getAllByRole('rowheader')).toHaveLength(3);
    fireEvent.change(search, { target: { value: 'SIGNED_AT <' } });
    expect(screen.getAllByRole('rowheader')).toHaveLength(1);
    expect(rowFor('evidence.contract')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('radio', { name: '参与角色 Participant (5)' }),
    );
    expect(screen.getByText('未找到匹配的实体或 CEL 规则。')).toBeVisible();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getAllByRole('rowheader')).toHaveLength(5);
    fireEvent.click(screen.getByRole('radio', { name: '履约线索 Thread (0)' }));
    expect(
      screen.getByText('当前履约模型没有独立的 Thread 实体。'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: '全部实体 (8)' }));
    expect(screen.getAllByRole('rowheader')).toHaveLength(8);
  });

  it('renders current diagnostics and sends the entity ID to the graph', () => {
    const reveal = renderLedger(
      new Map([
        ['evidence.request', { severity: 'warn', issues: [] }],
        ['evidence.contract', { severity: 'block', issues: [] }],
      ]),
    );
    const contract = rowFor('evidence.contract');
    expect(contract).toHaveTextContent('阻断');
    expect(rowFor('evidence.request')).toHaveTextContent('警告');
    expect(screen.getAllByText('通过')).toHaveLength(6);
    fireEvent.click(
      within(contract).getByRole('button', { name: /在画布中定位/ }),
    );
    expect(reveal).toHaveBeenCalledExactlyOnceWith('evidence.contract');
  });
});
