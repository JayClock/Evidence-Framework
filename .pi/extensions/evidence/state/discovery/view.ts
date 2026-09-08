import { brief, contractViewLines } from '../../modeling/discovery/view.ts';
import type { EvidenceState } from '../../types.ts';
import { loadDiscovery } from './repository.ts';

export async function loadContractView(
  root: string,
  state: EvidenceState,
  detailed = false,
): Promise<string[]> {
  if (state.phase !== 'modeling') return [];
  try {
    return contractViewLines(await loadDiscovery(root, state), { detailed });
  } catch (error) {
    return [
      `合同视图不可用：${brief(error instanceof Error ? error.message : String(error))}`,
    ];
  }
}
