import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import {
  computeGraphLayout,
  EMPTY_GRAPH_LAYOUT,
  type DomainGraphLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import { useGraphLayout } from './useGraphLayout';

vi.mock('@evidence-poc/evidence-canvas-interaction', async (original) => ({
  ...(await original<
    typeof import('@evidence-poc/evidence-canvas-interaction')
  >()),
  computeGraphLayout: vi.fn(),
}));
const graphOf = () => createDomainGraph(createDesktopFixture());
const layout: DomainGraphLayout = {
  ...EMPTY_GRAPH_LAYOUT,
  nodes: [],
  contextGroups: [],
  nodeById: new Map(),
  contextGroupById: new Map(),
  edgeById: new Map(),
};
const deferred = () => {
  let resolve!: (layout: DomainGraphLayout) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<DomainGraphLayout>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('useGraphLayout', () => {
  it('discards stale document and density results and does not rerun for selection changes', async () => {
    const first = deferred();
    const second = deferred();
    const third = deferred();
    const compute = vi.mocked(computeGraphLayout).mockReset();
    compute
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const graph = graphOf();
    const { result, rerender } = renderHook(
      ({ graph, viewMode }) => useGraphLayout(graph, viewMode),
      {
        initialProps: {
          graph,
          viewMode: 'simplified' as 'simplified' | 'standard',
        },
      },
    );
    expect(result.current.layoutPending).toBe(true);
    rerender({ graph: graphOf(), viewMode: 'simplified' });
    await act(async () => {
      second.resolve(layout);
    });
    expect(result.current.layout).toBe(layout);
    await act(async () => {
      first.resolve({ ...layout });
    });
    expect(result.current.layout).toBe(layout);
    const currentGraph = graphOf();
    rerender({ graph: currentGraph, viewMode: 'standard' });
    expect(result.current.layoutPending).toBe(true);
    const standard = { ...layout };
    await act(async () => {
      third.resolve(standard);
    });
    expect(result.current.layout).toBe(standard);
    rerender({ graph: currentGraph, viewMode: 'standard' });
    expect(compute).toHaveBeenCalledTimes(3);
  });
  it('reports failures without unhandled rejections and recovers on the next layout', async () => {
    vi.mocked(computeGraphLayout)
      .mockReset()
      .mockRejectedValueOnce(new Error('Cyclic Context hierarchy'))
      .mockResolvedValueOnce(layout);
    const { result, rerender } = renderHook(
      ({ graph }) => useGraphLayout(graph, 'standard'),
      { initialProps: { graph: graphOf() } },
    );
    await waitFor(() =>
      expect(result.current.layoutError).toContain('Cyclic Context'),
    );
    expect(result.current.layoutPending).toBe(false);
    rerender({ graph: graphOf() });
    await waitFor(() => expect(result.current.layout).toBe(layout));
    expect(result.current.layoutError).toBeNull();
  });
  it('ignores results and errors after unmount', async () => {
    const pending = deferred();
    vi.mocked(computeGraphLayout)
      .mockReset()
      .mockReturnValueOnce(pending.promise);
    const { unmount } = renderHook(() => useGraphLayout(graphOf(), 'standard'));
    unmount();
    await act(async () => {
      pending.reject(new Error('late error'));
    });
  });
});
