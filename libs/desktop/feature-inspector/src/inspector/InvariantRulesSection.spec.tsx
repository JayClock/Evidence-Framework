import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createModelSession,
  updateRuleMutator,
} from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

import { RightInspector } from '../RightInspector';
import {
  blurEditor,
  readExpression,
  typeExpression,
} from '../testing/codeEditor';

const id = 'rule.quantity-invariant';
const expression = 'contract.quantity > 0';
const editorLabel = `${id} CEL 表达式`;

const setup = () => {
  const document = createDesktopFixture();
  const contract = document.entities.find(
    (entity) => entity.id === 'evidence.contract',
  )!;
  contract.sourceSnippet = { text: '采购数量应为正数。' };
  contract.attributes!.push({
    name: 'quantity',
    label: '采购数量',
    meaning: '合同约定采购数量。',
    valueType: 'int',
  });
  document.rules.push({
    type: 'rule',
    id,
    kind: 'invariant',
    label: '采购数量',
    description: '采购数量应为正数。',
    contextRef: 'context.procurement',
    resultType: 'bool',
    expression,
    bindings: {
      contract: { ref: 'evidence.contract' },
      otherAlias: { ref: 'evidence.contract' },
    },
  });
  const session = createModelSession({ document });
  const inspector = (nodeId = 'evidence.contract') => (
    <RightInspector
      graph={session.getGraph()}
      session={session}
      selection={{ nodeId, attributeName: null }}
    />
  );
  const view = render(inspector());
  const select = (nodeId?: string) => view.rerender(inspector(nodeId));
  const edit = () =>
    fireEvent.click(screen.getByRole('button', { name: `编辑 CEL ${id}` }));
  const apply = () =>
    fireEvent.click(screen.getByRole('button', { name: '应用 CEL' }));
  return { session, select, edit, apply };
};

describe('entity invariants', () => {
  it('reads only bound invariants once, and shows only modeled provenance', () => {
    const { select } = setup();
    expect(screen.getAllByText(id)).toHaveLength(1);
    expect(screen.getByText('未记录定位信息')).toBeVisible();
    select('evidence.request');
    expect(screen.queryByRole('region', { name: '依据条款原文' })).toBeNull();
    expect(screen.getByText('未声明不变量')).toBeVisible();
  });

  it.each([
    '',
    'contract.quantity >',
    'wrong.quantity > 0',
    'contract.unknown > 0',
  ])('rejects the invalid draft %j', (draft) => {
    const { session, edit, apply } = setup();
    edit();
    typeExpression(editorLabel, draft);
    apply();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(session.getGraph().getRule(id)?.expression).toBe(expression);
    expect(session.canUndo()).toBe(false);
  });

  it('writes only on apply and records a single undo step', () => {
    const { session, edit, apply } = setup();
    edit();
    typeExpression(editorLabel, 'contract.quantity > 1');
    blurEditor(editorLabel);
    expect(session.canUndo()).toBe(false);
    expect(screen.getByText('本地检查通过')).toBeVisible();
    apply();
    expect(session.getGraph().getRule(id)?.expression).toBe(
      'contract.quantity > 1',
    );
    expect(session.getGraph().getRule(id)?.bindings).toHaveProperty(
      'otherAlias',
    );
    session.undo();
    expect(session.getGraph().getRule(id)?.expression).toBe(expression);
    expect(session.canUndo()).toBe(false);
  });

  it('discards unapplied drafts on cancel and entity switch', () => {
    const { session, edit, select } = setup();
    edit();
    typeExpression(editorLabel, 'contract.quantity > 1');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    edit();
    expect(readExpression(editorLabel)).toBe(expression);
    typeExpression(editorLabel, 'contract.quantity > 2');
    select('evidence.request');
    select();
    edit();
    expect(readExpression(editorLabel)).toBe(expression);
    expect(session.canUndo()).toBe(false);
  });

  it('keeps a draft across unrelated changes but never replaces a newer rule', () => {
    const { session, edit, select } = setup();
    edit();
    typeExpression(editorLabel, 'contract.quantity > 1');
    session.mutate((draft) => {
      draft.manifest.name = '采购验收';
    });
    select();
    expect(readExpression(editorLabel)).toBe('contract.quantity > 1');
    session.mutate((draft) =>
      updateRuleMutator(draft, id, { expression: 'contract.quantity > 2' }),
    );
    select();
    expect(screen.getByRole('status')).toHaveTextContent('规则已变更');
    expect(screen.queryByRole('button', { name: '应用 CEL' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '放弃草稿' }));
    edit();
    expect(readExpression(editorLabel)).toBe('contract.quantity > 2');
  });
});
