import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { registerModelingCommand } from './commands.js';
import { QuestionUI } from './question-ui.js';

export default function fmModelingExtension(pi: ExtensionAPI): void {
  const questions = new QuestionUI();

  registerModelingCommand(pi);
  pi.registerTool({
    name: 'fm_ui_question',
    label: 'FM Question UI',
    description:
      '显示一个由 Agent 提供标识和来源的 FM 业务问题；只返回人工交互结果，不保存业务记录。',
    parameters: Type.Object({
      questionId: Type.String({ minLength: 1 }),
      gapKey: Type.String({
        minLength: 3,
        pattern: '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$',
      }),
      prompt: Type.String({ minLength: 1 }),
      impact: Type.String({ minLength: 1 }),
      contextSummary: Type.String({ minLength: 1 }),
      sourceRefs: Type.Array(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await questions.open(params, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: result,
      };
    },
  });
}
