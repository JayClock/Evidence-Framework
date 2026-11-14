import { useMemo, useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeContextScope,
  createGraphLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { CanvasViewport } from './CanvasViewport';
import { createDiagnosticIndex } from './diagnosticIndex';

const document = createDesktopFixture();
const graph = createDomainGraph(document);
const layout = createGraphLayout(graph, { viewMode: 'standard' });

const setup = (
  overrides: Partial<React.ComponentProps<typeof CanvasViewport>> = {},
) => {
  const onSelect = vi.fn();
  const onClearSelection = vi.fn();
  const Harness = () => {
    const [scopeId, setScopeId] = useState<string | null>(null);
    const scope = useMemo(
      () => computeContextScope(layout, scopeId),
      [scopeId],
    );
    return (
      <CanvasViewport
        document={document}
        graph={graph}
        layout={layout}
        scope={scope}
        onScopeChange={setScopeId}
        viewMode="standard"
        selection={{ nodeId: null, attributeName: null }}
        focusRequest={null}
        zoomCommand={null}
        hud={(controls) => (
          <button type="button" onClick={controls.fitToContent}>
            {`缩放 ${Math.round(controls.zoom * 100)}%`}
          </button>
        )}
        onSelect={onSelect}
        onClearSelection={onClearSelection}
        {...overrides}
      />
    );
  };
  return { ...render(<Harness />), onSelect, onClearSelection };
};

const viewportTransform = (container: HTMLElement): string =>
  (container.querySelector('.react-flow__viewport') as HTMLElement).style
    .transform;

/*
 * React Flow measures the pane and every node before it can route an edge, and
 * jsdom never lays anything out. This observer reports a real stage size and
 * hands each observed element back, which is the shape React Flow's measurement
 * hook expects; without it the engine renders cards but no edges.
 */
class MeasuredResizeObserver {
  constructor(private readonly callback: (entries: unknown[]) => void) {}

  observe(target: Element): void {
    this.callback([
      { target, contentRect: { width: 900, height: 600 } },
    ]);
  }

  unobserve(): void {
    return undefined;
  }

  disconnect(): void {
    return undefined;
  }
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('ResizeObserver', MeasuredResizeObserver);
});
afterEach(() => vi.unstubAllGlobals());

