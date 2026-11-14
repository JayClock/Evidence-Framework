import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { DeliveryField } from '@evidence-poc/evidence-api';

/**
 * One route the delivery projection exposes for an entity.
 *
 * The canvas only needs to name where a card is reachable, so this is the
 * subset of the delivery contract the node card draws. The app builds it from
 * its live delivery preview; the two shapes stay structurally compatible.
 */
export interface LiveRouteBinding {
  id: string;
  entityRef: string;
  method: string;
  path: string;
  roleRefs: readonly string[];
  exposure: 'internal' | 'external';
  fields: readonly DeliveryField[];
}

export interface LiveDeliveryAnalysis {
  bindings: readonly LiveRouteBinding[];
}

interface LiveApiValue {
  active: boolean;
  stale: boolean;
  byEntity: ReadonlyMap<string, readonly LiveRouteBinding[]>;
}

const LiveApiContext = createContext<LiveApiValue>({
  active: false,
  stale: true,
  byEntity: new Map<string, readonly LiveRouteBinding[]>(),
});

export const LiveApiProvider = ({
  analysis,
  stale,
  children,
}: {
  analysis: LiveDeliveryAnalysis | null;
  stale: boolean;
  children: ReactNode;
}) => {
  const value = useMemo(() => {
    const byEntity = new Map<string, LiveRouteBinding[]>();
    for (const route of analysis?.bindings ?? []) {
      const routes = byEntity.get(route.entityRef) ?? [];
      routes.push(route);
      byEntity.set(route.entityRef, routes);
    }
    return { active: true, stale, byEntity };
  }, [analysis, stale]);
  return (
    <LiveApiContext.Provider value={value}>{children}</LiveApiContext.Provider>
  );
};

export const useLiveApi = () => useContext(LiveApiContext);
