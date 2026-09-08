import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { assertDiscoveryRevision } from '../../modeling/discovery/progress.ts';
import {
  controlDiscoveryInteraction,
  withModelingLock,
} from '../../state/discovery/index.ts';
import { loadState } from '../../storage.ts';
import type { EvidenceState } from '../../types.ts';

export type RefreshDiscovery = (
  ctx: ExtensionContext,
  state: EvidenceState,
) => Promise<void>;
export type StartDiscoveryWork = (
  ctx: ExtensionContext,
  expected?: EvidenceState,
) => Promise<void>;
export const FINISH_DISCOVERY = '结束本轮问答，整理已有信息';
export const SKIP_QUESTION = '暂不确定／跳过此题';
const messages = {
  finish:
    '人工已结束本轮问答；开始整理已有信息与缺口，不代答、不自动排除范围、不跳过定稿校验。',
  skip: '本题已暂缓，未记录业务答案。先整理当前缺口，再决定下一问；不会重复追问此题，阻塞项仍须解决才能定稿。',
  resume: '已恢复问答，暂缓问题重新进入待答列表。',
};

export async function changeDiscoveryInteraction(
  ctx: ExtensionContext,
  refresh: RefreshDiscovery,
  options: {
    action: 'finish' | 'resume' | 'skip';
    expected?: EvidenceState;
    questionId?: string;
    signal?: AbortSignal;
  },
): Promise<EvidenceState | null> {
  const { action, expected, questionId } = options;
  if (!ctx.isIdle()) return null;
  if (!ctx.hasUI) {
    ctx.ui.notify('问答控制需要人工交互。', 'warning');
    return null;
  }
  return withModelingLock(ctx.cwd, async () => {
    const current = await loadState(ctx.cwd);
    if (options.signal?.aborted) return null;
    if (
      !current ||
      !ctx.isIdle() ||
      current.phase !== 'modeling' ||
      current.paused ||
      current.status === 'running' ||
      current.discovery.stage !== 'discovering'
    ) {
      ctx.ui.notify('请在未暂停且空闲的 Modeling 发现阶段操作。', 'warning');
      return null;
    }
    if (expected) {
      if (current.runId !== expected.runId)
        throw new Error('运行已改变，请重新操作');
      assertDiscoveryRevision(current, expected.discovery.revision);
    }
    await controlDiscoveryInteraction(ctx.cwd, current, action, questionId);
    await refresh(ctx, current);
    ctx.ui.setEditorText(
      current.status === 'waiting_answer'
        ? '/evidence-answer'
        : '/evidence-run',
    );
    ctx.ui.notify(messages[action], 'info');
    return current;
  });
}

export async function finishDiscoveryInteraction(
  ctx: ExtensionContext,
  refresh: RefreshDiscovery,
  startWork: StartDiscoveryWork,
  expected?: EvidenceState,
  signal?: AbortSignal,
): Promise<void> {
  const saved = await changeDiscoveryInteraction(ctx, refresh, {
    action: 'finish',
    expected,
    signal,
  });
  if (saved && !signal?.aborted) await startWork(ctx, saved);
}
