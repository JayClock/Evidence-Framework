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
    openCommandPalette: vi.fn(),
    startStorming: vi.fn(),
    clearSelection: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    fitCanvas: vi.fn(),
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

  it('maps the inspector and tool chords', () => {
    const handlers = setup();

    fireEvent.keyDown(window, { key: 'i', metaKey: true });
    fireEvent.keyDown(window, { key: '\\', metaKey: true });
    fireEvent.keyDown(window, { code: 'KeyX', altKey: true });

    expect(handlers.toggleRightRail).toHaveBeenCalledTimes(2);
    expect(handlers.toggleProblems).toHaveBeenCalledTimes(1);
  });

  it('binds the two chords the floating island prints', () => {
    const handlers = setup();

    fireEvent.keyDown(window, { key: '0', metaKey: true });
    fireEvent.keyDown(window, { code: 'Digit1', shiftKey: true });

    expect(handlers.resetZoom).toHaveBeenCalledTimes(1);
    expect(handlers.fitCanvas).toHaveBeenCalledTimes(1);
  });

  it('uses Mod+K for storming and Mod+Shift+K for commands', () => {
    const handlers = setup();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true, shiftKey: true });

    expect(handlers.startStorming).toHaveBeenCalledOnce();
    expect(handlers.openCommandPalette).toHaveBeenCalledOnce();
  });

  it('exposes the gate and navigation chords the palette prints', () => {
    const handlers = setup({
      rerunSensors: vi.fn(),
      openDelivery: vi.fn(),
    });

    fireEvent.keyDown(window, { key: 'R', metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { code: 'KeyD', altKey: true });

    expect(handlers.rerunSensors).toHaveBeenCalledTimes(1);
    expect(handlers.openDelivery).toHaveBeenCalledTimes(1);
    // Mod+Shift+Z must stay redo, not become another shifted action.
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    expect(handlers.redo).toHaveBeenCalledTimes(1);
  });

  it('exits story playback on Escape without clearing the selection', () => {
    const handlers = setup({ closeStory: vi.fn(), clearSelection: vi.fn() });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(handlers.closeStory).toHaveBeenCalledTimes(1);
    expect(handlers.clearSelection).not.toHaveBeenCalled();
  });

  it('frames the selection with Shift+2', () => {
    const handlers = setup({ zoomToSelection: vi.fn() });

    fireEvent.keyDown(window, { code: 'Digit2', shiftKey: true });

    expect(handlers.zoomToSelection).toHaveBeenCalledTimes(1);
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
