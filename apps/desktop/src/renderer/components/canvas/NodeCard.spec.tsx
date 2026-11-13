import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createGraphLayout,
  toSerializableLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import { createDomainGraph } from '@evidence-poc/evidence-model-core/browser';
import { createDesktopFixture } from '../../test-support/modelFixture';
import { NodeCard } from './NodeCard';
import { summarizeCards } from './cardSummary';

describe('business card summaries', () => {
  it('uses the declared role, key-data first and distinct explicit rules', () => {
    const document = createDesktopFixture();
    const request = document.entities.find(
      (entity) => entity.id === 'evidence.request',
    )!;
    request.attributes!.push(
      { name: 'note', label: '备注', meaning: '补充说明', valueType: 'string' },
      {
        name: 'amount',
        label: '金额',
        meaning: '请求金额',
        valueType: 'int',
        keyData: true,
        derivedByRuleRef: 'rule.amount',
      },
      { name: 'status', label: '状态', meaning: '请求状态', valueType: 'string' },
    );
    document.rules.push({
      ...document.rules[0]!,
      id: 'rule.amount',
      kind: 'derivation',
      label: '金额派生',
      target: { entityRef: request.id, attribute: 'amount' },
    });
    const summary = summarizeCards(document).get(request.id)!;
    expect(summary.responsibility).toBe('供应方（Supplier）');
    expect(summary.attributes).toEqual(['开始时间', '截止时间', '金额']);
    expect(summary.remainingAttributes).toBe(2);
    expect(summary.rules).toEqual([
      '交付完成（Delivery Completion）',
      '金额派生',
    ]);
    expect(
      summarizeCards(document).get('participant.buyer')!.responsibility,
    ).toBeNull();
  });

  it('shows the full unresolved responsibility ref rather than guessing from another field', () => {
    const document = createDesktopFixture();
    const request = document.entities.find(
      (entity) => entity.id === 'evidence.request',
    )!;
    if (request.category === 'evidence')
      request.responsibleRoleRef = 'role.missing';
    expect(summarizeCards(document).get(request.id)!.responsibility).toBe(
      'role.missing',
    );
    expect(
      summarizeCards(document).get('evidence.contract')!.responsibility,
    ).toBeNull();
  });
});

describe('NodeCard modes', () => {
  it('keeps an accessible responsibility in bounds and hides detail only in simplified mode', () => {
    const document = createDesktopFixture();
    const graph = createDomainGraph(document);
    const node = createGraphLayout(graph, {
      viewMode: 'standard',
    }).nodeById.get('evidence.request')!;
    const props = {
      node,
      selected: false,
      dimmed: false,
      highlighted: false,
      summary: summarizeCards(document).get(node.nodeId)!,
      onHover: vi.fn(),
      onSelect: vi.fn(),
    };
    const { rerender } = render(<NodeCard {...props} viewMode="standard" />);
    const card = screen.getByRole('button', {
      name: '交付请求（Delivery Request）（履约请求）',
    });
    expect(
      within(card).getByLabelText('责任角色：供应方（Supplier）'),
    ).not.toHaveClass('absolute');
    expect(
      within(card).getByText('时间：开始时间 → 截止时间'),
    ).toBeInTheDocument();
    expect(within(card).getByText('规则 1')).toHaveAttribute(
      'title',
      '交付完成（Delivery Completion）',
    );
    expect(card).toHaveStyle({ height: '156px' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(props.onSelect).toHaveBeenCalledWith(node.nodeId);

    const compact = createGraphLayout(graph, {
      viewMode: 'simplified',
    }).nodeById.get(node.nodeId)!;
    rerender(<NodeCard {...props} node={compact} viewMode="simplified" />);
    expect(screen.queryByText('规则 1')).toBeNull();
    expect(
      screen.getByLabelText('责任角色：供应方（Supplier）'),
    ).toBeInTheDocument();
    expect(card).toHaveStyle({ height: '82px' });
    expect(
      toSerializableLayout(
        createGraphLayout(graph, { viewMode: 'simplified' }),
      ).nodes.find((placed) => placed.nodeId === node.nodeId)!.box,
    ).toEqual(compact.box);
  });
});
