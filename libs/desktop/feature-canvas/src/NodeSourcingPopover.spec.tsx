import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NodeSourcingPopover } from './NodeSourcingPopover.js';
import type { EntityAST } from '@evidence-poc/evidence-schema';

describe('NodeSourcingPopover', () => {
  const mockEntity: EntityAST = {
    id: 'proof_payment',
    name: 'payment',
    label: '付款凭证',
    category: 'evidence',
    kind: 'fulfillment_confirmation',
    attributes: [
      {
        name: 'paid_at',
        label: '付款时间',
        meaning: '完成支付时刻',
        valueType: 'timestamp',
        required: true,
        keyData: true,
        timeRole: 'occurrence',
      },
      {
        name: 'amount',
        label: '实付金额',
        meaning: '实际结算金额',
        valueType: 'money',
        required: true,
        keyData: true,
      },
    ],
  };

  it('点击申请方主动申报时应当触发 splitEvidenceToPair 与 onBindSource', async () => {
    const splitFn = vi.fn().mockResolvedValue(undefined);
    const bindFn = vi.fn().mockResolvedValue(undefined);

    render(
      <NodeSourcingPopover
        entity={mockEntity}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onSplitToPair={splitFn}
        onBindSource={bindFn}
      />,
    );

    const triggerBtn = screen.getByText(/申请方主动申报/i);
    fireEvent.click(triggerBtn);

    expect(splitFn).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmationId: 'proof_payment',
        requestLabel: '付款凭证申请',
      }),
    );
  });

  it('点击签约时约定的固定条款应当触发 onBindSource contract_term', async () => {
    const splitFn = vi.fn().mockResolvedValue(undefined);
    const bindFn = vi.fn().mockResolvedValue(undefined);

    render(
      <NodeSourcingPopover
        entity={mockEntity}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onSplitToPair={splitFn}
        onBindSource={bindFn}
      />,
    );

    const triggerBtn = screen.getByText(/签约时约定的固定条款/i);
    fireEvent.click(triggerBtn);

    expect(bindFn).toHaveBeenCalledWith({
      entityId: 'proof_payment',
      attributeName: 'amount',
      sourceType: 'contract_term',
    });
  });
});
