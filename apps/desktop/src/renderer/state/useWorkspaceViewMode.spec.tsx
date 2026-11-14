import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWorkspaceViewMode } from './useWorkspaceViewMode';

const press = (init: KeyboardEventInit) => {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { ...init, bubbles: true }),
    );
  });
};

describe('useWorkspaceViewMode', () => {
  it('flips between the graph and the ledger on a bare V', () => {
    const { result } = renderHook(() => useWorkspaceViewMode());

    expect(result.current.mode).toBe('graph');
    press({ key: 'v' });
    expect(result.current.mode).toBe('table');
    press({ key: 'V' });
    expect(result.current.mode).toBe('graph');
  });

  it('names each mode with Mod+1, Mod+2 and Mod+3', () => {
    const { result } = renderHook(() => useWorkspaceViewMode());

    press({ key: '2', metaKey: true });
    expect(result.current.mode).toBe('table');
    press({ key: '3', ctrlKey: true });
    expect(result.current.mode).toBe('split');
    press({ key: '1', metaKey: true });
    expect(result.current.mode).toBe('graph');
  });

  it('leaves the letter to a text field while it is typing', () => {
    const { result } = renderHook(() => useWorkspaceViewMode());
    const input = document.createElement('input');
    document.body.append(input);

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', bubbles: true }),
      );
    });

    expect(result.current.mode).toBe('graph');
    act(() => {
      input.remove();
    });
  });

  it('ignores a key another surface already consumed', () => {
    const { result } = renderHook(() => useWorkspaceViewMode());

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'v',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault();
      window.dispatchEvent(event);
    });

    expect(result.current.mode).toBe('graph');
  });
});
