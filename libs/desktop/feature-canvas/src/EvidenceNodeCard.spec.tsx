import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EvidenceNodeCard } from './EvidenceNodeCard.js';
import type { EntityAST } from '@evidence-poc/evidence-schema';

describe('EvidenceNodeCard', () => {
  const mockEvidence: EntityAST = {
    id: 'proof_quote',
    name: 'quote',
    label: '报价单凭证',
    category: 'evidence',
    kind: 'proposal',
    attributes: [
      {
        name: 'priced_at',
        label: '报价时间',
        meaning: '卖方出具报价时刻',
        valueType: 'timestamp',
        required: true,
        keyData: true,
        timeRole: 'occurrence',
        source: { kind: 'result-fact' },
      },
      {
        name: 'unit_price',
        label: '单价',
        meaning: '单件金额',
        valueType: 'decimal',
        required: true,
        keyData: true,
      },
    ],
  };

  it('应当展示业务动词时标 priced_at 而非泛化时间', () => {
    render(
      <EvidenceNodeCard
        entity={mockEvidence}
        selected={false}
        onSelect={vi.fn()}
        onOpenSourcing={vi.fn()}
        onTriggerWhatIf={vi.fn()}
      />,
    );

    expect(screen.getByText('priced_at')).toBeInTheDocument();
    expect(screen.getByText('报价单凭证')).toBeInTheDocument();
    expect(screen.getByText('单价')).toBeInTheDocument();
  });

  it('点击 ⚡ 溯源 应当触发 onOpenSourcing 回调', () => {
    const handleSourcing = vi.fn();
    render(
      <EvidenceNodeCard
        entity={mockEvidence}
        selected={false}
        onSelect={vi.fn()}
        onOpenSourcing={handleSourcing}
        onTriggerWhatIf={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('⚡ 溯源'));
    expect(handleSourcing).toHaveBeenCalledWith('proof_quote');
  });

  it('点击 🔥 What-If 应当触发 onTriggerWhatIf 回调', () => {
    const handleWhatIf = vi.fn();
    render(
      <EvidenceNodeCard
        entity={mockEvidence}
        selected={false}
        onSelect={vi.fn()}
        onOpenSourcing={vi.fn()}
        onTriggerWhatIf={handleWhatIf}
      />,
    );

    fireEvent.click(screen.getByText('🔥 What-If'));
    expect(handleWhatIf).toHaveBeenCalledWith('proof_quote');
  });
});
