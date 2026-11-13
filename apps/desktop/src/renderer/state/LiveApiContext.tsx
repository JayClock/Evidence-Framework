import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type {
  LiveDeliveryPreview,
  LiveRouteBinding,
} from '../../shared/delivery';

const LiveApiContext = createContext({
  active: false,
  stale: true,
  byEntity: new Map<string, readonly LiveRouteBinding[]>() as ReadonlyMap<
    string,
    readonly LiveRouteBinding[]
  >,
});

export const LiveApiProvider = ({
  analysis,
  stale,
  children,
}: {
  analysis: LiveDeliveryPreview | null;
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
