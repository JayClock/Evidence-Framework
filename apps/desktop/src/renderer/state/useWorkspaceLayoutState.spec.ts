import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useWorkspaceLayoutState } from './useWorkspaceLayoutState';

const setup = (toggleLedger = vi.fn(), expandRightRail = vi.fn(() => false)) =>
  renderHook(() => useWorkspaceLayoutState(toggleLedger, expandRightRail));

const press = (init: KeyboardEventInit) => {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { ...init, bubbles: true }),
    );
  });
};

describe('useWorkspaceLayoutState', () => {
  it('starts with the entity directory open but no tool drawer or overlay', () => {
    const { result } = setup();

    expect(result.current.rightPane).toBe('inspector');
    expect(result.current.isWorkshopOpen).toBe(false);
    expect(result.current.isWorkshopPinned).toBe(false);
    expect(result.current.isDirectoryOpen).toBe(true);
    expect(result.current.isProblemsPanelOpen).toBe(false);
    expect(result.current.isDeliveryOpen).toBe(false);
  });

  it('toggles the ledger with Mod+1 without opening a drawer', () => {
    const toggleLedger = vi.fn();
    const { result } = setup(toggleLedger);

    press({ key: '1', metaKey: true });
    press({ key: '1', metaKey: true });

    expect(toggleLedger).toHaveBeenCalledTimes(2);
    expect(result.current.isWorkshopOpen).toBe(false);
  });

  it('puts the diagnostics list under the canvas, not in a drawer', () => {
    const { result } = setup();

    press({ key: '2', metaKey: true });

    expect(result.current.isProblemsPanelOpen).toBe(true);
    expect(result.current.isWorkshopOpen).toBe(false);

    press({ key: '2', metaKey: true });
    expect(result.current.isProblemsPanelOpen).toBe(false);
  });

  it('toggles the directory independently of the active tool drawer', () => {
    const { result } = setup();

    press({ key: '3', metaKey: true });
    press({ key: '4', metaKey: true });

    expect(result.current.isDirectoryOpen).toBe(false);
    expect(result.current.rightPane).toBe('copilot');

    press({ key: '4', ctrlKey: true });
    expect(result.current.isDirectoryOpen).toBe(true);
  });

  it('opens Copilot instead of turning it off when its panel was collapsed', () => {
    const expandRightRail = vi.fn(() => false);
    const { result } = setup(vi.fn(), expandRightRail);

    press({ key: '3', metaKey: true });
    expandRightRail.mockReturnValueOnce(true);
    press({ key: '3', metaKey: true });
    expect(result.current.rightPane).toBe('copilot');
    press({ key: '3', metaKey: true });
    expect(result.current.rightPane).toBe('inspector');
  });

  it('pins a floating workshop into the layout', () => {
    const { result } = setup();

    act(() => result.current.openWorkshop());
    expect(result.current.isWorkshopOpen).toBe(true);
    act(() => result.current.toggleWorkshopPinned());
    expect(result.current.isWorkshopPinned).toBe(true);
    act(() => result.current.toggleWorkshopPinned());
    expect(result.current.isWorkshopPinned).toBe(false);
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

    expect(result.current.isWorkshopOpen).toBe(false);
    expect(toggleLedger).not.toHaveBeenCalled();
    act(() => input.remove());
  });

  it('opens and closes the delivery hub', () => {
    const { result } = setup();

    act(() => result.current.openDelivery());
    expect(result.current.isDeliveryOpen).toBe(true);

    act(() => result.current.closeDelivery());
    expect(result.current.isDeliveryOpen).toBe(false);
  });
});
