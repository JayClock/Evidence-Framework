import { useEffect, useRef, useState } from 'react';
import type { ModelSession } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

/** Publish before patch acknowledgement so the next agent tool sees the same edit. */
export const useLiveModelBridge = (
  rootPath: string,
  session: ModelSession,
  baseDocument: DomainModelDocument,
) => {
  const counter = useRef(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const publish = () => {
      const sent = ++counter.current;
      setRevision(sent);
      void window.evidenceAPI.agent
        .notifyModelChanged({
          rootPath,
          revision: sent,
          document: session.getDocument(),
          baseDocument,
        })
        .then(() => {
          if (active && sent === counter.current) setError(null);
        })
        .catch((cause: unknown) => {
          if (active && sent === counter.current)
            setError(cause instanceof Error ? cause.message : String(cause));
        });
    };
    const unsubscribe = session.subscribe((event) => {
      if (event.type !== 'document-changed') return;
      publish();
    });
    publish();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [rootPath, session, baseDocument]);
  return { revision, error };
};
