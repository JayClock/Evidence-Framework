import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWorkspaceViewMode } from './useWorkspaceViewMode';

describe('useWorkspaceViewMode', () => {
  it('defaults to the journey and switches graph layouts with Alt+1/2', () => {
    const { result } = renderHook(useWorkspaceViewMode);
    expect(result.current.mode).toBe('journey');

    fireEvent.keyDown(window, { code: 'Digit2', key: '™', altKey: true });
    expect(result.current.mode).toBe('topology');
    fireEvent.keyDown(window, { code: 'Digit1', altKey: true });
    expect(result.current.mode).toBe('journey');
  });

  it('replaces the graph with the ledger and restores the last graph layout', () => {
    const { result } = renderHook(useWorkspaceViewMode);
    act(() => result.current.setMode('topology'));
    act(() => result.current.toggleLedger());
    expect(result.current.mode).toBe('table');
    expect(result.current.graphMode).toBe('topology');

    act(() => result.current.toggleLedger());
    expect(result.current.mode).toBe('topology');
  });

  it('uses the journey during playback and restores the previous graph layout on exit', () => {
    const { result } = renderHook(useWorkspaceViewMode);
    act(() => result.current.setMode('topology'));
    act(() => result.current.setMode('story'));
    expect(result.current.graphMode).toBe('journey');

    act(() => result.current.returnToGraph());
    expect(result.current.mode).toBe('topology');
  });
});
