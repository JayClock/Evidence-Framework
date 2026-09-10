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
  const context = snapshot.content?.businessView.contexts.find(
    (value) => value.contextRef === target.contextRef,
  );
  if (!context || context.kind !== target.kind)
    throw new Error('讨论目标必须匹配已记录的业务上下文类型');
  if (
    (target.kind === 'contract' &&
      target.fulfillmentRef !== null &&
      !context.fulfillments.some(
        (item) => item.candidateRef === target.fulfillmentRef,
      )) ||
    (target.kind === 'channel' &&
      target.exchangeRef !== null &&
      !context.evidenceRefs.includes(target.exchangeRef)) ||
    (target.kind === 'domain' &&
      target.objectRef !== null &&
      !context.thingRefs.includes(target.objectRef))
  )
    throw new Error('讨论目标必须属于当前上下文的履约、协商凭证或领域对象');
}

export function assertBusinessView(snapshot: DiscoverySnapshot): void {
  const staleFacts = snapshot.staleRecordKeys.filter(
    (key) => !key.startsWith('resolution:'),
  );
  if (staleFacts.length)
    throw new Error(
      `当前发现记录依据已失效（来源变化或回答已被更正）：${staleFacts.join('、')}`,
    );
  const content = snapshot.content;
  if (!content) return;
  const view = content.businessView;
  const candidates = new Map(
    content.candidates.map((value) => [value.id, value]),
  );
  for (const value of candidates.values()) {
    validateRefs(snapshot, value.sourceRefs, value.confidence === 'explicit');
    if ((value.archetype === 'evidence') !== (value.evidenceKind !== null))
      throw new Error(`只有凭证候选可以声明 evidenceKind：${value.id}`);
  }
  const valueOf = (
    ref: string,
    archetypes: Array<
      'context' | 'fulfillment' | 'evidence' | 'role' | 'participant' | 'thing'
    >,
  ) => {
    const value = candidates.get(ref);
    if (
      !value ||
      !archetypes.includes(value.archetype as (typeof archetypes)[number])
    )
      throw new Error(
        `业务视图引用 ${ref} 必须是 ${archetypes.join('/')} 候选`,
      );
    return value;
  };
  const identities = new Set<string>();
  const ownIdentity = (ref: string, archetype: 'context' | 'fulfillment') => {
    if (identities.has(ref)) throw new Error(`上下文或履约身份重复：${ref}`);
    identities.add(ref);
    return valueOf(ref, [archetype]);
  };
  const participant = (ref: string | null) => {
    if (ref !== null) valueOf(ref, ['role', 'participant']);
  };
  const evidence = (
    ref: string | null,
    expected?: 'contract' | 'fulfillment_request' | 'fulfillment_confirmation',
  ) => {
    if (ref === null) return;
    const value = valueOf(ref, ['evidence']);
    if (expected && value.evidenceKind !== expected)
      throw new Error(`凭证 ${ref} 必须是 ${expected}`);
  };

  for (const context of view.contexts) {
    const identity = ownIdentity(context.contextRef, 'context');
    validateRefs(
      snapshot,
      context.sourceRefs,
      identity.confidence === 'explicit',
    );
    if (
      context.kind === 'contract' &&
      (context.roleRefs.length !== 2 ||
        (context.roleRefs[0] !== null &&
          context.roleRefs[0] === context.roleRefs[1]))
    )
      throw new Error(
        '合同上下文必须保留两个不同的角色位置，未知位置使用 null',
      );
    if (context.kind !== 'contract' && context.fulfillments.length)
      throw new Error('只有合同上下文可以直接包含履约项');
    if (context.kind !== 'contract' && context.agreementEvidence !== null)
      throw new Error('渠道或领域上下文不能伪造合同凭证');
    for (const ref of context.roleRefs)
      if (ref !== null) valueOf(ref, ['role']);
    for (const ref of context.participantRefs) valueOf(ref, ['participant']);
    for (const ref of context.thingRefs) valueOf(ref, ['thing']);
    for (const ref of context.evidenceRefs) evidence(ref);
    if (context.agreementEvidence)
      evidence(context.agreementEvidence.evidenceRef, 'contract');

    const items = new Map(
      context.fulfillments.map((item) => [item.candidateRef, item]),
    );
    for (const item of context.fulfillments) {
      const identity = ownIdentity(item.candidateRef, 'fulfillment');
      validateRefs(
        snapshot,
        item.sourceRefs,
        identity.confidence === 'explicit',
      );
      participant(item.requestEvidence.issuerRef);
      participant(item.requestEvidence.recipientRef);
      participant(item.confirmationEvidence.providerRef);
      evidence(item.requestEvidence.evidenceRef, 'fulfillment_request');
      evidence(
        item.confirmationEvidence.evidenceRef,
        'fulfillment_confirmation',
      );
      for (const ref of item.supportingEvidenceRefs) evidence(ref);
      for (const ref of item.participantRefs) valueOf(ref, ['participant']);
      for (const ref of item.thingRefs) valueOf(ref, ['thing']);
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
