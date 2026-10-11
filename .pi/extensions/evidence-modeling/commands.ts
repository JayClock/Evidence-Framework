import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

import { MODELING_SKILL_COMMAND } from './ui-contracts.js';

const MENU = [
  '访谈并沉淀领域语言',
  '生成或修改模型与 API',
  '只校验模型与 API',
  '生成联合审核页',
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
  if (
    selected === '访谈并沉淀领域语言' ||
    selected === '生成或修改模型与 API'
  ) {
    const goal = await ctx.ui.editor(`描述本次目标：${selected}`, '');
    if (!goal?.trim()) return null;
    return selected === '访谈并沉淀领域语言'
      ? `访谈并沉淀领域语言：${goal}，保存发现记录并当轮更新已明确术语的统一词汇表，不修改模型 JSON、关系、规则、验证场景、API 或实现`
      : `生成或修改模型与 API：${goal}，先核对追责结束依据，编辑并校验当前 FM，再设计并校验整体 API，生成联合审核页；不自动批准或进入实施`;
  }
  if (selected === '只校验模型与 API') {
    return '只校验现有 FM 与 API，不修改任何项目文件，不生成审核页';
  }
  if (selected === '生成联合审核页') {
    return '生成现有 FM 与 API 的联合审核页，不修改模型或 API 设计源';
  }
  return null;
}

export function registerModelingCommand(pi: ExtensionAPI): void {
  pi.registerCommand('evidence-model', {
    description:
      '通过 evidence-modeling Skill 访谈、联合生成或校验 FM/API、生成联合审核页',
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
