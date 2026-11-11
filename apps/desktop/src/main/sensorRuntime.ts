export interface DebouncedSensorRuntimeOptions {
  run: () => Promise<void>;
  onError?: (error: unknown) => void;
  delayMs?: number;
}

export interface DebouncedSensorRuntime {
  /** Re-arms the timer; only the last change in a burst runs the sensors. */
  schedule(): void;
  /** Runs immediately and cancels a pending run. */
  flush(): Promise<void>;
  cancel(): void;
  isPending(): boolean;
}

/**
 * Collapses a burst of model edits into one sensor run.
 *
 * Sensors shell out to the pinned interpreter, so a keystroke-rate schedule
 * would keep the machine busy proving the same intermediate states.
 */
export const createDebouncedSensorRuntime = ({
  run,
  onError,
  delayMs = 800,
}: DebouncedSensorRuntimeOptions): DebouncedSensorRuntime => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const execute = async (): Promise<void> => {
    try {
      await run();
    } catch (error) {
      onError?.(error);
    }
  };

  return {
    schedule: () => {
      clear();
      timer = setTimeout(() => {
        timer = null;
        void execute();
      }, delayMs);
    },
    flush: async () => {
      clear();
      await execute();
    },
    cancel: clear,
    isPending: () => timer !== null,
  };
};
