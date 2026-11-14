import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type {
  DomainModelDocument,
  EvidenceEntityAST,
} from '@evidence-poc/evidence-schema';
import { createModelSession } from '@evidence-poc/evidence-model-core';

import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { FulfillmentPairSection } from './FulfillmentPairSection';

/**
 * The shared fixture already pairs the request with its confirmation through a
 * reference but declares no completion rule; a second, unpaired confirmation and
 * a supporting proof exercise the guard rails.
 */
const createFixture = (): DomainModelDocument => {
  const document = createDesktopFixture();

  return {
    ...document,
    // Start from a request that nobody has paired yet.
    rules: [],
    entities: [
      ...document.entities,
      {
        type: 'entity',
        id: 'evidence.second-confirmation',
        category: 'evidence',
        kind: 'fulfillment_confirmation',
        label: '复验确认（Re-inspection Confirmation）',
        contextRef: 'context.procurement',
        responsibleRoleRef: 'role.buyer',
        attributes: [
          {
            name: 'confirmed_at',
            label: '确认时间（Confirmed At）',
            meaning: '复验通过时登记。',
            valueType: 'timestamp',
            required: true,
            keyData: true,
          },
        ],
      },
      {
        type: 'entity',
        id: 'evidence.proof',
        category: 'evidence',
        kind: 'other_evidence',
        label: '物流单据（Shipping Document）',
        contextRef: 'context.procurement',
        responsibleRoleRef: 'role.supplier',
        attributes: [
          {
            name: 'created_at',
            label: '形成时间（Created At）',
            meaning: '承运方开具。',
            valueType: 'timestamp',
            required: true,
            keyData: true,
          },
        ],
      },
    ],
  };
};

const setup = () => {
  const session = createModelSession({ document: createFixture() });
  const entity = session
    .getGraph()
    .getEntity('evidence.request') as EvidenceEntityAST;

  render(
    <FulfillmentPairSection
      entity={entity}
      graph={session.getGraph()}
      session={session}
    />,
  );

  return { session };
};

describe('FulfillmentPairSection', () => {
  it('separates the missing completion rule from the paired confirmation', () => {
    setup();

    const section = document.querySelector(
      '[data-region="fulfillment-pair"]',
    ) as HTMLElement;

    expect(within(section).getByText('未声明完成规则')).toBeInTheDocument();
    expect(
      within(section).getByText(/交付确认（Delivery Confirmation）/),
    ).toBeInTheDocument();
  });

  it('offers only confirmation evidence that is not paired yet', () => {
    setup();

    fireEvent.click(screen.getByText('配对结果确认'));

    const options = screen
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(options).toEqual(['复验确认（Re-inspection Confirmation）']);
  });

  it('pairs the request with a confirmation in one undo step', () => {
    const { session } = setup();

    fireEvent.click(screen.getByText('配对结果确认'));
    fireEvent.click(screen.getByText('保存'));

    const pair = session.getGraph().fulfillmentPair('evidence.request');

    expect(pair?.completionRules).toHaveLength(1);
    expect(pair?.confirmations.map((item) => item.id)).toEqual([
      'evidence.confirmation',
      'evidence.second-confirmation',
    ]);
    expect(
      session.getGraph().getRule('rule.evidence.request-completed'),
    ).toBeDefined();

    act(() => {
      session.undo();
    });

    expect(
      session.getGraph().fulfillmentPair('evidence.request')?.completionRules,
    ).toHaveLength(0);
  });

  it('declares the breach condition and keeps the follow-up undeclared', () => {
    const { session } = setup();

    fireEvent.click(screen.getByText('新增违约条件'));
    fireEvent.click(screen.getByText('保存'));

    const rule = session
      .getGraph()
      .rules()
      .find((candidate) => candidate.kind === 'breach');

    expect(rule).toMatchObject({
      id: 'rule.evidence.request-breach',
      contextRef: 'context.procurement',
    });
    expect(screen.getByText(/违约后的凭证：未声明/)).toBeInTheDocument();
  });
});
