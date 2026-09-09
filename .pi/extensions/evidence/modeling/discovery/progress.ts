import type { EvidenceState } from '../../types.ts';

export function assertDiscoveryRevision(
  state: EvidenceState,
  expectedRevision: number,
): void {
  if (state.phase !== 'modeling' || state.paused)
    throw new Error('当前不是活动的 Modeling 阶段');
  if (state.discovery.revision !== expectedRevision)
    throw new Error('发现版本已改变，请重新读取后操作');
}

export function reopenDiscovery(state: EvidenceState): void {
  state.discovery.stage = 'discovering';
  state.currentArtifactIndex = 0;
  state.pendingGate = null;
  // Modeling evidence describes the last published batch, not the newest Q&A.
  // Discovery changes invalidate readiness, but never erase that publication.
  state.lastError = null;
  state.lastReport = null;
  state.coding.planDigest = null;
}
