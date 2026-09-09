import { brief, contractViewLines } from '../../modeling/discovery/view.ts';
import type { EvidenceState } from '../../types.ts';
import { loadDiscovery } from './repository.ts';

export async function loadContractView(
  root: string,
  state: EvidenceState,
  detailed = false,
): Promise<string[]> {
  if (state.phase !== 'modeling') return [];
  try {
    const snapshot = await loadDiscovery(root, state);
    return [
      ...(detailed
        ? [
            snapshot.modelUpdateRequested
              ? '当前操作：人工授权更新模型，先整理积累的发现并评估。'
              : '问答只积累发现，不自动更新正式模型。',
            snapshot.appliedModel
              ? `上次模型更新：发现 v${snapshot.appliedModel.revision}；Context ${snapshot.appliedModel.contexts.map((c) => `${c.contextRef}(${c.status})`).join('、') || '不适用'}；纳入事实 ${snapshot.appliedModel.includedFactRefs.length} 项。support 仅为支撑投影，ready 仅为本批次职责就绪。`
              : '尚无本运行的手动模型更新批次（已有旧模型不会自动纳入）。',
            ...(snapshot.formalization
              ? snapshot.formalization.contexts.map(
                  (c) =>
                    `${c.contextRef}(${c.status})：纳入 ${c.includedFactRefs.join('、') || '无'}；缺失 ${c.missingFactRefs.join('、') || '无'}；剩余职责：${snapshot.formalization!.assessment.contexts.find((ctx) => ctx.contextRef === c.contextRef)!.remainingScope}`,
                )
              : []),
            ...(snapshot.formalization?.blockers.map(
              (b) => `${b.factRef} ← ${b.reasons.join('、')}`,
            ) ?? []),
            '手动操作：/evidence-discovery update-model 更新模型；converge 进入需求收敛；resume 继续问答；finish 仅整理。',
          ]
        : []),
      ...contractViewLines(snapshot, { detailed }),
    ];
  } catch (error) {
    return [
      `合同视图不可用：${brief(error instanceof Error ? error.message : String(error))}`,
    ];
  }
}
