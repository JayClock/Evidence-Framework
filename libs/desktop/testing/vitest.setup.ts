import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Shared jsdom setup for the desktop renderer libraries.
 *
 * jsdom ships neither `ResizeObserver` nor pointer capture, and the canvas
 * measures itself with both, so every React test project installs the same
 * no-op stubs instead of duplicating them per library.
 */
class ResizeObserverStub {
  // jsdom has no layout, so observing is a no-op in tests.
  observe(): void {
    return undefined;
  }

  unobserve(): void {
    return undefined;
  }

  disconnect(): void {
    return undefined;
  }
}

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverStub,
    configurable: true,
    writable: true,
  });
}

if (!('scrollIntoView' in Element.prototype)) {
  // jsdom has no scrolling and no layout; `cmdk` scrolls the active row into
  // view on every keystroke, so the palette would throw without this.
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: () => undefined,
    configurable: true,
    writable: true,
  });
}

if (!('setPointerCapture' in HTMLElement.prototype)) {
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { value: () => undefined, configurable: true },
    releasePointerCapture: { value: () => undefined, configurable: true },
    hasPointerCapture: { value: () => false, configurable: true },
  });
}

afterEach(() => {
  cleanup();
});
