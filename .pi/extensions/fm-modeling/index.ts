import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { ModelingController } from './controller.js';
import { ModelPublisher } from './model.js';
import { EXTENSION_NAMESPACE, LEGACY_EVIDENCE_NAMESPACE, STORAGE_NAMESPACE } from './paths.js';
import { StateStore } from './state.js';
import { QuestionInteraction } from './ui.js';

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

  pi.registerTool({
    name: 'fm_model_ask',
    label: 'Ask FM Question',
    description: '在当前输入已有模型处理结果后，保存一个影响业务判断的问题。',
    parameters: Type.Object({
      runId: Type.String(),
      expectedRevision: Type.Integer({ minimum: 1 }),
      gapKey: Type.String({ minLength: 3, pattern: '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$' }),
      prompt: Type.String({ minLength: 1 }),
      impact: Type.String({ minLength: 1 }),
      sourceRefs: Type.Array(Type.String(), { minItems: 1 }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = await new QuestionInteraction(pi, new StateStore(ctx.cwd)).ask(params);
      return {
        content: [{ type: 'text', text: `已保存问题 ${state.activeQuestionId}，等待人工回答。` }],
        details: { state },
        terminate: true,
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
    const settled = { ...state, execution: null };
    await store.saveState(settled);
    if (settled.activeQuestionId) {
      await new QuestionInteraction(pi, store).open(ctx);
    }
  });
}

export const boundaries = {
  extension: EXTENSION_NAMESPACE,
  storage: STORAGE_NAMESPACE,
  forbiddenLegacyExtension: LEGACY_EVIDENCE_NAMESPACE,
} as const;
