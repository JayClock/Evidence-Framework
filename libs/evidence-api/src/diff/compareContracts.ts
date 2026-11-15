import type { EvidenceApiSnapshot } from '../types.js';
import { hasErrors } from '../diagnostics.js';
import { OasdiffRunner, type OasdiffComparison } from './oasdiffRunner.js';

export interface ContractComparison extends OasdiffComparison {
  baseModelDigest: string;
  targetModelDigest: string;
}

/** Compares the final contracts, including validated route overlays. */
export const compareContracts = async (
  base: EvidenceApiSnapshot,
  target: EvidenceApiSnapshot,
  runner = new OasdiffRunner(),
): Promise<ContractComparison> => {
  if (base.modelId !== target.modelId)
    throw new Error('API_MODEL_MISMATCH: 不能比较不同模型');
  const diagnostics = [...base.diagnostics, ...target.diagnostics];
  if (hasErrors(diagnostics))
    throw new Error(
      diagnostics.map((item) => `${item.code}: ${item.message}`).join('\n'),
    );
  return {
    ...(await runner.compare({ ...base.openapi }, { ...target.openapi })),
    baseModelDigest: base.digests.model,
    targetModelDigest: target.digests.model,
  };
};
