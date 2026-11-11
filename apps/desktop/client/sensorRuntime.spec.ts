import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDebouncedSensorRuntime } from './sensorRuntime';

describe('createDebouncedSensorRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('runs once for a burst of edits', async () => {
    const run = vi.fn(async () => undefined);
    const runtime = createDebouncedSensorRuntime({ run, delayMs: 800 });

    for (let index = 0; index < 10; index += 1) {
      runtime.schedule();
    }

    expect(runtime.isPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(799);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(run).toHaveBeenCalledTimes(1);
    expect(runtime.isPending()).toBe(false);
  });

  it('flushes immediately and cancels the pending run', async () => {
    const run = vi.fn(async () => undefined);
    const runtime = createDebouncedSensorRuntime({ run, delayMs: 800 });

    runtime.schedule();
    await runtime.flush();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(run).toHaveBeenCalledTimes(1);
    expect(runtime.isPending()).toBe(false);
  });

  it('cancels without running', async () => {
    const run = vi.fn(async () => undefined);
    const runtime = createDebouncedSensorRuntime({ run });

    runtime.schedule();
    runtime.cancel();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(run).not.toHaveBeenCalled();
    expect(runtime.isPending()).toBe(false);
  });

  it('routes failures to onError instead of leaving them unhandled', async () => {
    const error = new Error('pinned interpreter missing');
    const onError = vi.fn();
    const runtime = createDebouncedSensorRuntime({
      run: async () => {
        throw error;
      },
      onError,
    });

    runtime.schedule();
    await vi.advanceTimersByTimeAsync(800);

    expect(onError).toHaveBeenCalledWith(error);
  });
});
