import { useMemo, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateZoomToFit,
  computeContextScope,
  createGraphLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { CanvasViewport } from './CanvasViewport';

const document = createDesktopFixture();
const graph = createDomainGraph(document);
const layout = createGraphLayout(graph, { viewMode: 'standard' });

const setup = () => {
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
          <button type="button" onClick={controls.resetZoom}>
            {`缩放 ${Math.round(controls.zoom * 100)}%`}
          </button>
        )}
        onSelect={onSelect}
        onClearSelection={onClearSelection}
      />
    );
  };
  return { ...render(<Harness />), onSelect, onClearSelection };
};

// Give the viewport a real size without relying on jsdom layout.
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: (entries: unknown[]) => void) {}
      observe() {
        this.callback([{ contentRect: { width: 900, height: 600 } }]);
      }
      disconnect() {
        return undefined;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('CanvasViewport scope controls', () => {
  it('fits the canonical scope, dims unrelated objects and restores the full board', () => {
    const { container, onSelect } = setup();
    const world = container.querySelector(
      '[data-region="canvas-world"]',
    ) as HTMLElement;
    const before = world.style.transform;
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.procurement' },
    });
    const scope = computeContextScope(layout, 'context.procurement')!;
    const expected = calculateZoomToFit(scope.bounds, {
      width: 876,
      height: 576,
    });
    expect(world.style.transform).toBe(
      `translate(${expected.panX}px, ${expected.panY}px) scale(${expected.zoom})`,
    );
    expect(world.style.transition).toBe('transform 180ms ease-out');
    const outside = container.querySelector('[data-node-id="role.inventory"]')!;
    expect(outside).toHaveStyle({ opacity: '0.15', pointerEvents: 'none' });
    expect(outside).toHaveAttribute('tabindex', '-1');
    fireEvent.click(outside);
    fireEvent.keyDown(outside, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
    const neighbour = container.querySelector(
      '[data-node-id="participant.buyer"]',
    )!;
    expect(neighbour).not.toHaveAttribute('aria-disabled');
    fireEvent.click(neighbour);
    expect(onSelect).toHaveBeenCalledWith('participant.buyer');
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: '' },
    });
    expect(world.style.transform).toBe(before);
    expect(outside).not.toHaveAttribute('aria-disabled');
  });

  it('does not pan, marquee, zoom or clear selection when using viewport furniture', () => {
    const { container, onClearSelection } = setup();
    const world = container.querySelector(
      '[data-region="canvas-world"]',
    ) as HTMLElement;
    const before = world.style.transform;
    const select = screen.getByLabelText('聚焦范围');
    fireEvent.pointerDown(select, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(select, { clientX: 500, clientY: 400 });
    fireEvent.pointerUp(select);
    fireEvent.click(select);
    fireEvent.wheel(select, { deltaY: 60 });
    fireEvent.click(screen.getByRole('button', { name: '图例说明' }));
    fireEvent.click(screen.getByRole('button', { name: /缩放 \d+%/ }));
    expect(onClearSelection).not.toHaveBeenCalled();
    expect(before).not.toBe('');
    expect(world.style.transform).toContain('scale(1)');
  });

  it('keeps wheel zoom and pan active outside controls', () => {
    const { container } = setup();
    const world = container.querySelector(
      '[data-region="canvas-world"]',
    ) as HTMLElement;
    const viewport = container.querySelector(
      '[data-region="canvas-viewport"]',
    )!;
    const before = world.style.transform;
    fireEvent.wheel(viewport, { deltaY: 30 });
    expect(world.style.transform).not.toBe(before);
    const panned = world.style.transform;
    fireEvent.wheel(viewport, {
      deltaY: -60,
      ctrlKey: true,
      clientX: 100,
      clientY: 100,
    });
    expect(world.style.transform).not.toBe(panned);
  });

  it('excludes faded objects from marquee selection and still supports space-drag pan', () => {
    const { container, onSelect } = setup();
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    const viewport = container.querySelector(
      '[data-region="canvas-viewport"]',
    )!;
    fireEvent.pointerDown(viewport, {
      button: 0,
      pointerId: 1,
      clientX: -10000,
      clientY: -10000,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 1,
      clientX: 10000,
      clientY: 10000,
    });
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith('role.inventory');
    const world = container.querySelector(
      '[data-region="canvas-world"]',
    ) as HTMLElement;
    const before = world.style.transform;
    fireEvent.keyDown(window, { code: 'Space' });
    fireEvent.pointerDown(viewport, {
      button: 0,
      pointerId: 2,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 2,
      clientX: 150,
      clientY: 120,
    });
    fireEvent.pointerUp(viewport, { pointerId: 2 });
    fireEvent.keyUp(window, { code: 'Space' });
    expect(world.style.transform).not.toBe(before);
  });

  it('does not replay an old navigation request after a model/layout refresh', () => {
    const props = {
      document,
      graph,
      layout,
      viewMode: 'standard' as const,
      selection: { nodeId: null, attributeName: null },
      focusRequest: { nodeId: 'evidence.request', token: 1 },
      zoomCommand: null,
      onSelect: vi.fn(),
      onClearSelection: vi.fn(),
    };
    const { container, rerender } = render(<CanvasViewport {...props} />);
    const viewport = container.querySelector(
      '[data-region="canvas-viewport"]',
    )!;
    const world = container.querySelector(
      '[data-region="canvas-world"]',
    ) as HTMLElement;
    fireEvent.wheel(viewport, { deltaY: 50 });
    const panned = world.style.transform;
    rerender(
      <CanvasViewport
        {...props}
        layout={createGraphLayout(graph, { viewMode: 'standard' })}
      />,
    );
    expect(world.style.transform).toBe(panned);
  });

  it('honours reduced motion while still fitting a changed scope', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { container } = setup();
    fireEvent.change(screen.getByLabelText('聚焦范围'), {
      target: { value: 'context.catalog' },
    });
    expect(
      (container.querySelector('[data-region="canvas-world"]') as HTMLElement)
        .style.transition,
    ).toBe('');
  });
});
