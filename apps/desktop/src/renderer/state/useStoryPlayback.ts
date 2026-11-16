import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FlowScenarioTrace,
  FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { WhatIfResult } from '@evidence-poc/evidence-agent';
import type { StoryProjectResult } from '../../shared/story';

export const STORY_REFRESH_DELAY = 180;
export const STORY_STEP_DURATION = 4500;

interface StoryPlaybackOptions {
  rootPath: string;
  document: DomainModelDocument;
  enabled: boolean;
  /** Reload the canvas only when doing so cannot discard local edits. */
  onInvalidated?: () => Promise<void>;
}

const stepRef = (step: FlowStepTrace) =>
  `${step.entityId}#${step.exampleLabel}`;
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** One snapshot for narration, camera focus and sandbox; late replies never win. */
export const useStoryPlayback = ({
  rootPath,
  document,
  enabled,
  onInvalidated,
}: StoryPlaybackOptions) => {
  const [flows, setFlows] = useState<readonly FlowScenarioTrace[]>([]);
  const [preferredFlowId, setPreferredFlowId] = useState<string>();
  const [skipAi, setSkipAi] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [invalidating, setInvalidating] = useState(false);
  const [invalidationError, setInvalidationError] = useState<string>();
  const requestKey = useMemo(
    () => ({}),
    [
      rootPath,
      document,
      enabled,
      preferredFlowId,
      skipAi,
      refresh,
      invalidating,
    ],
  );
  const [status, setStatus] = useState<{
    key: object;
    loading: boolean;
    error?: string;
  }>();
  const [loaded, setLoaded] = useState<{
    key: object;
    result: StoryProjectResult;
  }>();
  const [position, setPosition] = useState<{ ref?: string; index: number }>({
    index: 0,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const activeFlowId =
    flows.find(({ flowId }) => flowId === preferredFlowId)?.flowId ??
    flows[0]?.flowId;
  const loading =
    enabled && (invalidating || status?.key !== requestKey || status.loading);
  const error =
    invalidationError ??
    (status?.key === requestKey ? status.error : undefined);
  const stale = loaded?.key !== requestKey;
  const flow = loaded?.result.flow;
  const projection = loaded?.result.projection;
  const matchingIndex =
    position.ref === undefined
      ? -1
      : (flow?.steps.findIndex((step) => stepRef(step) === position.ref) ?? -1);
  const index =
    matchingIndex >= 0
      ? matchingIndex
      : Math.min(position.index, Math.max(0, (flow?.steps.length ?? 0) - 1));
  const step = flow?.steps[index];
  const scene = projection?.scenes.find(
    ({ stepIndex }) => stepIndex === step?.sequence,
  );
  const ready = enabled && !loading && !error && !stale && step !== undefined;

  const canvasFocus = useMemo(() => {
    if (!enabled || !flow || !step) return null;
    const dependencyEntityIds = step.basedOn.flatMap((ref) => {
      // Canonical example refs take precedence over declared id/ref aliases.
      const dependency =
        flow.steps.find((candidate) => stepRef(candidate) === ref) ??
        flow.steps.find(
          (candidate) =>
            candidate.values.id === ref || candidate.values.ref === ref,
        );
      return dependency ? [dependency.entityId] : [];
    });
    return {
      activeEntityId: step.entityId,
      dependencyEntityIds: [...new Set(dependencyEntityIds)],
      relatedEntityIds: [step.actingRoleRef, step.responsibleRoleRef].filter(
        (id): id is string => id !== undefined,
      ),
      focusKey: `${flow.flowId}:${stepRef(step)}:${step.sequence}:${step.stepHash}`,
    };
  }, [enabled, flow, step]);

  const projectedFlowId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!enabled || invalidating) return;
    let active = true;
    setIsPlaying(false);
    setStatus({ key: requestKey, loading: true });
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const input = { rootPath, document };
          const nextFlows = await window.evidenceAPI.story.listFlows(input);
          if (!active) return;
          setFlows(nextFlows);
          const chosen =
            nextFlows.find(({ flowId }) => flowId === preferredFlowId) ??
            nextFlows[0];
          if (!chosen) {
            setLoaded(undefined);
            setStatus({ key: requestKey, loading: false });
            return;
          }
          const result = await window.evidenceAPI.story.project({
            ...input,
            flowId: chosen.flowId,
            skipAi,
          });
          if (!active) return;
          // If a flow disappeared, its old cursor must not leak into the fallback.
          if (projectedFlowId.current !== result.flow.flowId)
            setPosition({ index: 0 });
          projectedFlowId.current = result.flow.flowId;
          setLoaded({ key: requestKey, result });
          setStatus({ key: requestKey, loading: false });
        } catch (cause) {
          if (active)
            setStatus({
              key: requestKey,
              loading: false,
              error: messageOf(cause),
            });
        }
      })();
    }, STORY_REFRESH_DELAY);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    requestKey,
    rootPath,
    document,
    enabled,
    preferredFlowId,
    skipAi,
    invalidating,
  ]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let version = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = window.evidenceAPI.story.onInvalidated((event) => {
      if (event.rootPath !== rootPath) return;
      const sent = ++version;
      setIsPlaying(false);
      setInvalidating(true);
      setInvalidationError(undefined);
      clearTimeout(timer);
      timer = setTimeout(() => {
        void (async () => {
          try {
            await onInvalidated?.();
            if (active && sent === version) setRefresh((value) => value + 1);
          } catch (cause) {
            if (active && sent === version)
              setInvalidationError(messageOf(cause));
          } finally {
            if (active && sent === version) setInvalidating(false);
          }
        })();
      }, STORY_REFRESH_DELAY);
    });
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
      setInvalidating(false);
    };
  }, [enabled, rootPath, onInvalidated]);

  const moveTo = useCallback(
    (nextIndex: number) => {
      const next = flow?.steps[nextIndex];
      if (next) setPosition({ ref: stepRef(next), index: nextIndex });
    },
    [flow],
  );

  useEffect(() => {
    if (!ready || !isPlaying) return;
    if (index >= (flow?.steps.length ?? 0) - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => moveTo(index + 1), STORY_STEP_DURATION);
    return () => clearTimeout(timer);
  }, [ready, isPlaying, index, flow, moveTo]);
  useEffect(() => {
    if (!enabled) setIsPlaying(false);
  }, [enabled]);

  // Sandbox state is scoped to the entire displayed revision, not just its step.
  const sandboxKey = useMemo(
    () => ({}),
    [requestKey, step?.sequence, step?.stepHash],
  );
  const currentSandboxKey = useRef(sandboxKey);
  currentSandboxKey.current = sandboxKey;
  const pendingSandbox = useRef<object | null>(null);
  const [sandbox, setSandbox] = useState<{
    key: object;
    loading: boolean;
    result?: WhatIfResult;
    error?: string;
  }>();
  const askWhatIf = useCallback(
    async (question: string) => {
      if (
        !ready ||
        !flow ||
        !step ||
        !question.trim() ||
        pendingSandbox.current === sandboxKey
      )
        return;
      pendingSandbox.current = sandboxKey;
      setIsPlaying(false);
      setSandbox({ key: sandboxKey, loading: true });
      try {
        const result = await window.evidenceAPI.story.whatIf({
          rootPath,
          document,
          flowId: flow.flowId,
          currentStepSequence: step.sequence,
          stepHash: step.stepHash,
          question,
        });
        if (currentSandboxKey.current === sandboxKey)
          setSandbox({ key: sandboxKey, loading: false, result });
      } catch (cause) {
        if (currentSandboxKey.current === sandboxKey)
          setSandbox({
            key: sandboxKey,
            loading: false,
            error: messageOf(cause),
          });
      } finally {
        if (pendingSandbox.current === sandboxKey)
          pendingSandbox.current = null;
      }
    },
    [ready, flow, step, sandboxKey, rootPath, document],
  );
  useEffect(
    () => () => {
      currentSandboxKey.current = {};
    },
    [],
  );

  return {
    flows,
    activeFlowId,
    currentStepSequence: step?.sequence ?? 0,
    step,
    scene,
    canvasFocus,
    projection,
    loading,
    error,
    stale,
    ready,
    skipAi,
    isPlaying: ready && isPlaying,
    stepCount: flow?.steps.length ?? 0,
    stepNumber: step ? index + 1 : 0,
    canPrevious: ready && index > 0,
    canNext: ready && index < (flow?.steps.length ?? 0) - 1,
    selectFlow: (flowId: string) => {
      setIsPlaying(false);
      setPosition({ index: 0 });
      setPreferredFlowId(flowId);
    },
    previous: () => {
      if (ready && index > 0) {
        setIsPlaying(false);
        moveTo(index - 1);
      }
    },
    next: () => {
      if (ready && index < (flow?.steps.length ?? 0) - 1) {
        setIsPlaying(false);
        moveTo(index + 1);
      }
    },
    togglePlaying: () => {
      if (!ready || (flow?.steps.length ?? 0) < 2) return;
      if (!isPlaying && index === (flow?.steps.length ?? 0) - 1) moveTo(0);
      setIsPlaying((playing) => !playing);
    },
    setSkipAi: (value: boolean) => {
      setIsPlaying(false);
      setSkipAi(value);
    },
    retry: () => {
      setInvalidationError(undefined);
      setRefresh((value) => value + 1);
    },
    askWhatIf,
    sandbox: sandbox?.key === sandboxKey ? sandbox : undefined,
  };
};

export type StoryPlaybackController = ReturnType<typeof useStoryPlayback>;
