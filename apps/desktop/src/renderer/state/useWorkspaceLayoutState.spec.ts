import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWorkspaceLayoutState } from './useWorkspaceLayoutState';

const press = (init: KeyboardEventInit) => {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { ...init, bubbles: true }),
    );
  });
};

describe('useWorkspaceLayoutState', () => {
  it('starts with the rail closed and nothing covering the canvas', () => {
    const { result } = renderHook(() => useWorkspaceLayoutState());

    expect(result.current.activeRailTab).toBeNull();
    expect(result.current.isRailPinned).toBe(false);
    expect(result.current.isProblemsPanelOpen).toBe(false);
    expect(result.current.activeHub).toBeNull();
  });

  it('opens a drawer with Mod+1 and closes it with the same chord', () => {
    const { result } = renderHook(() => useWorkspaceLayoutState());

    press({ key: '1', metaKey: true });
    expect(result.current.activeRailTab).toBe('topology');

    press({ key: '1', metaKey: true });
    expect(result.current.activeRailTab).toBeNull();
  });

  it('puts the diagnostics list under the canvas, not in a drawer', () => {
    const { result } = renderHook(() => useWorkspaceLayoutState());

    press({ key: '2', metaKey: true });

    expect(result.current.isProblemsPanelOpen).toBe(true);
    expect(result.current.activeRailTab).toBeNull();

    press({ key: '2', metaKey: true });
    expect(result.current.isProblemsPanelOpen).toBe(false);
  });

  it('switches drawers instead of stacking them', () => {
    const { result } = renderHook(() => useWorkspaceLayoutState());

    press({ key: '1', metaKey: true });
    press({ key: '4', metaKey: true });

    expect(result.current.activeRailTab).toBe('copilot');
  });

  it('pins a floating drawer into the layout', () => {
    const { result } = renderHook(() => useWorkspaceLayoutState());

    act(() => result.current.toggleRailPinned());
    expect(result.current.isRailPinned).toBe(true);
    act(() => result.current.toggleRailPinned());
    expect(result.current.isRailPinned).toBe(false);
  });

  it('opens the problems panel on the finding it was asked for', () => {
    const { result } = renderHook(() => useWorkspaceLayoutState());

    act(() => result.current.openProblemsWithIssue('check_fm:1'));

    expect(result.current.isProblemsPanelOpen).toBe(true);
    expect(result.current.activeIssueId).toBe('check_fm:1');

    act(() => result.current.closeProblemsPanel());

    expect(result.current.isProblemsPanelOpen).toBe(false);
    expect(result.current.activeIssueId).toBeNull();
  });

  it('leaves the digits to a text field', () => {
    const { result } = renderHook(() => useWorkspaceLayoutState());
    const input = document.createElement('input');
    document.body.append(input);

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '1',
          metaKey: true,
          bubbles: true,
        }),
      );
    });

    expect(result.current.activeRailTab).toBeNull();
    act(() => input.remove());
  });

  it('holds one blocking hub at a time', () => {
    const { result } = renderHook(() => useWorkspaceLayoutState());

    act(() => result.current.openHub('delivery'));
    expect(result.current.activeHub).toBe('delivery');

    act(() => result.current.openHub('review'));
    expect(result.current.activeHub).toBe('review');

    act(() => result.current.closeHub());
    expect(result.current.activeHub).toBeNull();
  });
});
