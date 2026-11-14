import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { createModelSession } from '@evidence-poc/evidence-model-core';

import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import {
  blurEditor,
  readExpression,
  typeExpression,
} from '../testing/codeEditor';
import { KeyDataLedgerSheet } from './KeyDataLedgerSheet';

/** The contract with one derived amount and one field whose provider is owed. */
const createFixture = (): DomainModelDocument => {
  const document = createDesktopFixture();

  return {
    ...document,
    entities: document.entities.map((entity) =>
      entity.id === 'evidence.contract' && entity.category === 'evidence'
        ? {
            ...entity,
            attributes: [
              ...(entity.attributes ?? []),
              {
                name: 'total_amount',
                label: '合同总额（Total Amount）',
                meaning: '按协议数量与单价派生。',
                valueType: 'money' as const,
                keyData: true,
                derivedByRuleRef: 'rule.contract-total',
              },
            ],
          }
        : entity,
    ),
    rules: [
      ...document.rules,
      {
        type: 'rule',
        id: 'rule.contract-total',
        kind: 'derivation',
        label: '合同总额派生',
        description: '按数量与单价派生合同总额。',
        contextRef: 'context.procurement',
        bindings: { contract: { ref: 'evidence.contract' } },
        expression: 'contract.quantity * 100',
        resultType: 'money',
        target: {
          entityRef: 'evidence.contract',
          attribute: 'total_amount',
        },
      },
    ],
  };
};

const setup = (
  entityId = 'evidence.contract',
  initialAttribute: string | null = null,
) => {
  const session = createModelSession({ document: createFixture() });
  const onClose = vi.fn();
  const view = render(
    <KeyDataLedgerSheet
      entity={session.getGraph().getEntity(entityId)!}
      graph={session.getGraph()}
      session={session}
      initialAttribute={initialAttribute}
      onClose={onClose}
    />,
  );

  return { session, onClose, view };
};

describe('KeyDataLedgerSheet', () => {
  it('lists every field and closes the ledger once nothing is owed', () => {
    setup();

    expect(
      screen.getByRole('dialog', { name: '关键数据台账工作台' }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-ledger-row="signed_at"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-ledger-row="total_amount"]'),
    ).not.toBeNull();
    expect(screen.getByText('台账已闭合')).toBeInTheDocument();
  });

  it('states how many decisions a request still owes', () => {
    setup('evidence.request');

    // `started_at` is a request formation input; `expired_at` still owes its
    // provider, and the header must say so before anyone reads a single row.
    expect(screen.getByText('1 项台账待决')).toBeInTheDocument();
  });

  it('edits the selected rule from the formula bar', () => {
    const { session } = setup('evidence.contract', 'total_amount');

    expect(readExpression('total_amount 公式栏')).toBe(
      'contract.quantity * 100',
    );

    typeExpression('total_amount 公式栏', 'contract.quantity * 120');
    blurEditor('total_amount 公式栏');

    expect(session.getGraph().getRule('rule.contract-total')?.expression).toBe(
      'contract.quantity * 120',
    );
  });

  it('opens on the attribute the modeler was inspecting', () => {
    setup('evidence.contract', 'total_amount');

    expect(
      document.querySelector('[data-ledger-row="total_amount"]'),
    ).toHaveAttribute('data-selected', 'true');
    expect(
      document.querySelector('[data-ledger-row="signed_at"]'),
    ).toHaveAttribute('data-selected', 'false');
  });

  it('says so when the selected field is not derived', () => {
    setup();

    fireEvent.click(document.querySelector('[data-ledger-row="signed_at"]')!);

    expect(
      screen.getByText(/是普通输入字段；需要派生计算时/),
    ).toBeInTheDocument();
  });

  it('toggles a required constraint through one undo step', () => {
    const { session } = setup();

    fireEvent.click(screen.getByLabelText('signed_at 必填'));

    expect(
      session.getGraph().attribute('evidence.contract', 'signed_at')?.required,
    ).toBeUndefined();

    act(() => {
      session.undo();
    });

    expect(
      session.getGraph().attribute('evidence.contract', 'signed_at')?.required,
    ).toBe(true);
  });

  it('slides in from the right instead of replacing the workspace', () => {
    setup();

    const sheet = document.querySelector('[data-slot="sheet-content"]');

    expect(sheet).toHaveAttribute('data-side', 'right');
    expect(sheet?.className).toContain('w-[55vw]');
  });

  it('closes on Escape', () => {
    const { onClose } = setup();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
