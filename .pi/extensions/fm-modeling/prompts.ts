import { fmPaths } from './paths.js';
import type { ModelState } from './state.js';

export function modelingPrompt(root: string, state: ModelState): string {
  const paths = fmPaths(root);
  return [
    `[FM_MODELING_EXECUTION runId=${state.runId} inputRevision=${state.revision}]`,
    '这是独立 FM Modeling 轮次，只生成或更新统一 FM Schema v3 模型。',
    `先完整读取 ${paths.skill}/SKILL.md，并按其中链接读取本轮所需建模准则。`,
    `读取 ${paths.runs}/${state.runId}/events/ 中截至 revision ${state.revision} 的不可变输入事件。`,
    state.modelRevision > 0
      ? `读取当前完整模型 ${paths.model}，保留未受影响的已知事实。`
      : '当前尚无正式模型；基于已有来源形成可校验的最小完整模型，不补造业务事实。',
    '必须先使用 fm_model_submit 提交完整源 YAML 集合；不得直接写插件状态、staging 或正式模型目录。',
    '提交得到 publish、no-op 或真实 failure 后，如仍有影响业务判断的缺口，只使用 fm_model_ask 提出一个问题；同轮不得提出多个问题。',
    '不得替用户回答，不得生成需求、架构、计划、代码、审核工件、Gate 或其他 Evidence 工作流状态。',
    '提问后或确认无需继续提问时结束本轮。',
  ].join('\n');
}
