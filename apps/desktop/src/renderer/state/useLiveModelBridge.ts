import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type {
  AgentPromptInput,
  AgentPromptResult,
  PatchCommittedPayload,
  PatchTransaction,
} from '@evidence-poc/desktop-contracts/agentIpc';
import type { AppliedPatch } from '@evidence-poc/desktop-feature-agent';
import type { ModelSession } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

type LiveModelConnection = {
  prompt: (
    input: AgentPromptInput,
    isCancelled?: () => boolean,
  ) => Promise<AgentPromptResult>;
};

/** Synchronize local edits, then hand exclusive write ownership to main for one turn. */
export const useLiveModelBridge = (
  rootPath: string,
  session: ModelSession,
  baseDocument: DomainModelDocument,
  onApplied?: (patch: AppliedPatch) => void,
) => {
  const connection = useRef<LiveModelConnection | null>(null);
  const onAppliedRef = useRef(onApplied);
  useLayoutEffect(() => {
    onAppliedRef.current = onApplied;
  }, [onApplied]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(() => {
    const api = window.evidenceAPI.agent;
    const editorId = globalThis.crypto.randomUUID();
    let current = 0;
    let active = true;
    let replaying = false;
    let running = false;
    let fault: string | null = null;
    let sendError: string | null = null;
    let publication: Promise<void>;
    const pending = new Map<number, PatchTransaction>();
    const publish = () => {
      if (replaying || fault) return;
      const sent = ++current;
      setRevision(sent);
      publication = api
        .notifyModelChanged({
          rootPath,
          editorId,
          revision: sent,
          document: session.getDocument(),
          baseDocument,
        })
        .then(() => {
          if (active && sent === current) {
            sendError = null;
            setError(null);
          }
        })
        .catch((cause: unknown) => {
          if (active && sent === current) {
            sendError = cause instanceof Error ? cause.message : String(cause);
            setError(sendError);
          }
        });
    };
    const receive = ({
      rootPath: root,
      editorId: id,
      transaction: tx,
    }: PatchCommittedPayload) => {
      if (!active || root !== rootPath || id !== editorId || fault) return;
      if (tx.revision <= current) return; // Already replayed, or from an obsolete revision.
      pending.set(tx.revision, tx);
      for (
        let next = pending.get(current + 1);
        next;
        next = pending.get(current + 1)
      ) {
        const before = session.getDocument();
        try {
          if (next.baseRevision !== current)
            throw new Error('补丁基线与画布版本不一致。');
          replaying = true;
          session.applyCommittedPatch(
            next.patches,
            next.inversePatches,
            `agent:${next.rationale}`,
          );
        } catch (cause) {
          fault =
            cause instanceof Error
              ? cause.message
              : '无法重放已提交的模型补丁。';
          setError(fault);
          return;
        } finally {
          replaying = false;
        }
        current = next.revision;
        pending.delete(current);
        setRevision(current);
        onAppliedRef.current?.({
          before,
          after: session.getDocument(),
          rationale: next.rationale,
          commands: next.commands,
        });
      }
    };
    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'document-changed') publish();
    });
    const unsubscribePatch = api.onPatchCommitted(receive);
    publish();
    connection.current = {
      async prompt(input, isCancelled) {
        if (running || fault)
          return { success: false, error: fault ?? '本轮访谈尚未结束。' };
        running = true;
        const unlock = session.lockDocument();
        try {
          await publication;
          if (!active) return { success: false, error: '项目已切换。' };
          if (isCancelled?.()) return { success: false, error: '访谈已取消。' };
          if (sendError) return { success: false, error: sendError };
          const result = await api.prompt({
            ...input,
            editorId,
            revision: current,
          });
          for (const transaction of result.transactions ?? [])
            receive({ rootPath, editorId, transaction });
          if (!fault && pending.size) {
            fault = '补丁事务序列不完整，请重新打开项目。';
            setError(fault);
          }
          return fault ? { success: false, error: fault } : result;
        } finally {
          unlock();
          running = false;
        }
      },
    };
    return () => {
      active = false;
      connection.current = null;
      unsubscribe();
      unsubscribePatch();
    };
  }, [rootPath, session, baseDocument]);
  const prompt = useCallback(
    async (
      input: AgentPromptInput,
      isCancelled?: () => boolean,
    ): Promise<AgentPromptResult> =>
      connection.current?.prompt(input, isCancelled) ?? {
        success: false,
        error: '当前画布尚未同步。',
      },
    [],
  );
  return { revision, error, prompt };
};
