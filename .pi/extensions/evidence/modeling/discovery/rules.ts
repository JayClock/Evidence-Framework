import { latestAnswer } from './questions.ts';
import type { DiscoverySnapshot, DiscussionTarget } from './schema.ts';

export function assertConsolidated(snapshot: DiscoverySnapshot): void {
  if (snapshot.interaction.needsConsolidation)
    throw new Error(
      '先保存消化结果，再决定下一问或执行草稿／定稿校验；回答和跳过不能直接当作已更新的模型',
    );
}

export function validateRefs(
  snapshot: DiscoverySnapshot,
  refs: string[],
  explicit: boolean,
): void {
  const sourceIds = new Set(
    snapshot.content?.sources.map((source) => source.id),
  );
  sourceIds.add('INPUT');
  for (const ref of refs) {
    if (sourceIds.has(ref)) continue;
    const answer = snapshot.answers.find((value) => value.id === ref);
    if (!answer || latestAnswer(snapshot, answer.questionId)?.id !== answer.id)
      throw new Error(`来源不存在或回答已被更正：${ref}`);
    if (explicit && answer.status !== 'answered')
      throw new Error(`未知/排除回答不能支持正式事实：${ref}`);
  }
  if (explicit && !refs.length) throw new Error('明确事实和场景预期必须有来源');
}

export function assertDiscussionTarget(
  snapshot: DiscoverySnapshot,
  target: DiscussionTarget,
): void {
  if (target === null) return;
  const contract = snapshot.content?.contractView.contracts.find(
    (c) => c.contextRef === target.contractRef,
  );
  if (
    !contract ||
    (target.fulfillmentRef !== null &&
      !contract.fulfillments.some(
        (f) => f.candidateRef === target.fulfillmentRef,
      ))
  )
    throw new Error('讨论目标必须属于已记录的合同及其履约项');
}

export function assertDiscoveryContracts(snapshot: DiscoverySnapshot): void {
  // Stale resolutions are inactive interpretations, not current business facts.
  // Keep them visible for audit; their unresolved questions remain blockers.
  const staleFacts = snapshot.staleRecordKeys.filter(
    (key) => !key.startsWith('resolution:'),
  );
  if (staleFacts.length)
    throw new Error(
      `当前发现记录依据已失效（来源变化或回答已被更正）：${staleFacts.join('、')}`,
    );
  const view = snapshot.content?.contractView;
  if (!view) return;
  const used = new Set<string>();
  const candidate = (ref: string) => {
    if (used.has(ref)) throw new Error(`合同、角色或履约候选重复占用：${ref}`);
    used.add(ref);
    const value = snapshot.content?.candidates.find((c) => c.id === ref);
    if (!value) throw new Error(`合同视图引用的候选不存在：${ref}`);
    validateRefs(snapshot, value.sourceRefs, value.confidence === 'explicit');
    return value;
  };
  for (const contract of view.contracts) {
    const context = candidate(contract.contextRef);
    validateRefs(
      snapshot,
      contract.sourceRefs,
      context.confidence === 'explicit',
    );
    for (const role of contract.roleRefs) if (role !== null) candidate(role);
    const items = new Map(
      contract.fulfillments.map((f) => [f.candidateRef, f]),
    );
    for (const item of contract.fulfillments) {
      const value = candidate(item.candidateRef);
      validateRefs(snapshot, item.sourceRefs, value.confidence === 'explicit');
      const { rightHolderRef, obligorRef } = item;
      if (rightHolderRef !== null && rightHolderRef === obligorRef)
        throw new Error('履约权利方和义务方不能相同');
      for (const role of [rightHolderRef, obligorRef])
        if (role !== null && !contract.roleRefs.includes(role))
          throw new Error('履约权责方必须属于当前合同双方');
      if ((item.parentFulfillmentRef === null) !== (item.trigger === null))
        throw new Error('异常履约必须同时记录前序履约与触发条件');
      const visited = new Set([item.candidateRef]);
      let parent = item.parentFulfillmentRef;
      while (parent !== null) {
        if (visited.has(parent)) throw new Error('异常履约关系不能循环');
        visited.add(parent);
        const predecessor = items.get(parent);
        if (!predecessor) throw new Error('异常履约的前序项必须属于同一合同');
        parent = predecessor.parentFulfillmentRef;
      }
    }
  }
  assertDiscussionTarget(snapshot, view.current);
}
