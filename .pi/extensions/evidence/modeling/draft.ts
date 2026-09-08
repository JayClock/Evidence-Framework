import type { EvidenceState } from '../types.ts';
import { digestText } from './digest.ts';
import type { DiscoveryRepository } from './discovery/ports.ts';
import { assertConsolidated } from './discovery/rules.ts';
import type { DiscoverySnapshot } from './discovery/schema.ts';
import type {
  FmModelFile,
  FmValidationResult,
  RuntimeOptions,
} from './fm/contracts.ts';
import { normalizeFmModelFiles } from './fm/files.ts';

export function createDraftChecker(ports: {
  discovery: Pick<
    DiscoveryRepository,
    'loadDiscovery' | 'appendDiscoveryEvent'
  >;
  checkFiles(
    options: RuntimeOptions & { files: FmModelFile[]; draftOnly: true },
  ): Promise<FmValidationResult>;
}) {
  // The same per-workspace modeling lock must cover the caller's revision check,
  // validation and append. Draft validation never publishes or creates a Gate.
  return async function checkModelDraft(
    state: EvidenceState,
    input: FmModelFile[],
    options: RuntimeOptions,
  ): Promise<NonNullable<DiscoverySnapshot['draft']>> {
    if (state.discovery.stage !== 'discovering')
      throw new Error('请先保存新的发现版本以重新打开草稿');
    const snapshot = await ports.discovery.loadDiscovery(options.root, state);
    if (!snapshot.content) throw new Error('先保存范围及场景依据');
    assertConsolidated(snapshot);
    const files = normalizeFmModelFiles(input);
    const checked = await ports.checkFiles({
      ...options,
      files,
      draftOnly: true,
    });
    const draft = {
      filesDigest: digestText(JSON.stringify(files)),
      passed: checked.passed,
      machineValidated: checked.machineValidated,
      simulationPassed: checked.simulationPassed,
      result: checked.items
        .map((item) => `${item.name}: ${item.status}\n${item.details}`)
        .join('\n')
        .slice(0, 30000),
    };
    await ports.discovery.appendDiscoveryEvent(options.root, state, {
      kind: 'draft',
      result: draft,
    });
    return draft;
  };
}
