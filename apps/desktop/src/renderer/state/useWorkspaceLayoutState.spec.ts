import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useWorkspaceLayoutState } from './useWorkspaceLayoutState';

const setup = (toggleLedger = vi.fn()) =>
  renderHook(() => useWorkspaceLayoutState(toggleLedger));

const press = (init: KeyboardEventInit) => {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { ...init, bubbles: true }),
    );
  });
};

describe('useWorkspaceLayoutState', () => {
  it('starts with the rail closed and nothing covering the canvas', () => {
    const { result } = setup();

    expect(result.current.activeRailTab).toBeNull();
    expect(result.current.isRailPinned).toBe(false);
    expect(result.current.isProblemsPanelOpen).toBe(false);
    expect(result.current.activeHub).toBeNull();
  });

  it('toggles the ledger with Mod+1 without opening a drawer', () => {
    const toggleLedger = vi.fn();
    const { result } = setup(toggleLedger);

    press({ key: '1', metaKey: true });
    press({ key: '1', metaKey: true });

    expect(toggleLedger).toHaveBeenCalledTimes(2);
    expect(result.current.activeRailTab).toBeNull();
  });

  it('puts the diagnostics list under the canvas, not in a drawer', () => {
    const { result } = setup();

    press({ key: '2', metaKey: true });

    expect(result.current.isProblemsPanelOpen).toBe(true);
    expect(result.current.activeRailTab).toBeNull();

    press({ key: '2', metaKey: true });
    expect(result.current.isProblemsPanelOpen).toBe(false);
  });

  it('switches drawers instead of stacking them', () => {
    const { result } = setup();

    press({ key: '3', metaKey: true });
    expect(result.current.activeRailTab).toBe('drift');
    press({ key: '4', metaKey: true });

    expect(result.current.activeRailTab).toBe('copilot');
  });

  it('pins a floating drawer into the layout', () => {
    const { result } = setup();

    act(() => result.current.toggleRailPinned());
    expect(result.current.isRailPinned).toBe(true);
    act(() => result.current.toggleRailPinned());
    expect(result.current.isRailPinned).toBe(false);
  });

  it('opens the problems panel on the finding it was asked for', () => {
    const { result } = setup();

    act(() => result.current.openProblemsWithIssue('check_fm:1'));

    expect(result.current.isProblemsPanelOpen).toBe(true);
    expect(result.current.activeIssueId).toBe('check_fm:1');

    act(() => result.current.closeProblemsPanel());

    expect(result.current.isProblemsPanelOpen).toBe(false);
    expect(result.current.activeIssueId).toBeNull();
  });

  it('leaves the digits to a text field', () => {
    const toggleLedger = vi.fn();
    const { result } = setup(toggleLedger);
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
    expect(toggleLedger).not.toHaveBeenCalled();
    act(() => input.remove());
  });

  it('holds one blocking hub at a time', () => {
    const { result } = setup();

    act(() => result.current.openHub('delivery'));
    expect(result.current.activeHub).toBe('delivery');

    act(() => result.current.openHub('drift'));
    expect(result.current.activeHub).toBe('drift');

    act(() => result.current.closeHub());
    expect(result.current.activeHub).toBeNull();
  });
});
