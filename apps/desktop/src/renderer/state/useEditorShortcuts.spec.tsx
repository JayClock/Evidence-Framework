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
    openCommandPalette: vi.fn(),
    clearSelection: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    fitCanvas: vi.fn(),
    toggleLeftRail: vi.fn(),
    toggleRightRail: vi.fn(),
    toggleProblems: vi.fn(),
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
    fireEvent.keyDown(window, { code: 'KeyX', altKey: true });

    expect(handlers.toggleLeftRail).toHaveBeenCalled();
    expect(handlers.toggleRightRail).toHaveBeenCalled();
    expect(handlers.toggleProblems).toHaveBeenCalledTimes(2);
  });

  it('binds the two chords the floating island prints', () => {
    const handlers = setup();

    fireEvent.keyDown(window, { key: '0', metaKey: true });
    fireEvent.keyDown(window, { code: 'Digit1', shiftKey: true });

    expect(handlers.resetZoom).toHaveBeenCalledTimes(1);
    expect(handlers.fitCanvas).toHaveBeenCalledTimes(1);
  });

  it('opens the command palette on Mod+K instead of focusing a surface', () => {
    const handlers = setup();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(handlers.openCommandPalette).toHaveBeenCalledTimes(1);
    // Cmd+F still moves the caret into the outline search, so the two chords
    // answer two different questions.
    expect(handlers.focusSearch).not.toHaveBeenCalled();
  });

  it('exposes the export and gate chords the palette prints', () => {
    const handlers = setup({
      exportReview: vi.fn(),
      rerunSensors: vi.fn(),
      openDelivery: vi.fn(),
      openSandbox: vi.fn(),
    });

    fireEvent.keyDown(window, { key: 'E', metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'R', metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { code: 'KeyD', altKey: true });
    fireEvent.keyDown(window, { code: 'KeyS', altKey: true });

    expect(handlers.exportReview).toHaveBeenCalledTimes(1);
    expect(handlers.rerunSensors).toHaveBeenCalledTimes(1);
    expect(handlers.openDelivery).toHaveBeenCalledTimes(1);
    expect(handlers.openSandbox).toHaveBeenCalledTimes(1);
    // Mod+Shift+Z must stay redo, not become another shifted action.
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    expect(handlers.redo).toHaveBeenCalledTimes(1);
  });

  it('leaves the alt chords to a text field that is being typed in', () => {
    const handlers = setup({ openDelivery: vi.fn() });
    const input = document.createElement('input');

    document.body.append(input);
    fireEvent.keyDown(input, { code: 'KeyD', altKey: true });

    expect(handlers.openDelivery).not.toHaveBeenCalled();
    input.remove();
  });
});
