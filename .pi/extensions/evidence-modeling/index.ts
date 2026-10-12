import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { registerModelingCommand } from './commands.js';
import { QuestionUI } from './question-ui.js';
import { ContextSelectionSchema, QuestionInputSchema } from './ui-contracts.js';

export default function evidenceModelingExtension(pi: ExtensionAPI): void {
  const questions = new QuestionUI();

  registerModelingCommand(pi);
  pi.registerTool({
    name: 'evidence_ui_question',
    label: '当前建模追溯',
    description:
      'evidence-discovery 的可选 UI 包装；先读取该 Skill，按其协议确定问题和权限，本工具不决定业务下一步。' +
      '围绕当前业务凭证，用简短故事讲述来源追溯进展，再问一个必要问题；请求或确认保留语义分类，凭证使用业务名称。' +
      '只返回交互结果，不保存业务记录：answered 携带回答原文（含控制意图），不代表缺口已解决；deferred 暂缓原问题；stopped 停止本轮；switch-context 请求合同导航。' +
      'cancelled 表示用户取消，保留原焦点等待，不改用文本重问；unavailable 表示界面不可用，沿用原问题标识在普通对话继续，不伪造回答。' +
      '已返回回答由 Agent 吸收全部事实与控制意图，再按 Skill 授权沉淀术语；术语写入失败立即停止并交接未保存内容。',
    parameters: QuestionInputSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await questions.open(params, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: result,
      };
    },
  });
  pi.registerTool({
    name: 'evidence_ui_contexts',
    label: '合同上下文总览',
    description:
      'evidence-discovery 的可选 UI 包装；先读取该 Skill，由 Agent 依据材料直接识别合同上下文并核对结束依据、可选性及权限，本工具只展示投影，不判断材料是否充分。' +
      '只传入经营依据与独立边界充分的合同，标注现金权责或目标与实际主线，以谁与谁签订什么合同、实现什么经营目的表达（现金方向注明观察主体），展示双方、责任边界及待追溯事项；展示不含资料名称、路径、版本、来源 ID 或参考链接，让用户选择分析哪一个；不接收候选状态，选择只决定分析焦点，不是合同存在或边界的确认。只返回交互结果，不保存记录或排除责任。' +
      'selected 携带约定标识，Agent 仍须核对目标及权限再转向分析；cancelled 保留原焦点等待，不改用文本重问；empty 表示未识别到合同，不代表追责结束；' +
      'unavailable 表示界面不可用，改用普通对话编号列表，不伪造选择。选择不解决原问题，也不解除停止状态。',
    parameters: ContextSelectionSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await questions.selectContext(params, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: result,
      };
    },
  });
}
