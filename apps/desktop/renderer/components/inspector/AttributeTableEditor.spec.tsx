import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import {
  createModelSession,
  type ModelSession,
} from '@evidence-poc/evidence-model-core/browser';

import { createDesktopFixture } from '../../test-support/modelFixture';
import { AttributeTableEditor } from './AttributeTableEditor';

/**
 * The shared fixture plus the two fields this file is about: a contract
 * parameter and a request amount whose provider nobody has decided yet.
 */
const createFixture = (): DomainModelDocument => {
  const document = createDesktopFixture();

  return {
    ...document,
    entities: document.entities.map((entity) => {
      if (entity.id === 'evidence.contract') {
        return {
          ...entity,
          attributes: [
            ...(entity.attributes ?? []),
            {
              name: 'quantity',
              label: '合同数量（Contract Quantity）',
              meaning: '合同约定的采购数量。',
              valueType: 'int' as const,
              keyData: true,
            },
          ],
        };
      }

      if (entity.id === 'evidence.request') {
        return {
          ...entity,
          attributes: [
            ...(entity.attributes ?? []),
            {
              name: 'penalty_amount',
              label: '违约金（Penalty）',
              meaning: '待补充提供方与算法。',
              valueType: 'money' as const,
              keyData: true,
            },
          ],
        };
      }

      return entity;
    }),
  };
};

/** Mirrors `useEditorSession`: re-reads the graph after every session event. */
const Harness = ({
  entityId,
  session,
}: {
  entityId: string;
  session: ModelSession;
}) => {
  const [, forceRender] = useState(0);

  useEffect(
    () =>
      session.subscribe(() => {
        forceRender((version) => version + 1);
      }),
    [session],
  );

  return (
    <AttributeTableEditor
      entity={session.getGraph().getEntity(entityId)!}
      graph={session.getGraph()}
      session={session}
    />
  );
};

const setup = (entityId: string) => {
  const session = createModelSession({ document: createFixture() });
  const view = render(<Harness entityId={entityId} session={session} />);

  return { session, view };
};

const provenanceFor = (attribute: string): HTMLElement =>
  document.querySelector(`[data-provenance-for="${attribute}"]`) as HTMLElement;

describe('AttributeTableEditor', () => {
  it('adds and removes an attribute through commands', () => {
    const { session } = setup('evidence.contract');

    fireEvent.click(screen.getByText('添加属性'));

    const added = session
      .getGraph()
      .attributesOf('evidence.contract')
      .map((attribute) => attribute.name);

    expect(added).toHaveLength(3);
    const created = added[2]!;

    fireEvent.click(screen.getByLabelText(`删除属性 ${created}`));

    expect(
      session
        .getGraph()
        .attributesOf('evidence.contract')
        .map((item) => item.name),
    ).toEqual(['signed_at', 'quantity']);
    expect(session.canUndo()).toBe(true);
  });

  it('patches the label through the update command and undoes it', () => {
    const { session } = setup('evidence.contract');
    const input = screen.getByLabelText('signed_at 业务名称');

    fireEvent.change(input, { target: { value: '签署日期（Signed At）' } });
    fireEvent.blur(input);

    expect(
      session.getGraph().attribute('evidence.contract', 'signed_at')?.label,
    ).toBe('签署日期（Signed At）');

    act(() => {
      session.undo();
    });

    expect(
      session.getGraph().attribute('evidence.contract', 'signed_at')?.label,
    ).toBe('签署时间');
  });

  it('shows the resolved provider for a contract term', () => {
    setup('evidence.contract');

    const picker = provenanceFor('signed_at');

    expect(
      within(picker).getByText('合同参数（Contract Term）'),
    ).toBeInTheDocument();
    expect(within(picker).queryByText(/仍待决策/)).not.toBeInTheDocument();
  });

  it('summarises the ledger and keeps the count honest', () => {
    const { session } = setup('evidence.request');

    expect(
      document.querySelector('[data-ledger-summary="evidence.request"]')
        ?.textContent,
    ).toContain('待决 2 项');

    fireEvent.click(screen.getByLabelText('expired_at 关键数据'));

    expect(
      session.getGraph().attribute('evidence.request', 'expired_at')?.keyData,
    ).toBe(false);
    expect(
      document.querySelector('[data-ledger-summary="evidence.request"]')
        ?.textContent,
    ).toContain('关键数据 2 项 · 待决 1 项');
  });

  it('offers to bind a derivation rule when the decision is still owed', () => {
    const { session } = setup('evidence.request');
    const picker = provenanceFor('penalty_amount');

    expect(within(picker).getByText(/仍待决策/)).toBeInTheDocument();

    fireEvent.click(within(picker).getByText('绑定派生规则'));

    expect(screen.getByLabelText('派生规则 ID')).toHaveValue(
      'rule.evidence.request.penalty-amount',
    );

    const expression = screen.getByLabelText('派生规则表达式');

    fireEvent.change(expression, { target: { value: 'contract.quantity' } });
    fireEvent.blur(expression);
    fireEvent.click(screen.getByText('保存'));

    const attribute = session
      .getGraph()
      .attribute('evidence.request', 'penalty_amount');

    expect(attribute?.derivedByRuleRef).toBe(
      'rule.evidence.request.penalty-amount',
    );
    expect(
      within(provenanceFor('penalty_amount')).getByText('派生规则（Derived）'),
    ).toBeInTheDocument();
  });

  it('lets a key data claim be withdrawn with one undo step', () => {
    const { session } = setup('evidence.request');
    const picker = provenanceFor('penalty_amount');

    fireEvent.click(within(picker).getByText('并非关键数据'));

    expect(
      session.getGraph().attribute('evidence.request', 'penalty_amount')
        ?.keyData,
    ).toBe(false);

    act(() => {
      session.undo();
    });

    expect(
      session.getGraph().attribute('evidence.request', 'penalty_amount')
        ?.keyData,
    ).toBe(true);
  });
});
