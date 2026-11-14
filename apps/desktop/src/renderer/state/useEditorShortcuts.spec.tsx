import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useEditorShortcuts } from './useEditorShortcuts';

const setup = (
  overrides: Partial<Parameters<typeof useEditorShortcuts>[0]> = {},
) => {
  const handlers = {
    undo: vi.fn(),
    redo: vi.fn(),
    save: vi.fn(),
    focusSearch: vi.fn(),
    focusAgent: vi.fn(),
    clearSelection: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    toggleLeftRail: vi.fn(),
    toggleRightRail: vi.fn(),
    toggleConsole: vi.fn(),
    ...overrides,
  };

  renderHook(() => useEditorShortcuts(handlers));

  return handlers;
};

describe('useEditorShortcuts', () => {
  it('leaves a key to the surface that already consumed it', () => {
    const handlers = setup();
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });

    escape.preventDefault();
    window.dispatchEvent(escape);

    expect(handlers.clearSelection).not.toHaveBeenCalled();
  });

  it('clears the selection on an unconsumed Escape', () => {
    const handlers = setup();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(handlers.clearSelection).toHaveBeenCalled();
  });

  it('keeps undo out of text fields', () => {
    const handlers = setup();
    const input = document.createElement('input');

    document.body.append(input);
    fireEvent.keyDown(input, { key: 'z', metaKey: true });

    expect(handlers.undo).not.toHaveBeenCalled();
    input.remove();
  });

  it('maps the layout chords to their rails', () => {
    const handlers = setup();

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'i', metaKey: true });
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });

    expect(handlers.toggleLeftRail).toHaveBeenCalled();
    expect(handlers.toggleRightRail).toHaveBeenCalled();
    expect(handlers.toggleConsole).toHaveBeenCalled();
  });
});
