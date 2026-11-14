import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createGraphLayout,
  toSerializableLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import { createDomainGraph } from '@evidence-poc/evidence-model-core/browser';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import {
  LiveApiProvider,
  type LiveRouteBinding,
} from './LiveApiContext';
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
      {
        name: 'status',
        label: '状态',
        meaning: '请求状态',
        valueType: 'string',
      },
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

  it('badges the party that signs a non-contract evidence', () => {
    const document = createDesktopFixture();
    const summaries = summarizeCards(document);

    expect(summaries.get('evidence.request')!.partyBadge).toEqual({
      participants: [
        { id: 'participant.supplier', label: '供应方企业（Supplier Org）' },
      ],
      label: '供应方企业（Supplier Org）',
      total: 1,
    });
    // A contract states both sides by its roles; a badge would name only one.
    expect(summaries.get('evidence.contract')!.partyBadge).toBeNull();
    expect(summaries.get('participant.buyer')!.partyBadge).toBeNull();
  });

  it('counts extra players instead of hiding them', () => {
    const document = createDesktopFixture();
    document.entities.push({
      type: 'entity',
      id: 'participant.supplier-agent',
      category: 'participant',
      kind: 'party',
      label: '供应方代理（Supplier Agent）',
    });
    document.relationships.push({
      type: 'relationship',
      id: 'relation.agent-plays-supplier',
      kind: 'plays_role',
      sourceRef: 'participant.supplier-agent',
      targetRef: 'role.supplier',
      label: '供应方代理扮演供应方',
    });

    const badge = summarizeCards(document).get('evidence.request')!.partyBadge!;

    expect(badge.label).toBe('供应方企业（Supplier Org）');
    expect(badge.total).toBe(2);
    expect(badge.participants.map(({ id }) => id)).toEqual([
      'participant.supplier',
      'participant.supplier-agent',
    ]);
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
  it('shows projected routes, distinguishes internal operations and hides stale bindings', () => {
    const document = createDesktopFixture();
    const node = createGraphLayout(createDomainGraph(document)).nodeById.get(
      'evidence.request',
    )!;
    const props = {
      node,
      selected: false,
      dimmed: false,
      highlighted: false,
      viewMode: 'simplified' as const,
      summary: summarizeCards(document).get(node.nodeId)!,
      onHover: vi.fn(),
      onSelect: vi.fn(),
    };
    const analysis = { bindings: [] as LiveRouteBinding[] };
    analysis.bindings = [
      {
        id: 'route.request',
        entityRef: node.nodeId,
        method: 'POST',
        path: '/test/request',
        roleRefs: [],
        exposure: 'internal',
        fields: [],
      },
    ];
    const { rerender } = render(
      <LiveApiProvider analysis={analysis} stale={false}>
        <NodeCard {...props} />
      </LiveApiProvider>,
    );
    expect(screen.getByText('内部 · POST /test/request')).toBeInTheDocument();
    rerender(
      <LiveApiProvider analysis={analysis} stale={true}>
        <NodeCard {...props} />
      </LiveApiProvider>,
    );
    expect(screen.getByText('API 待刷新')).toBeInTheDocument();
    expect(screen.queryByText('内部 · POST /test/request')).toBeNull();
    rerender(
      <LiveApiProvider analysis={{ bindings: [] }} stale={false}>
        <NodeCard {...props} />
      </LiveApiProvider>,
    );
    expect(screen.getByText('No API Exposure')).toBeInTheDocument();
  });
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
      within(card).getByLabelText('当事人：供应方企业（Supplier Org）'),
    ).toHaveTextContent('供应方企业（Supplier Org）');
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
    // The signer survives the compact reading: it is a fact, not decoration.
    expect(
      screen.getByLabelText('当事人：供应方企业（Supplier Org）'),
    ).toBeInTheDocument();
    expect(card).toHaveStyle({ height: '82px' });
    expect(
      toSerializableLayout(
        createGraphLayout(graph, { viewMode: 'simplified' }),
      ).nodes.find((placed) => placed.nodeId === node.nodeId)!.box,
    ).toEqual(compact.box);
  });
});
