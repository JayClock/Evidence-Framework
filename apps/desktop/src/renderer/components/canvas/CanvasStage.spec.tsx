import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDomainGraph } from '@evidence-poc/evidence-model-core/browser';
import { createGraphLayout } from '@evidence-poc/evidence-canvas-interaction';

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
      container.querySelector('[data-edge-id="relation.buyer-plays-role"]'),
    ).toHaveAttribute('opacity', '0.16');
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

    expect(container.querySelectorAll('polyline')).toHaveLength(3);
    expect(
      container.querySelector(
        '[data-edge-id="relation.buyer-plays-role"] polyline',
      ),
    ).toHaveAttribute('stroke-dasharray', '5 4');
    expect(
      container.querySelector(
        '[data-edge-id="relation.confirmation-references-request"] polyline',
      ),
    ).not.toHaveAttribute('stroke-dasharray');
    expect(
      container.querySelectorAll('rect[stroke-dasharray="6 4"]'),
    ).toHaveLength(1);
  });

  it('shows cardinality only in standard mode', () => {
    const document = createDesktopFixture();
    document.relationships[2] = {
      ...document.relationships[2]!,
      sourceCardinality: { min: 1, max: 1 },
      targetCardinality: { min: 0, max: 'many' },
    };
    const graph = createDomainGraph(document);
    const layout = createGraphLayout(graph);

    const { rerender } = render(
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

  it('draws the compared branch without moving the active layout', () => {
    const reference = createGraphLayout(
      createDomainGraph(createDesktopFixture()),
    );
    const ghost = { ...reference.nodes[0]!, nodeId: 'evidence.statement' };
    const { container, layout } = setup({
      overlay: {
        marks: new Map([['evidence.contract', 'removed' as const]]),
        ghosts: [ghost],
      },
    });

    expect(container.querySelector('[data-node-id]')).not.toBeNull();
    expect(
      container.querySelector('[data-overlay-node-id="evidence.contract"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-ghost-node-id="evidence.statement"]'),
    ).not.toBeNull();
    expect(
      screen.getByLabelText('对比分支已删除 采购协议（Procurement Contract）'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/对比分支新增/),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(
      layout.nodes.length,
    );
  });

  it('adds no overlay when no comparison is open', () => {
    const { container } = setup();

    expect(container.querySelector('[data-ghost-node-id]')).toBeNull();
    expect(container.querySelector('[data-overlay-node-id]')).toBeNull();
  });
});
