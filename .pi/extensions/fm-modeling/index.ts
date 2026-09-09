import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { EXTENSION_NAMESPACE, LEGACY_EVIDENCE_NAMESPACE, STORAGE_NAMESPACE } from './paths.js';

export default function fmModelingExtension(pi: ExtensionAPI) {
  pi.registerCommand('evidence-model', {
    description: '独立运行 FM 建模问答',
    handler: async (_args, ctx) => {
      ctx.ui.notify('独立 FM Modeling 插件尚未实现建模流程。', 'info');
    },
  });
}

export const boundaries = {
  extension: EXTENSION_NAMESPACE,
  storage: STORAGE_NAMESPACE,
  forbiddenLegacyExtension: LEGACY_EVIDENCE_NAMESPACE,
} as const;
