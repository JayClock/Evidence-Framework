import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useWorkspaceViewMode } from './useWorkspaceViewMode';

const press = (init: KeyboardEventInit) =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { ...init, bubbles: true }),
    );
  });

describe('useWorkspaceViewMode', () => {
  it('defaults to journey and flips between the journey and ledger on V', () => {
    const { result } = renderHook(() => useWorkspaceViewMode());
    expect(result.current.mode).toBe('journey');
    press({ key: 'v' });
    expect(result.current.mode).toBe('table');
    press({ key: 'V' });
    expect(result.current.mode).toBe('journey');
  });
  it('names journey, topology, table and split with Alt+1..4, including macOS symbol keys', () => {
    const { result } = renderHook(() => useWorkspaceViewMode());
    for (const [code, mode] of [
      ['Digit2', 'topology'],
      ['Digit3', 'table'],
      ['Digit4', 'split'],
      ['Digit1', 'journey'],
    ]) {
      press({ code, key: '™', altKey: true });
      expect(result.current.mode).toBe(mode);
    }
  });
  it('leaves modified digits to the rail and OS', () => {
    const { result } = renderHook(() => useWorkspaceViewMode());
    for (const modifiers of [
      { metaKey: true },
      { altKey: true, metaKey: true },
      { altKey: true, ctrlKey: true },
      { altKey: true, shiftKey: true },
    ])
      press({ code: 'Digit2', ...modifiers });
    expect(result.current.mode).toBe('journey');
  });
  it('leaves V to text fields but permits explicit Alt chords while typing', () => {
    const { result } = renderHook(() => useWorkspaceViewMode());
    const input = document.createElement('input');
    document.body.append(input);
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', bubbles: true }),
      );
    });
    expect(result.current.mode).toBe('journey');
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'Digit2',
          altKey: true,
          bubbles: true,
        }),
      );
    });
    expect(result.current.mode).toBe('topology');
    input.remove();
  });
  it('ignores a consumed event', () => {
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
    expect(result.current.mode).toBe('journey');
  });
});
