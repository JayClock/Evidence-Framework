import { Value } from 'typebox/value';
import { digestText } from '../digest.ts';
import { unresolvedBlockingQuestions } from './questions.ts';
import { validateRefs } from './rules.ts';
import {
  FormalizationAssessmentSchema,
  type ContextAssessment,
  type Formalization,
  type FormalizationAssessment,
} from './assessment-schema.ts';
import type { DiscoverySnapshot } from './schema.ts';

export function discoveryBasisDigest(snapshot: DiscoverySnapshot): string {
  return digestText(
    JSON.stringify({
      content: snapshot.content,
      recordHeads: snapshot.recordHeads,
      sourceHashes: snapshot.sourceHashes,
      questions: snapshot.questions,
      answers: snapshot.answers,
      staleRecordKeys: snapshot.staleRecordKeys,
    }),
  );
}

// Minimum knowledge for THIS responsibility, never completeness of every related
// context. Further business rules belong in requiredFactRefs, not a universal questionnaire.
export const CONTEXT_DIMENSIONS = {
  domain: ['identity', 'structure'],
  channel: ['identity', 'parties', 'evidence', 'validity'],
  contract: ['identity', 'parties', 'agreement'],
  fulfillment: [
    'identity',
    'parties',
    'request',
    'deadline',
    'confirmation',
    'rule',
  ],
} as const;

