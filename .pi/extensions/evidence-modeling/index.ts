import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { registerModelingCommand } from './commands.js';
import { QuestionUI } from './question-ui.js';
import { QuestionInputSchema } from './ui-contracts.js';

export default function evidenceModelingExtension(pi: ExtensionAPI): void {
  const questions = new QuestionUI();

  registerModelingCommand(pi);
  pi.registerTool({
    name: 'evidence_ui_question',
    label: '当前建模问题',
    description:
      '围绕当前业务位置，展示已明确内容并澄清一个问题。履约位置精确到合同、履约项和请求或确认；只返回人工交互结果，不保存业务记录。',
    parameters: QuestionInputSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await questions.open(params, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: result,
      };
    },
  });
}
