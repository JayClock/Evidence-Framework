import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { ModelingController } from './controller.js';
import { ModelPublisher } from './model.js';
import { EXTENSION_NAMESPACE, LEGACY_EVIDENCE_NAMESPACE, STORAGE_NAMESPACE } from './paths.js';
import { StateStore } from './state.js';

export default function fmModelingExtension(pi: ExtensionAPI) {
  pi.on('session_start', async (_event, ctx) => {
    try {
      await new StateStore(ctx.cwd).recover();
    } catch (error) {
      ctx.ui.notify(`FM Modeling 恢复检查失败：${String(error)}`, 'error');
    }
  });

  pi.registerTool({
    name: 'fm_model_submit',
    label: 'Submit FM Model',
    description: '校验并原子发布当前 Run 的完整 FM Schema v3 YAML bundle。',
    parameters: Type.Object({
      runId: Type.String(),
      expectedRevision: Type.Integer({ minimum: 1 }),
      expectedModelRevision: Type.Integer({ minimum: 0 }),
      summary: Type.String({ minLength: 1 }),
      sourceRefs: Type.Array(Type.String(), { minItems: 1 }),
      files: Type.Array(
        Type.Object({ path: Type.String({ minLength: 1 }), content: Type.String() }),
        { minItems: 1 },
      ),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: 'text', text: '正在校验 FM bundle…' }], details: {} });
      const state = await new ModelPublisher(ctx.cwd, new StateStore(ctx.cwd)).submit(params);
      return {
        content: [
          {
            type: 'text',
            text: `FM bundle 已处理：modelRevision=${state.modelRevision}, revision=${state.revision}`,
          },
        ],
        details: { state, summary: params.summary },
      };
    },
  });

  pi.registerCommand('evidence-model', {
    description: '独立运行 FM 建模问答',
    handler: async (args, ctx) => {
      await new ModelingController(pi, new StateStore(ctx.cwd)).handle(args, ctx);
    },
  });

  pi.on('agent_settled', async (_event, ctx) => {
    const store = new StateStore(ctx.cwd);
    const state = await store.loadState();
    if (!state?.execution) return;
    await store.saveState({ ...state, execution: null });
  });
}

export const boundaries = {
  extension: EXTENSION_NAMESPACE,
  storage: STORAGE_NAMESPACE,
  forbiddenLegacyExtension: LEGACY_EVIDENCE_NAMESPACE,
} as const;
