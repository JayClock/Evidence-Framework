import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  computeGraphLayout,
  toSerializableLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { LiveApiProvider, type LiveRouteBinding } from './LiveApiContext';
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
  it('distinguishes a rights window from a fixed confirmation stamp and exposes CEL guards', async () => {
    const document = createDesktopFixture();
    const layout = await computeGraphLayout(createDomainGraph(document), {
      layoutMode: 'swimlane',
    });
    const summaries = summarizeCards(document);
    const props = {
      selected: false,
      dimmed: false,
      highlighted: false,
      viewMode: 'standard' as const,
      onHover: vi.fn(),
      onSelect: vi.fn(),
    };
    const { container, rerender } = render(
      <NodeCard
        {...props}
        node={layout.nodeById.get('evidence.request')!}
        summary={summaries.get('evidence.request')!}
      />,
    );
    expect(screen.getByText('权利方主张')).toHaveAttribute(
      'title',
      expect.stringContaining('主张方：供应方企业'),
    );
    expect(
      container.querySelector(
        '[data-start-attribute="started_at"][data-end-attribute="expired_at"]',
      ),
    ).not.toBeNull();
    expect(container.querySelector('[data-card-rule]')).toHaveAttribute(
      'title',
      expect.stringContaining('confirmation.confirmed_at'),
    );
    rerender(
      <NodeCard
        {...props}
        node={layout.nodeById.get('evidence.confirmation')!}
        summary={summaries.get('evidence.confirmation')!}
      />,
    );
    expect(screen.getByLabelText(/^盖章确认：/)).toHaveAttribute(
      'data-time-attribute',
      'confirmed_at',
    );
    expect(container.querySelector('[data-rights-claim]')).toBeNull();
    expect(container.querySelector('[data-node-id]')).toHaveStyle({
      borderRightWidth: '2px',
    });
  });

  it('renders compact domain capabilities with modeled parameters, without choosing a conflicting sample', async () => {
    const document = createDesktopFixture();
    document.entities.push({
      type: 'entity',
      id: 'calculator',
      category: 'participant',
      kind: 'thing',
      domainRole: 'calculator',
      label: '罚息测算',
      attributes: [
        {
          name: 'daily_rate',
          label: '日罚息',
          meaning: '合同日费率',
          valueType: 'decimal',
        },
      ],
      examples: [{ label: '标准', value: { daily_rate: 0.0005 } }],
    });
    const layout = await computeGraphLayout(createDomainGraph(document));
    const node = layout.nodeById.get('calculator')!;
    const props = {
      node,
      summary: summarizeCards(document).get(node.nodeId)!,
      selected: false,
      dimmed: false,
      highlighted: false,
      viewMode: 'standard' as const,
      onHover: vi.fn(),
      onSelect: vi.fn(),
    };
    const { container, rerender } = render(<NodeCard {...props} />);
    expect(
      container.querySelector('[data-capability="calculator"]'),
    ).not.toBeNull();
    expect(screen.getByText('日罚息：0.05%')).toBeInTheDocument();
    node.entity.examples!.push({
      label: '另一个方案',
      value: { daily_rate: 0.001 },
    });
    rerender(<NodeCard {...props} />);
    expect(screen.queryByText('日罚息：0.05%')).toBeNull();
    expect(
      container.querySelector('[data-capability="calculator"]'),
    ).toHaveTextContent('日罚息');
  });

  it('shows projected routes, distinguishes internal operations and hides stale bindings', async () => {
    const document = createDesktopFixture();
    const node = (
      await computeGraphLayout(createDomainGraph(document))
    ).nodeById.get('evidence.request')!;
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
  it('keeps an accessible responsibility in bounds and hides detail only in simplified mode', async () => {
    const document = createDesktopFixture();
    const graph = createDomainGraph(document);
    const node = (
      await computeGraphLayout(graph, {
        viewMode: 'standard',
      })
    ).nodeById.get('evidence.request')!;
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

    const compact = (
      await computeGraphLayout(graph, {
        viewMode: 'simplified',
      })
    ).nodeById.get(node.nodeId)!;
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
        await computeGraphLayout(graph, { viewMode: 'simplified' }),
      ).nodes.find((placed) => placed.nodeId === node.nodeId)!.box,
    ).toEqual(compact.box);
  });
});
