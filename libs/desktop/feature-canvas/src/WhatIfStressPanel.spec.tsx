import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WhatIfStressPanel } from './WhatIfStressPanel.js';
import type { EntityAST } from '@evidence-poc/evidence-schema';

describe('WhatIfStressPanel', () => {
  const mockEntity: EntityAST = {
    id: 'proof_delivery',
    name: 'delivery',
    label: '交付确认',
    category: 'evidence',
    kind: 'fulfillment_confirmation',
    attributes: [
      {
        name: 'delivered_at',
        label: '交付时间',
        meaning: '完成交付时刻',
        valueType: 'timestamp',
        required: true,
        keyData: true,
        timeRole: 'occurrence',
      },
    ],
  };

  it('点击超时未达成应当触发 onGrowCompensation timeout', async () => {
    const growFn = vi.fn().mockResolvedValue(undefined);
    const closeFn = vi.fn();

    render(
      <WhatIfStressPanel
        entity={mockEntity}
        position={{ x: 100, y: 100 }}
        onClose={closeFn}
        onGrowCompensation={growFn}
      />,
    );

    const triggerBtn = screen.getByText(/超时未达成/i);
    fireEvent.click(triggerBtn);

    await waitFor(() => {
      expect(growFn).toHaveBeenCalledWith(
        expect.objectContaining({
          violatedConfirmationId: 'proof_delivery',
          breachScenario: 'timeout',
          compensationLabel: '交付确认逾期补偿金',
        }),
      );
      expect(closeFn).toHaveBeenCalled();
    });
  });
});
