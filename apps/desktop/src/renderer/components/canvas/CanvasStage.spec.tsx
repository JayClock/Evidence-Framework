import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDomainGraph } from '@evidence-poc/evidence-model-core/browser';
import {
  createGraphLayout,
  createLifecycleSwimlaneLayout,
} from '@evidence-poc/evidence-canvas-interaction';

import { CanvasStage } from './CanvasStage';
import { createDesktopFixture } from '../../test-support/modelFixture';

const setup = (
  overrides: Partial<React.ComponentProps<typeof CanvasStage>> = {},
) => {
  const document = createDesktopFixture();
  const graph = createDomainGraph(document);
  const layout = createGraphLayout(graph);
  const props: React.ComponentProps<typeof CanvasStage> = {
    layout,
    document,
    viewMode: 'simplified',
    selection: { nodeId: null, attributeName: null },
    hoveredEdgeId: null,
    hoveredContextId: null,
    highlightedNodeIds: new Set<string>(),
    highlightedEdgeIds: new Set<string>(),
    highlightedContextIds: new Set<string>(),
    dimmed: false,
    marquee: null,
    onHoverNode: vi.fn(),
    onHoverEdge: vi.fn(),
    onHoverContext: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };

  return { ...render(<CanvasStage {...props} />), layout, props };
};

