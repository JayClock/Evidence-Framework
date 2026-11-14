import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWorkspaceSplitState } from './useWorkspaceSplitState';
import { useWorkspaceViewMode } from './useWorkspaceViewMode';

/** The real view mode, because the split must not own a second copy of it. */
const setup = () =>
  renderHook(() => {
    const view = useWorkspaceViewMode();
    const split = useWorkspaceSplitState(view.mode, view.setMode);

    return { view, split };
  });

describe('useWorkspaceSplitState', () => {
  it('opens on a named pane and reports itself through the view mode', () => {
    const { result } = setup();

    expect(result.current.split.isSplit).toBe(false);
    expect(result.current.split.activePane).toBe('ledger');

    act(() => result.current.split.openSplit('openapi'));

    expect(result.current.view.mode).toBe('split');
    expect(result.current.split.isSplit).toBe(true);
    expect(result.current.split.activePane).toBe('openapi');
  });

  it('closes back to the graph instead of to the ledger', () => {
    const { result } = setup();

    act(() => result.current.split.openSplit('cel'));
    act(() => result.current.split.closeSplit());

    expect(result.current.view.mode).toBe('graph');
    expect(result.current.split.isSplit).toBe(false);
    // The pane survives closing, so reopening lands where the modeler left.
    expect(result.current.split.activePane).toBe('cel');
  });

  it('toggles without forgetting the pane it was last showing', () => {
    const { result } = setup();

    act(() => result.current.split.toggleSplit());
    expect(result.current.split.activePane).toBe('ledger');

    act(() => result.current.split.setActivePane('simulation'));
    act(() => result.current.split.toggleSplit());
    expect(result.current.split.isSplit).toBe(false);

    act(() => result.current.split.toggleSplit());
    expect(result.current.split.activePane).toBe('simulation');
  });

  it('follows Alt+3 from the view-mode chords', () => {
    const { result } = setup();

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Digit3', altKey: true }),
      );
    });

    expect(result.current.split.isSplit).toBe(true);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Digit1', altKey: true }),
      );
    });
    expect(result.current.split.isSplit).toBe(false);
  });

  it('rotates the split and clamps nothing the panels cannot honour', () => {
    const { result } = setup();

    expect(result.current.split.splitDirection).toBe('horizontal');
    act(() => result.current.split.rotateSplitDirection());
    expect(result.current.split.splitDirection).toBe('vertical');
    act(() => result.current.split.rotateSplitDirection());
    expect(result.current.split.splitDirection).toBe('horizontal');

    act(() => result.current.split.setSplitSize(35));
    expect(result.current.split.splitSize).toBe(35);
  });
});