export function assessFormalization(
  snapshot: DiscoverySnapshot,
  assessment: FormalizationAssessment,
): Formalization {
  if (!Value.Check(FormalizationAssessmentSchema, assessment))
    throw new Error(
      'Context 评估格式无效；不接受候选 complete/dependencyRefs 旧协议',
    );
  validateRefs(snapshot, assessment.applicability.sourceRefs, true);
  const candidates = snapshot.content?.candidates ?? [];
  if (
    assessment.applicability.applicable !== assessment.contexts.length > 0 ||
    (!assessment.applicability.applicable && candidates.length)
  )
    throw new Error(
      '有独立候选必须按 Context 评估；不适用仅限无候选的简单胶水',
    );
  const contexts = new Map<string, ContextAssessment>();
  const ownership = new Map<string, string>();
  const facts = new Map<string, ContextAssessment['facts'][number]>();
  const dependencies = new Map<string, Set<string>>();
  const reasons = new Map<string, Set<string>>();
  const block = (ref: string, reason: string) => reasons.get(ref)!.add(reason);
  for (const context of assessment.contexts) {
    if (
      contexts.has(context.contextRef) ||
      !context.candidateRefs.includes(context.contextRef)
    )
      throw new Error('Context 身份重复或未包含自身候选');
    contexts.set(context.contextRef, context);
    validateRefs(snapshot, context.sourceRefs, true);
    for (const ref of context.candidateRefs) {
      if (ownership.has(ref) || !candidates.some((c) => c.id === ref))
        throw new Error(`候选须归属一个发现 Context：${ref}`);
      ownership.set(ref, context.contextRef);
    }
    for (const fact of context.facts) {
      const ref = `${context.contextRef}.${fact.key}`;
      if (facts.has(ref) || !context.candidateRefs.includes(fact.candidateRef))
        throw new Error(`事实键重复或不属于 Context：${ref}`);
      validateRefs(snapshot, fact.sourceRefs, fact.status === 'known');
      facts.set(ref, fact);
      dependencies.set(ref, new Set());
      reasons.set(ref, new Set());
      if (fact.status === 'unknown') block(ref, '业务事实尚未明确');
      if (snapshot.staleRecordKeys.includes(`candidate:${fact.candidateRef}`))
        block(ref, '发现依据已失效，须修订相关解释');
    }
    for (const ref of context.candidateRefs)
      if (!context.facts.some((f) => f.candidateRef === ref))
        throw new Error(`候选的已知部分或缺口未被评估：${ref}`);
    const required = new Set(context.requiredFactRefs);
    if (
      [...required].some(
        (ref) => !ref.startsWith(`${context.contextRef}.`) || !facts.has(ref),
      )
    )
      throw new Error(
        `本轮职责引用了不存在或外部的本地事实：${context.contextRef}`,
      );
    for (const dimension of CONTEXT_DIMENSIONS[context.kind]) {
      if (
        !context.facts.some(
          (f) =>
            f.dimension === dimension &&
            required.has(`${context.contextRef}.${f.key}`),
        )
      )
        throw new Error(
          `${context.kind} 本轮职责缺少 ${dimension} 评估（未知须显式保留）`,
        );
    }
    for (const ref of context.caseRefs)
      if (!snapshot.content?.cases.some((c) => c.id === ref))
        throw new Error(`回放引用无效：${ref}`);
  }
  if (ownership.size !== candidates.length)
    throw new Error('Context 评估必须覆盖全部有效历史候选，不能只评估当前焦点');
  const refsOf = (ctx: ContextAssessment, dimension: string) =>
    ctx.facts
      .filter((f) => f.dimension === dimension)
      .map((f) => `${ctx.contextRef}.${f.key}`);
  for (const context of assessment.contexts) {
    // A supporting projection needs the context identity, not all its internals.
    const identity = refsOf(context, 'identity').filter(
      (ref) => facts.get(ref)!.candidateRef === context.contextRef,
    );
    if (!identity.length)
      throw new Error(`缺少 Context 自身身份事实：${context.contextRef}`);
    for (const f of context.facts)
      for (const ref of identity)
        if (
          ref !== `${context.contextRef}.${f.key}` &&
          f.dimension !== 'identity'
        )
          dependencies.get(`${context.contextRef}.${f.key}`)!.add(ref);
    for (const edge of context.dependencies) {
      if (
        !edge.consumerFactRef.startsWith(`${context.contextRef}.`) ||
        !facts.has(edge.consumerFactRef) ||
        !facts.has(edge.providerFactRef)
      )
        throw new Error('依赖必须连接已声明的具体事实，不能依赖整个 Context');
      validateRefs(snapshot, edge.sourceRefs, true);
      dependencies.get(edge.consumerFactRef)!.add(edge.providerFactRef);
    }
  }
  // Fulfillment is structurally within a contract. Only its agreement and party
  // facts are prerequisites; signing-channel and sibling obligations are NOT.
  const registered = new Set<string>();
  for (const contract of snapshot.content?.contractView.contracts ?? []) {
    const parent = contexts.get(contract.contextRef);
    if (parent?.kind !== 'contract')
      throw new Error(`已发现合同须按 Contract 评估：${contract.contextRef}`);
    registered.add(contract.contextRef);
    const partyFacts = refsOf(parent, 'parties');
    for (const role of contract.roleRefs) {
      const roleFacts = parent.facts
        .filter(
          (f) =>
            f.candidateRef === role &&
            (f.dimension === 'identity' || f.dimension === 'parties'),
        )
        .map((f) => `${parent.contextRef}.${f.key}`);
      for (const ref of partyFacts) {
        if (!role || !roleFacts.length) block(ref, '合同双方身份仍未明确');
        for (const roleFact of roleFacts)
          if (roleFact !== ref) dependencies.get(ref)!.add(roleFact);
      }
    }
    for (const item of contract.fulfillments) {
      const child = contexts.get(item.candidateRef);
      if (child?.kind !== 'fulfillment')
        throw new Error(
          `已发现履约须按 Fulfillment 评估：${item.candidateRef}`,
        );
      registered.add(item.candidateRef);
      for (const [dimension, value] of [
        ['request', item.request],
        ['deadline', item.deadline],
        ['confirmation', item.confirmation],
        ['parties', item.rightHolderRef && item.obligorRef],
      ] as const) {
        if (!value)
          for (const ref of refsOf(child, dimension))
            block(ref, `履约 ${dimension} 缺口尚未明确`);
      }
      for (const ref of refsOf(child, 'request')) {
        for (const dimension of ['agreement', 'parties']) {
          if (
            ![...dependencies.get(ref)!].some(
              (dep) =>
                dep.startsWith(`${parent.contextRef}.`) &&
                facts.get(dep)!.dimension === dimension,
            )
          )
            throw new Error(
              `履约 ${ref} 须显式依赖父合同相关 ${dimension} 事实；不能自动要求该维度的全部约定`,
            );
        }
      }
      // An exception needs its sourced trigger, not a blanket dependency on a
      // complete predecessor. Its exact evidence inputs use the declared edges.
      if (item.parentFulfillmentRef && !item.trigger)
        for (const ref of refsOf(child, 'request'))
          block(ref, '补偿触发依据未明确');
    }
  }
  for (const context of assessment.contexts)
    if (
      (context.kind === 'contract' || context.kind === 'fulfillment') &&
      !registered.has(context.contextRef)
    )
      throw new Error(
        `合同／履约 Context 缺少已保存的业务关系：${context.contextRef}`,
      );
  const blockers = unresolvedBlockingQuestions(snapshot);
  if (!assessment.applicability.applicable && blockers.length)
    throw new Error('简单胶水仍有未解决阻塞题，不能以不适用绕过发现');
  const questions = new Map(assessment.questions.map((q) => [q.questionId, q]));
  if (
    questions.size !== assessment.questions.length ||
    questions.size !== blockers.length ||
    blockers.some((q) => !questions.has(q.id))
  )
    throw new Error('评估必须逐项覆盖全部未解决阻塞题及实际事实影响');
  for (const question of assessment.questions) {
    validateRefs(snapshot, question.sourceRefs, true);
    for (const ref of question.affectedFactRefs ?? [...facts.keys()]) {
      if (!facts.has(ref)) throw new Error(`阻塞影响事实不存在：${ref}`);
      block(ref, question.questionId);
    }
  }
  // Reject circular proof; a cycle of mutually asserted outputs is not a basis.
  const available = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const check = (ref: string) => {
    if (visiting.has(ref)) throw new Error(`事实依赖循环，不能自证：${ref}`);
    if (visited.has(ref)) return;
    visiting.add(ref);
    for (const dep of dependencies.get(ref)!) {
      check(dep);
      if (!available.has(dep)) block(ref, `依赖事实未就绪：${dep}`);
    }
    visiting.delete(ref);
    visited.add(ref);
    if (!reasons.get(ref)!.size) available.add(ref);
  };
  facts.forEach((_, ref) => check(ref));
  const ready = assessment.contexts.filter((ctx) =>
    ctx.requiredFactRefs.every((ref) => available.has(ref)),
  );
  for (const context of ready) {
    const cases = snapshot.content!.cases.filter((c) =>
      context.caseRefs.includes(c.id),
    );
    for (const kind of ['normal', 'boundary', 'exception'])
      if (!cases.some((c) => c.kind === kind))
        throw new Error(
          `Context ${context.contextRef} 缺少 ${kind} 回放或有依据的不适用说明`,
        );
    if (context.kind === 'domain' && cases.some((c) => c.mode === 'evidence'))
      throw new Error('Domain 回放不得冒充履约单据模拟');
    for (const scenario of cases) {
      validateRefs(snapshot, scenario.sourceRefs, true);
      if (snapshot.staleRecordKeys.includes(`case:${scenario.id}`))
        throw new Error(`回放依据已失效：${scenario.id}`);
    }
  }
  const included = new Set<string>();
  const include = (ref: string) => {
    if (included.has(ref)) return;
    included.add(ref);
    dependencies.get(ref)!.forEach(include);
  };
  ready.forEach((ctx) => ctx.requiredFactRefs.forEach(include));
  const includedCandidateRefs = candidates
    .filter((c) =>
      [...included].some((ref) => facts.get(ref)!.candidateRef === c.id),
    )
    .map((c) => c.id);
  return {
    revision: snapshot.revision,
    assessment,
    includedFactRefs: [...facts.keys()].filter((ref) => included.has(ref)),
    includedCandidateRefs,
    pendingCandidateRefs: candidates
      .filter((c) => !includedCandidateRefs.includes(c.id))
      .map((c) => c.id),
    contexts: assessment.contexts.map((ctx) => ({
      contextRef: ctx.contextRef,
      status: ready.includes(ctx)
        ? 'ready'
        : [...included].some((ref) => ref.startsWith(`${ctx.contextRef}.`))
          ? 'support'
          : 'pending',
      includedFactRefs: [...included].filter((ref) =>
        ref.startsWith(`${ctx.contextRef}.`),
      ),
      missingFactRefs: ctx.requiredFactRefs.filter(
        (ref) => !available.has(ref),
      ),
    })),
    blockers: [...reasons]
      .filter(([, rs]) => rs.size)
      .map(([factRef, rs]) => ({ factRef, reasons: [...rs] })),
  };
}
