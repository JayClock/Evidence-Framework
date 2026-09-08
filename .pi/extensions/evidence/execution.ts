import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { EvidenceState, ExecutionOwner } from './types.ts';
import { appendHistory, saveState } from './storage.ts';

export function createExecutionOwner(ctx: ExtensionContext): ExecutionOwner {
  return {
    id: randomUUID(),
    sessionId: ctx.sessionManager.getSessionId(),
    pid: process.pid,
    hostname: hostname(),
  };
}

export function ownsExecution(
  state: EvidenceState,
  ctx: ExtensionContext,
): boolean {
  const owner = state.execution;
  return (
    !!owner &&
    owner.hostname === hostname() &&
    owner.pid === process.pid &&
    owner.sessionId === ctx.sessionManager.getSessionId()
  );
}

function localProcessIsGone(owner: ExecutionOwner): boolean {
  if (owner.hostname !== hostname()) return false;
  try {
    // Signal 0 checks existence without sending a signal. EPERM/unknown errors
    // are not proof of death. PID reuse conservatively prevents recovery.
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

// Caller holds the workflow lifecycle lock and has just loaded the state.
// A new/reloaded session is not itself evidence that another executor died.
export async function recoverInterruptedExecution(
  state: EvidenceState,
  ctx: ExtensionContext,
  reason: string,
): Promise<void> {
  if (
    state.status !== 'running' ||
    state.paused ||
    !ctx.isIdle() ||
    !state.execution
  )
    return;
  if (!ownsExecution(state, ctx) && !localProcessIsGone(state.execution))
    return;
  const owner = state.execution;
  state.status = 'ready';
  state.lastError = '上一次执行在提交完成标记前中断，可以重新运行当前任务。';
  appendHistory(
    state,
    'interrupted_run_recovered',
    `${reason}; session=${ctx.sessionManager.getSessionId()}; previous=${JSON.stringify(owner)}`,
  );
  await saveState(ctx.cwd, state);
}