describe('CanvasViewport', () => {
  it('draws the placed objects, their Contexts and the routed relationships', () => {
    const { container } = setup();

    expect(
      container.querySelector('[data-node-id="evidence.contract"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-node-id="participant.buyer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-edge-id="relation.confirmation-references-request"]'),
    ).not.toBeNull();
    // A fulfillment pair is stated as its own edge, not as a relationship.
    expect(container.querySelector('[data-pair-link]')).not.toBeNull();
    const contexts = [...container.querySelectorAll('[aria-label]')].map(
      (node) => node.getAttribute('aria-label'),
    );
    expect(contexts.some((label) => label?.includes('（Procurement'))).toBe(
      true,
    );
  });

  it('dims unrelated objects when the stage is scoped to one Context', () => {
    const { container, onSelect } = setup();

    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.procurement' },
    });

    const outside = container.querySelector(
      '[data-node-id="role.inventory"]',
    )!;
    expect(outside).toHaveStyle({ opacity: '0.15', pointerEvents: 'none' });
    expect(outside).toHaveAttribute('tabindex', '-1');
    fireEvent.click(outside);
    expect(onSelect).not.toHaveBeenCalled();

    const neighbour = container.querySelector(
      '[data-node-id="participant.buyer"]',
    )!;
    expect(neighbour).not.toHaveAttribute('aria-disabled');
  });

  it('fits the canonical scope and restores the full board', async () => {
    const { container } = setup();
    const before = viewportTransform(container);

    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.procurement' },
    });

    // React Flow owns the transform; the fit maths still comes from the
    // interaction library, so a scoped stage must not keep the old framing.
    await waitFor(() =>
      expect(viewportTransform(container)).not.toBe(before),
    );
    const scoped = viewportTransform(container);

    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: '' },
    });
    await waitFor(() =>
      expect(viewportTransform(container)).not.toBe(scoped),
    );
  });

  it('does not clear the selection when the modeler presses canvas furniture', () => {
    const { onClearSelection } = setup();

    fireEvent.click(screen.getByRole('button', { name: '图例说明' }));
    fireEvent.click(screen.getByRole('button', { name: /缩放 \d+%/ }));

    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it('reveals a target the sidebar or a finding asked for', async () => {
    const props = {
      document,
      graph,
      layout,
      viewMode: 'standard' as const,
      selection: { nodeId: null, attributeName: null },
      focusRequest: null,
      zoomCommand: null,
      onSelect: vi.fn(),
      onClearSelection: vi.fn(),
    };
    const { container, rerender } = render(<CanvasViewport {...props} />);
    const before = viewportTransform(container);

    rerender(
      <CanvasViewport
        {...props}
        focusRequest={{ nodeId: 'evidence.request', token: 1 }}
      />,
    );

    await waitFor(() =>
      expect(viewportTransform(container)).not.toBe(before),
    );
  });

  it('keeps the radar collapsed until it is asked for', () => {
    setup();

    expect(
      window.document.querySelector('[data-testid="rf__minimap"]'),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '展开画布雷达' }));

    expect(
      window.document.querySelector('[data-testid="rf__minimap"]'),
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '收起画布雷达' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('lets the island change the paper the model sits on', () => {
    const Harness = () => (
      <CanvasViewport
        document={document}
        graph={graph}
        layout={layout}
        viewMode="standard"
        selection={{ nodeId: null, attributeName: null }}
        focusRequest={null}
        zoomCommand={null}
        hud={(controls) => (
          <button type="button" onClick={() => controls.onGridChange('none')}>
            {`底纹 ${controls.grid}`}
          </button>
        )}
        onSelect={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );
    render(<Harness />);

    expect(
      window.document.querySelector('.react-flow__background'),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '底纹 dots' }));

    expect(
      window.document.querySelector('.react-flow__background'),
    ).toBeNull();
  });

  it('frames the selected object on a zoom-to-selection command', async () => {
    const props = {
      document,
      graph,
      layout,
      viewMode: 'standard' as const,
      selection: { nodeId: 'evidence.contract', attributeName: null },
      focusRequest: null,
      onSelect: vi.fn(),
      onClearSelection: vi.fn(),
    };
    const { container, rerender } = render(
      <CanvasViewport {...props} zoomCommand={null} />,
    );
    const before = viewportTransform(container);

    rerender(
      <CanvasViewport
        {...props}
        zoomCommand={{ direction: 'selection', token: 1 }}
      />,
    );

    await waitFor(() =>
      expect(viewportTransform(container)).not.toBe(before),
    );
  });

  it('marks the objects a pending patch touches', () => {
    const { container } = setup({
      overlay: {
        marks: new Map([['evidence.contract', 'modified' as const]]),
      },
    });

    expect(
      container.querySelector(
        '[data-overlay-change="modified"][data-overlay-node-id="evidence.contract"]',
      ),
    ).not.toBeNull();
  });

  it('opens the findings of an annotated object', () => {
    const onOpenIssues = vi.fn();
    const index = createDiagnosticIndex(
      {
        timestamp: '2026-11-11T08:00:00.000Z',
        passed: false,
        blockCount: 1,
        warnCount: 0,
        infoCount: 0,
        issues: [
          {
            issueId: 'issue.1',
            severity: 'block',
            source: 'check_fm',
            code: 'FM_TEST',
            message: '缺少责任人',
            targetNodeId: 'evidence.contract',
          },
        ],
        keyDataSummary: {
          totalItems: 0,
          resolvedCount: 0,
          decisionOwedCount: 0,
          unresolvedItems: [],
        },
        isStageGateReady: false,
        unavailableSensors: [],
      },
      document,
    );

    setup({ diagnostics: index, onOpenIssues });
    fireEvent.click(screen.getByLabelText(/evidence.contract：阻塞 1 项/));

    expect(onOpenIssues).toHaveBeenCalledTimes(1);
  });

  it('honours a fit request without replaying it on the next layout', () => {
    const props = {
      document,
      graph,
      layout,
      viewMode: 'standard' as const,
      selection: { nodeId: null, attributeName: null },
      focusRequest: null,
      zoomCommand: null,
      onSelect: vi.fn(),
      onClearSelection: vi.fn(),
    };
    const { container, rerender } = render(<CanvasViewport {...props} />);

    act(() => {
      rerender(
        <CanvasViewport
          {...props}
          zoomCommand={{ direction: 'in', token: 1 }}
        />,
      );
    });
    const zoomed = viewportTransform(container);

    rerender(
      <CanvasViewport
        {...props}
        layout={createGraphLayout(graph, { viewMode: 'standard' })}
        zoomCommand={{ direction: 'in', token: 1 }}
      />,
    );

    expect(viewportTransform(container)).toBe(zoomed);
  });
});
