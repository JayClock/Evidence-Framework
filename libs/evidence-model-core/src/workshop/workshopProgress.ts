import {
  WORKSHOP_STEPS,
  isContractEntity,
  isFulfillmentRequest,
  type DomainModelDocument,
  type WorkshopStepId,
} from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '../model/graph.js';
import { buildKeyDataLedger } from '../keyData/keyDataLedger.js';
import { buildFmCheckReport } from '../validation/fmCheck.js';

export interface WorkshopProgress {
  id: WorkshopStepId;
  status: 'ready' | 'missing' | 'review';
  gaps: readonly string[];
}

/** Observable structural facts are not a claim that the business has approved. */
export const inspectWorkshop = (
  model: DomainModelDocument,
  contextRef: string,
): readonly WorkshopProgress[] => {
  const local = model.entities.filter(
    (e) => 'contextRef' in e && e.contextRef === contextRef,
  );
  const context = model.entities.find(
    (e) =>
      e.id === contextRef && e.category === 'context' && e.kind === 'contract',
  );
  const contracts = local.filter(isContractEntity);
  const contract = contracts[0];
  const roles = contract?.roleRefs ?? [];
  const anchored =
    !!context &&
    contracts.length === 1 &&
    roles.length === 2 &&
    new Set(roles).size === 2 &&
    roles.every((ref) =>
      local.some(
        (e) => e.id === ref && e.category === 'role' && e.kind === 'party',
      ),
    ) &&
    'rootRefs' in context &&
    context.rootRefs?.includes(contract!.id);
  const requests = local.filter(isFulfillmentRequest);
  const pairs = createDomainGraph(model).fulfillmentPairs();
  const pairGaps = [
    ...roles
      .filter((ref) => !requests.some((r) => r.responsibleRoleRef === ref))
      .map(
        (ref) =>
          `【${local.find((e) => e.id === ref)?.label ?? ref}】还没有作为权利方的履约请求。`,
      ),
    ...requests
      .filter(
        (r) =>
          !pairs.some(
            (p) => p.request.id === r.id && p.confirmations.length > 0,
          ),
      )
      .map((r) => `【${r.label}】尚缺履约确认。`),
  ];
  if (!requests.length) pairGaps.push('请先添加一项成对履约。');
  const owed = buildKeyDataLedger(model).decisionOwed.filter(
    (e) => e.contextRef === contextRef,
  );
  const fm = buildFmCheckReport({
    model,
    scopeRefs: context ? [contextRef] : undefined,
  }).report;
  const results: Record<WorkshopStepId, Omit<WorkshopProgress, 'id'>> = {
    'anchor-contract': {
      status: anchored ? 'ready' : 'missing',
      gaps: anchored
        ? []
        : ['请选择或建立一个以根合同约束两个不同合同角色的上下文。'],
    },
    'pair-fulfillment': {
      status: anchored && !pairGaps.length ? 'ready' : 'missing',
      gaps: pairGaps,
    },
    'name-things': {
      status: 'review',
      gaps: [
        '请人工核对标的物引用及计算器／检查器的边界；结构检查不能判定业务计算是否完整。',
      ],
    },
    'invert-dependency': {
      status: 'review',
      gaps: [
        '请人工核对易变供应商是否通过角色协作；不强制每个业务引入第三方。',
      ],
    },
    'close-breach': {
      status: 'review',
      gaps: [
        '请逐项核对超时、拒绝、断供的补偿及责任终点；没有补偿边不等于业务必然缺失。',
      ],
    },
    'trace-key-data': {
      status: anchored && !owed.length ? 'ready' : 'missing',
      gaps: owed.map(
        (e) => `【${e.entityLabel}.${e.label}】还欠一项数据来源决定。`,
      ),
    },
    'connect-flow': {
      status: context && fm.valid ? 'review' : 'missing',
      gaps: [
        ...fm.errors,
        ...fm.gaps,
        '静态检查不代表业务确认，也不代表后端 HTTP 验收通过。',
      ],
    },
  };
  return WORKSHOP_STEPS.map(({ id }) => ({ id, ...results[id] }));
};
