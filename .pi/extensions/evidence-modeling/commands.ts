import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

import { MODELING_SKILL_COMMAND } from './ui-contracts.js';

const MENU = [
  '访谈并沉淀领域语言',
  '生成或修改模型',
  '只校验模型',
  '返回',
] as const;

function skillAvailable(pi: ExtensionAPI): boolean {
  return pi
    .getCommands()
    .some(
      (command) =>
        command.name === MODELING_SKILL_COMMAND && command.source === 'skill',
    );
}

async function chooseIntent(
  ctx: ExtensionCommandContext,
): Promise<string | null> {
  if (!ctx.hasUI) return null;
  const selected = await ctx.ui.select('Evidence Modeling', [...MENU]);
  if (selected === '访谈并沉淀领域语言' || selected === '生成或修改模型') {
    const goal = await ctx.ui.editor(`描述本次目标：${selected}`, '');
    if (!goal?.trim()) return null;
    return selected === '访谈并沉淀领域语言'
      ? `访谈并沉淀领域语言：${goal}，保存发现记录并当轮更新已明确术语的统一词汇表，不修改模型 JSON、关系、规则、验证场景、API 或实现`
      : `生成或修改模型：${goal}，直接编辑当前 FM 并校验`;
  }
  if (selected === '只校验模型') return '只校验现有 FM 模型，不修改源文件';
  return null;
}

export function registerModelingCommand(pi: ExtensionAPI): void {
  pi.registerCommand('evidence-model', {
    description:
      '通过 evidence-modeling Skill 访谈并沉淀领域语言、编辑或校验模型',
    handler: async (args, ctx) => {
      if (!skillAvailable(pi)) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            '缺少 evidence-modeling Skill；请安装或启用该资源后重试。',
            'error',
          );
        }
        return;
      }
      const goal = args.trim() || (await chooseIntent(ctx));
      if (!goal) return;
      pi.sendUserMessage(`/${MODELING_SKILL_COMMAND} ${goal}`, {
        expandPromptTemplates: true,
      });
    },
  });
}
