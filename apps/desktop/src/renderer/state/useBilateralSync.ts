import { useCallback, useEffect } from 'react';

/** Which surface asked for the focus, so it can ignore its own request. */
export type SyncSource = 'canvas' | 'table' | 'code' | 'command';

/** "Show me this object" — the one sentence the graph, ledger and code share. */
export interface FocusEntityEvent {
  entityId: string;
  /** Field inside the object; null focuses the object itself. */
  attributeName: string | null;
  source: SyncSource;
  /** Monotonic, so a request for the same target is still a new request. */
  token: number;
}

/** "Show me the rule that computes this" — the rules pane answers it. */
export interface FocusRuleEvent {
  ruleId: string;
  entityId: string | null;
  source: SyncSource;
  token: number;
}

export type BilateralEvent =
  | ({ type: 'focus-entity' } & FocusEntityEvent)
  | ({ type: 'focus-rule' } & FocusRuleEvent);

/** `Omit` over a union collapses to the shared keys; this keeps each arm. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** What a caller sends; the bus stamps the token. */
export type BilateralRequest = DistributiveOmit<BilateralEvent, 'token'>;

type Listener = (event: BilateralEvent) => void;

/**
 * A pub/sub bus, deliberately dumber than a store.
 *
 * The stage, the ledger and the contract all need to point at the same object,
 * and threading a callback from each of them through `EditorScreen` made every
 * pane a prop-drilling site: adding one direction of sync touched four files.
 * Events are one hop and carry their own source, so a pane can ignore the
 * requests it just made instead of comparing object identities.
 *
 * Nothing is retained: a listener that mounts late sees no history, because the
 * workspace's own selection is the state and this is only the gesture.
 */
export class BilateralSyncBus {
  private readonly listeners = new Set<Listener>();
  private token = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: BilateralRequest): BilateralEvent {
    const next = { ...event, token: ++this.token } as BilateralEvent;

    // A listener that unmounts while handling an event must not skip the rest.
    for (const listener of [...this.listeners]) listener(next);

    return next;
  }
}

export const bilateralSync = new BilateralSyncBus();

/** Asks every pane to show one object. */
export const requestFocusEntity = (
  entityId: string,
  source: SyncSource,
  attributeName: string | null = null,
): BilateralEvent =>
  bilateralSync.emit({ type: 'focus-entity', entityId, attributeName, source });

/** Asks the stage for the pane that explains a rule. */
export const requestFocusRule = (
  ruleId: string,
  entityId: string | null,
  source: SyncSource,
): BilateralEvent =>
  bilateralSync.emit({ type: 'focus-rule', ruleId, entityId, source });

export interface BilateralSyncHandlers {
  focusEntity?: (event: FocusEntityEvent) => void;
  focusRule?: (event: FocusRuleEvent) => void;
}

/**
 * Subscribes this component to the bus for its lifetime.
 *
 * The handlers are dependencies, so callers pass `useCallback`s: a subscription
 * that re-registers on every render would still be correct but would make every
 * pane a listener with a stale closure half the time.
 */
export const useBilateralSync = (handlers: BilateralSyncHandlers): void => {
  const { focusEntity, focusRule } = handlers;
  const onEvent = useCallback(
    (event: BilateralEvent) => {
      if (event.type === 'focus-entity') focusEntity?.(event);
      else focusRule?.(event);
    },
    [focusEntity, focusRule],
  );

  useEffect(() => bilateralSync.subscribe(onEvent), [onEvent]);
};
