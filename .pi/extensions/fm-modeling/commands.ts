import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

import { FM_SKILL_COMMAND } from './ui-contracts.js';

const MENU = ['开始建模', '继续已有记录', '只校验模型', '返回'] as const;

function skillAvailable(pi: ExtensionAPI): boolean {
  return pi
    .getCommands()
    .some(
      (command) =>
        command.name === FM_SKILL_COMMAND && command.source === 'skill',
    );
}

async function chooseIntent(
  ctx: ExtensionCommandContext,
): Promise<string | null> {
  if (!ctx.hasUI) return null;
  const selected = await ctx.ui.select('FM Modeling', [...MENU]);
  if (selected === '开始建模') {
    const goal = await ctx.ui.editor('描述本次 FM 建模目标', '');
    return goal?.trim() ? goal : null;
  }
  if (selected === '继续已有记录') return '继续已有业务发现和 FM 记录';
  if (selected === '只校验模型') return '只校验现有 FM 模型，不修改源文件';
  return null;
}

export function registerModelingCommand(pi: ExtensionAPI): void {
  pi.registerCommand('fm-model', {
    description: '通过 fm-modeling Skill 开始或继续业务建模',
    handler: async (args, ctx) => {
      if (!skillAvailable(pi)) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            '缺少 fm-modeling Skill；请安装或启用该资源后重试。',
            'error',
          );
        }
        return;
      }
      const goal = args.trim() || (await chooseIntent(ctx));
      if (!goal) return;
      pi.sendUserMessage(`/${FM_SKILL_COMMAND} ${goal}`, {
        expandPromptTemplates: true,
      });
    },
  });
}
