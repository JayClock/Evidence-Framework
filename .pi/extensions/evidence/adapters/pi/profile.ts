import {
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { getExpectedArtifact } from '../../phases.ts';
import { CONFIG_PATH } from '../../storage.ts';
import type { EvidenceConfig, EvidenceState } from '../../types.ts';
import { DISCOVERY_TOOL_NAMES } from './tools/discovery.ts';

export const DOCUMENT_TOOLS = ['read', 'bash', 'evidence_submit_artifact'];

export const MODELING_TOOLS = ['read', 'bash', 'evidence_submit_fm_model'];

export const REVIEW_TOOLS = ['read', 'bash', 'evidence_submit_artifact'];

export const CODING_TOOLS = [
  'read',
  'bash',
  'edit',
  'write',
  'evidence_tdd_red',
  'evidence_tdd_green',
  'evidence_complete_tdd_cycle',
  'evidence_verify_task',
  'evidence_complete_story',
];

export const NORMAL_TOOLS = ['read', 'bash', 'edit', 'write'];

export function configuredTools(state: EvidenceState): string[] {
  if (state.paused || state.phase === 'complete') return NORMAL_TOOLS;
  if (state.phase === 'coding') return CODING_TOOLS;
  if (state.phase === 'review') return REVIEW_TOOLS;
  if (state.status === 'waiting_answer') return ['read', 'bash'];
  if (state.phase === 'modeling') {
    if (state.discovery.stage === 'discovering') return DISCOVERY_TOOL_NAMES;
    const submission =
      getExpectedArtifact(state.phase, state.currentArtifactIndex)?.kind ===
      'fm-model'
        ? MODELING_TOOLS
        : DOCUMENT_TOOLS;
    return [
      ...new Set([
        ...submission,
        'evidence_ask_questions',
        'evidence_save_discovery',
      ]),
    ];
  }
  const artifact = getExpectedArtifact(state.phase, state.currentArtifactIndex);
  if (artifact?.kind === 'fm-model') return MODELING_TOOLS;
  return DOCUMENT_TOOLS;
}

export function splitModelSpec(
  spec: string,
): { provider: string; modelId: string } | null {
  const slash = spec.indexOf('/');
  if (slash <= 0 || slash === spec.length - 1) return null;
  return { provider: spec.slice(0, slash), modelId: spec.slice(slash + 1) };
}

export async function applyPhaseProfile(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: EvidenceState,
  config: EvidenceConfig,
): Promise<void> {
  const availableTools = new Set(pi.getAllTools().map((tool) => tool.name));
  const desiredTools = configuredTools(state);
  const validTools = desiredTools.filter((tool) => availableTools.has(tool));
  const missingTools = desiredTools.filter((tool) => !availableTools.has(tool));
  pi.setActiveTools(validTools);
  if (missingTools.length > 0) {
    ctx.ui.notify(`Evidence 未找到工具：${missingTools.join(', ')}`, 'warning');
  }

  if (state.phase === 'complete') return;
  const profile = config.models[state.phase];
  if (!profile.model) {
    pi.setThinkingLevel(profile.thinkingLevel);
    return;
  }

  const parsed = splitModelSpec(profile.model);
  if (!parsed) {
    pi.setThinkingLevel(profile.thinkingLevel);
    ctx.ui.notify(
      `${CONFIG_PATH} 中的模型必须使用 provider/model-id 格式：${profile.model}`,
      'warning',
    );
    return;
  }
  const model = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
  if (!model) {
    pi.setThinkingLevel(profile.thinkingLevel);
    ctx.ui.notify(
      `模型不存在：${profile.model}。使用 /model 或 pi --list-models 检查。`,
      'warning',
    );
    return;
  }
  if (!(await pi.setModel(model))) {
    ctx.ui.notify(`模型未配置认证：${profile.model}`, 'warning');
  }
  pi.setThinkingLevel(profile.thinkingLevel);
}
