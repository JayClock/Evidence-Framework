import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  BilateralSyncBus,
  bilateralSync,
  requestFocusEntity,
  requestFocusRule,
  useBilateralSync,
} from './useBilateralSync';

describe('BilateralSyncBus', () => {
  it('stamps every request with a token, so a repeat is still a request', () => {
    const bus = new BilateralSyncBus();
    const seen = vi.fn();
    bus.subscribe(seen);

    bus.emit({
      type: 'focus-entity',
      entityId: 'contract.purchase',
      attributeName: null,
      source: 'canvas',
    });
    bus.emit({
      type: 'focus-entity',
      entityId: 'contract.purchase',
      attributeName: null,
      source: 'canvas',
    });

    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen.mock.calls[0]![0].token).toBe(1);
    expect(seen.mock.calls[1]![0].token).toBe(2);
  });

  it('stops delivering once a pane unsubscribes', () => {
    const bus = new BilateralSyncBus();
    const seen = vi.fn();
    const unsubscribe = bus.subscribe(seen);

    unsubscribe();
    bus.emit({
      type: 'focus-rule',
      ruleId: 'rule.total',
      entityId: null,
      source: 'code',
    });

    expect(seen).not.toHaveBeenCalled();
  });

  it('survives a listener that unsubscribes while handling an event', () => {
    const bus = new BilateralSyncBus();
    const second = vi.fn();
    const unsubscribe = bus.subscribe(() => unsubscribe());
    bus.subscribe(second);

    bus.emit({
      type: 'focus-entity',
      entityId: 'a',
      attributeName: null,
      source: 'table',
    });

    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('useBilateralSync', () => {
  it('routes each event kind to its handler', () => {
    const focusEntity = vi.fn();
    const focusRule = vi.fn();
    renderHook(() => useBilateralSync({ focusEntity, focusRule }));

    act(() => {
      requestFocusEntity('evidence.request', 'table', 'quantity');
      requestFocusRule('rule.total', 'contract.purchase', 'canvas');
    });

    expect(focusEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'evidence.request',
        attributeName: 'quantity',
        source: 'table',
      }),
    );
    expect(focusRule).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'rule.total', source: 'canvas' }),
    );
  });

  it('unsubscribes when the pane unmounts', () => {
    const focusEntity = vi.fn();
    const { unmount } = renderHook(() => useBilateralSync({ focusEntity }));

    unmount();
    const seenBefore = focusEntity.mock.calls.length;
    act(() => {
      bilateralSync.emit({
        type: 'focus-entity',
        entityId: 'evidence.request',
        attributeName: null,
        source: 'canvas',
      });
    });

    expect(focusEntity.mock.calls.length).toBe(seenBefore);
  });
});
