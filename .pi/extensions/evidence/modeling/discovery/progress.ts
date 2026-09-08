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
  state.modeling.applicable = null;
  state.modeling.rationale = null;
  state.modeling.machineValidated = false;
  state.modeling.simulationPassed = null;
  state.lastError = null;
  state.lastReport = null;
  state.coding.planDigest = null;
}