describe('CanvasStage', () => {
  it('renders one card per business object and one card per context', () => {
    const { container, layout } = setup();

    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(
      layout.nodes.length,
    );
    expect(container.querySelectorAll('[data-context-id]')).toHaveLength(
      layout.contextGroups.length,
    );
  });

  it('keeps context labels out of the object list', () => {
    const { container } = setup();

    expect(
      screen.getByRole('group', { name: '商品采购（Procurement）' }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-node-id="context.procurement"]'),
    ).toBeNull();
  });

  it('dims objects and edges that are not highlighted', () => {
    const { container } = setup({
      dimmed: true,
      highlightedNodeIds: new Set(['evidence.request']),
      highlightedEdgeIds: new Set(),
    });
    const highlighted = container.querySelector(
      '[data-node-id="evidence.request"]',
    );
    const faded = container.querySelector('[data-node-id="evidence.contract"]');

    expect(highlighted?.className).toContain('opacity-100');
    expect(faded?.className).toContain('opacity-20');
    expect(
      container.querySelector(
        '[data-edge-id="relation.confirmation-references-request"]',
      ),
    ).toHaveAttribute('opacity', '0.16');
  });

  it('keeps plays_role routes out of the workshop board until they are pointed at', () => {
    const muted = setup();

    expect(
      muted.container.querySelector(
        '[data-edge-id="relation.buyer-plays-role"]',
      ),
    ).toHaveAttribute('opacity', '0');
    expect(
      muted.container
        .querySelector('[data-edge-id="relation.buyer-plays-role"]')
        ?.getAttribute('style'),
    ).toContain('pointer-events: none');
    // A cited document is not decoration: the reference line stays visible.
    expect(
      muted.container.querySelector(
        '[data-edge-id="relation.confirmation-references-request"]',
      ),
    ).toHaveAttribute('opacity', '1');

    muted.unmount();
    const pointed = setup({
      highlightedEdgeIds: new Set(['relation.buyer-plays-role']),
    });

    expect(
      pointed.container.querySelector(
        '[data-edge-id="relation.buyer-plays-role"]',
      ),
    ).toHaveAttribute('opacity', '1');
  });

  it('draws every route in the hand-off board', () => {
    const { container } = setup({ viewMode: 'standard' });

    expect(
      container.querySelector('[data-edge-id="relation.buyer-plays-role"]'),
    ).toHaveAttribute('opacity', '1');
    expect(
      container.querySelector(
        '[data-edge-id="relation.buyer-plays-role"] polyline',
      ),
    ).toHaveAttribute('marker-end', 'url(#evidence-arrow)');
  });

  it('marks the selected object with a ring', () => {
    const { container } = setup({
      selection: { nodeId: 'evidence.request', attributeName: null },
    });

    expect(
      container.querySelector('[data-node-id="evidence.request"]')?.className,
    ).toContain('ring-2');
  });

  it('draws one polyline per relationship and a dashed fulfillment boundary', () => {
    const { container } = setup();

    expect(container.querySelectorAll('[data-edge-id] polyline')).toHaveLength(
      3,
    );
    expect(container.querySelectorAll('polyline[data-pair-link]')).toHaveLength(
      1,
    );
    expect(
      container.querySelector(
        'polyline[data-pair-link="evidence.confirmation"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-edge-id="relation.buyer-plays-role"] polyline',
      ),
    ).toHaveAttribute('stroke-dasharray', '4 4');
    expect(
      container.querySelector(
        '[data-edge-id="relation.confirmation-references-request"] polyline',
      ),
    ).not.toHaveAttribute('stroke-dasharray');
    expect(
      container.querySelectorAll('rect[stroke-dasharray="6 4"]'),
    ).toHaveLength(1);
  });

  it('shows cardinality in standard mode or for an active relationship', () => {
    const document = createDesktopFixture();
    document.relationships[2] = {
      ...document.relationships[2]!,
      sourceCardinality: { min: 1, max: 1 },
      targetCardinality: { min: 0, max: 'many' },
    };
    const graph = createDomainGraph(document);
    const layout = createGraphLayout(graph);

    const { rerender, container } = render(
      <CanvasStage
        layout={layout}
        document={document}
        viewMode="simplified"
        selection={{ nodeId: null, attributeName: null }}
        hoveredEdgeId={null}
        hoveredContextId={null}
        highlightedNodeIds={new Set()}
        highlightedEdgeIds={new Set()}
        highlightedContextIds={new Set()}
        dimmed={false}
        marquee={null}
        onHoverNode={vi.fn()}
        onHoverEdge={vi.fn()}
        onHoverContext={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText('1..1')).toBeNull();

    rerender(
      <CanvasStage
        layout={layout}
        document={document}
        viewMode="standard"
        selection={{ nodeId: null, attributeName: null }}
        hoveredEdgeId={null}
        hoveredContextId={null}
        highlightedNodeIds={new Set()}
        highlightedEdgeIds={new Set()}
        highlightedContextIds={new Set()}
        dimmed={false}
        marquee={null}
        onHoverNode={vi.fn()}
        onHoverEdge={vi.fn()}
        onHoverContext={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('1..1')).toBeInTheDocument();
    expect(screen.getByText('0..N')).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-cardinality-end] rect'),
    ).toHaveLength(2);
    const label = container.querySelector('[data-cardinality-end="source"]');
    expect(label).toHaveTextContent('源端基数');
  });

  it('shows simplified-mode cardinality on hover and arrows only for role playing', () => {
    const document = createDesktopFixture();
    document.relationships[2]!.targetCardinality = { min: 1, max: 'many' };
    const { container } = setup({
      document,
      layout: createGraphLayout(createDomainGraph(document)),
      hoveredEdgeId: document.relationships[2]!.id,
    });
    expect(screen.getByText('1..N')).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-edge-id="relation.buyer-plays-role"] polyline',
      ),
    ).toHaveAttribute('marker-end', 'url(#evidence-arrow)');
    expect(
      container.querySelector(
        '[data-edge-id="relation.confirmation-references-request"] polyline',
      ),
    ).not.toHaveAttribute('marker-end');
    expect(container.querySelector('[data-pair-link]')).not.toHaveAttribute(
      'marker-end',
    );
  });

  it('draws cross-Context references as dashed, arrowless relationships', () => {
    const document = createDesktopFixture();
    document.relationships.push({
      type: 'relationship',
      id: 'relation.cross-context',
      kind: 'references',
      sourceRef: 'role.inventory',
      targetRef: 'evidence.request',
      label: '库存引用请求',
    });
    const { container } = setup({
      document,
      layout: createGraphLayout(createDomainGraph(document)),
    });
    const line = container.querySelector(
      '[data-edge-id="relation.cross-context"] polyline',
    );
    expect(line).toHaveAttribute('stroke-dasharray', '4 4');
    expect(line).not.toHaveAttribute('marker-end');
  });

  it('selects a node on click and on Enter', () => {
    const onSelect = vi.fn();
    const { container } = setup({ onSelect });
    const node = container.querySelector(
      '[data-node-id="evidence.contract"]',
    ) as HTMLElement;

    node.click();
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith('evidence.contract');
  });

  it('rings the objects a pending patch touches without moving the layout', () => {
    const { container, layout } = setup({
      overlay: {
        marks: new Map([['evidence.contract', 'removed' as const]]),
      },
    });

    expect(container.querySelector('[data-node-id]')).not.toBeNull();
    expect(
      container.querySelector('[data-overlay-node-id="evidence.contract"]'),
    ).not.toBeNull();
    expect(
      screen.getByLabelText('本次补丁删除 采购协议（Procurement Contract）'),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(
      layout.nodes.length,
    );
  });

  it('adds no overlay when no patch is pending', () => {
    const { container } = setup();

    expect(container.querySelector('[data-overlay-node-id]')).toBeNull();
  });

  it('draws the four stage columns when given a lifecycle layout', () => {
    const document = createDesktopFixture();
    const lifecycle = createLifecycleSwimlaneLayout(
      createDomainGraph(document),
    );
    const { container } = render(
      <CanvasStage
        layout={lifecycle}
        document={document}
        viewMode="simplified"
        selection={{ nodeId: null, attributeName: null }}
        hoveredEdgeId={null}
        hoveredContextId={null}
        highlightedNodeIds={new Set<string>()}
        highlightedEdgeIds={new Set<string>()}
        highlightedContextIds={new Set<string>()}
        dimmed={false}
        marquee={null}
        onHoverNode={vi.fn()}
        onHoverEdge={vi.fn()}
        onHoverContext={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(
      container.querySelector('[data-region="lifecycle-banner"]'),
    ).not.toBeNull();
    expect(container.querySelectorAll('[data-swimlane-stage]')).toHaveLength(4);
  });

  it('omits the banner when the layout is not lane-based', () => {
    const { container } = setup();

    expect(
      container.querySelector('[data-region="lifecycle-banner"]'),
    ).toBeNull();
  });

  it('draws a request as a window and a confirmation as a stamp', () => {
    const { container } = setup();

    expect(
      container.querySelector(
        '[data-node-id="evidence.request"][data-node-shape="interval"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-node-id="evidence.request"] [data-node-shape="interval"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-node-id="evidence.contract"][data-node-shape="moment"]',
      ),
    ).not.toBeNull();
  });
});
