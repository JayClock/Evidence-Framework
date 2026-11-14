import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createModelSession } from '@evidence-poc/evidence-model-core/browser';

import { RightInspector } from './RightInspector';
import { blurEditor, typeExpression } from '../test-support/codeEditor';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

const setup = (nodeId: string | null) => {
  const session = createModelSession({ document: createDesktopFixture() });
  const renderInspector = () =>
    render(
      <RightInspector
        graph={session.getGraph()}
        session={session}
        selection={{ nodeId, attributeName: null }}
      />,
    );

  return { session, renderInspector };
};

describe('RightInspector', () => {
  it('asks for a selection before showing fields', () => {
    setup(null).renderInspector();

    expect(
      screen.getByText('选择画布上的业务对象查看属性。'),
    ).toBeInTheDocument();
  });

  it('renders the registry groups and the stable id read-only', () => {
    setup('evidence.request').renderInspector();

    expect(screen.getByText('基础信息')).toBeInTheDocument();
    expect(screen.getByText('责任锚定')).toBeInTheDocument();
    expect(screen.getByText('业务属性与关键数据')).toBeInTheDocument();
    expect(screen.getByText('evidence.request')).toBeInTheDocument();
    expect(screen.getAllByText('关键数据').length).toBeGreaterThan(0);
  });

  it('commits a renamed label through the session and undoes it', () => {
    const { session, renderInspector } = setup('evidence.contract');
    const view = renderInspector();
    const labels = screen.getAllByDisplayValue(
      '采购协议（Procurement Contract）',
    );
    const input = labels[0]!;

    fireEvent.change(input, {
      target: { value: '采购合同（Procurement Contract）' },
    });
    fireEvent.blur(input);

    expect(session.getGraph().getEntity('evidence.contract')?.label).toBe(
      '采购合同（Procurement Contract）',
    );
    expect(session.canUndo()).toBe(true);

    session.undo();

    expect(session.getGraph().getEntity('evidence.contract')?.label).toBe(
      '采购协议（Procurement Contract）',
    );

    view.unmount();
  });

  it('marks an attribute as key data from the table', () => {
    const { session, renderInspector } = setup('evidence.contract');
    renderInspector();

    const checkbox = screen.getByLabelText('signed_at 关键数据');

    fireEvent.click(checkbox);

    const attribute = session
      .getGraph()
      .attribute('evidence.contract', 'signed_at');

    expect(attribute?.keyData).toBe(false);
    expect(session.canUndo()).toBe(true);
  });

  it('edits a CEL expression and keeps the rule target untouched', () => {
    const fixture = createDesktopFixture();
    fixture.entities = fixture.entities.map((entity) =>
      entity.id === 'evidence.contract' && entity.category === 'evidence'
        ? {
            ...entity,
            attributes: [
              ...(entity.attributes ?? []),
              {
                name: 'total_amount',
                label: '合同总额（Total Amount）',
                meaning: '按协议数量与单价派生。',
                valueType: 'money',
                keyData: true,
                derivedByRuleRef: 'rule.contract-total',
              },
            ],
          }
        : entity,
    );
    fixture.rules = [
      ...fixture.rules,
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
    ];

    const session = createModelSession({ document: fixture });

    render(
      <RightInspector
        graph={session.getGraph()}
        session={session}
        selection={{ nodeId: 'evidence.contract', attributeName: null }}
      />,
    );

    fireEvent.click(screen.getByLabelText('total_amount 展开'));
    typeExpression('total_amount CEL 表达式', 'contract.quantity * 120');
    blurEditor('total_amount CEL 表达式');

    const rule = session.getGraph().getRule('rule.contract-total');

    expect(rule?.expression).toBe('contract.quantity * 120');
    expect(rule?.target).toEqual({
      entityRef: 'evidence.contract',
      attribute: 'total_amount',
    });
  });

  it('binds a derivation rule and its attribute in one undo step', () => {
    const { session, renderInspector } = setup('evidence.contract');
    renderInspector();

    fireEvent.click(screen.getByLabelText('signed_at 展开'));

    const row = screen.getByText(/未声明派生规则/).closest('div')!;

    fireEvent.click(within(row).getByText('绑定派生规则'));

    typeExpression('派生规则表达式', 'self.signed_at');
    blurEditor('派生规则表达式');
    fireEvent.click(screen.getByText('保存'));

    const attribute = session
      .getGraph()
      .attribute('evidence.contract', 'signed_at');

    expect(attribute?.derivedByRuleRef).toBeDefined();
    expect(
      session.getGraph().getRule(attribute!.derivedByRuleRef!),
    ).toBeDefined();

    session.undo();

    expect(
      session.getGraph().attribute('evidence.contract', 'signed_at')
        ?.derivedByRuleRef,
    ).toBeUndefined();
  });

  it('lets a role be re-bound to a different context', () => {
    const { session, renderInspector } = setup('role.buyer');
    renderInspector();

    const picker = screen.getByLabelText('所属上下文');

    fireEvent.change(picker, { target: { value: 'context.catalog' } });

    expect(session.getGraph().getEntity('role.buyer')).toMatchObject({
      contextRef: 'context.catalog',
    });
  });

  it('omits responsibility fields for roles', () => {
    setup('role.buyer').renderInspector();

    expect(screen.queryByText('责任锚定')).not.toBeInTheDocument();
    expect(screen.getByText('基础信息')).toBeInTheDocument();
  });

  it('opens the wide ledger studio from the attribute grid', () => {
    setup('evidence.contract').renderInspector();

    fireEvent.click(screen.getByText('⛶ 工作台'));

    expect(
      screen.getByRole('dialog', { name: '关键数据台账工作台' }),
    ).toBeInTheDocument();
  });

  it('opens the ledger studio with Alt+L', () => {
    setup('evidence.contract').renderInspector();

    fireEvent.keyDown(window, { key: 'l', altKey: true, code: 'KeyL' });

    expect(
      screen.getByRole('dialog', { name: '关键数据台账工作台' }),
    ).toBeInTheDocument();
  });

  it('rejects an unknown selection without crashing', () => {
    setup('evidence.missing').renderInspector();

    expect(
      screen.getByText('选择画布上的业务对象查看属性。'),
    ).toBeInTheDocument();
  });
});
