import type {
  IngestionDraft,
  IngestionSourceKind,
} from '@evidence-poc/evidence-schema';

import { assembleDraftFromRows, type DraftRow } from './draftAssembly.js';

export interface TextExtractionOptions {
  modelName?: string;
  source?: IngestionSourceKind;
  /** Context labels, for a caller that names them differently. */
  contractContextLabel?: string;
  preContractContextLabel?: string;
  domainContextLabel?: string;
}

export interface TextExtractionResult {
  draft: IngestionDraft;
  issues: readonly string[];
}

/**
 * What establishes a contract in a clause.
 *
 * 订阅 and 开通会员 are here because a subscription *is* the agreement in the
 * lecture's own example; requiring the word 合同 would read that case as a
 * document list with no contract at all.
 */
const AGREEMENT = /签订|签署|签约|认购|订阅|开通会员/;
const AGREEMENT_SUBJECT = /合同|协议|专栏|课程|服务|会员/;

/** Verbs a business clause uses to name what has to be delivered. */
const ACTIONS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /退款|退还|退回/, label: '退款' },
  { pattern: /支付|付款|付清|转账|缴纳/, label: '支付' },
  { pattern: /发货|配送|送达|出库/, label: '发货' },
  { pattern: /开通|授权|激活/, label: '开通' },
  { pattern: /开票|开具发票/, label: '开票' },
  { pattern: /验收|签收|入库/, label: '验收' },
  { pattern: /交付|提交|出具报告/, label: '交付' },
];

/** A clause that names a deadline is an obligation, so it reads as a request. */
const DEADLINE = /(\d+|几|若干)\s*(个)?\s*(工作日|自然日|日|天|小时|分钟)|及时|尽快|期限内|到期/;

/** A clause that names completion is the result side. */
const COMPLETION = /完成|确认|到账|签收|验收|收到|出具|已开通|已支付/;

/** Documents a clause mentions as proof, mapped to their business name. */
const PROOFS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /转账凭证|银行回单|付款凭证/, label: '转账凭证' },
  { pattern: /确认函/, label: '确认函' },
  { pattern: /发票|增值税专用发票/, label: '发票' },
  { pattern: /送货单|签收单|物流单/, label: '送货单' },
  { pattern: /质检报告|检测报告/, label: '质检报告' },
  { pattern: /对账单/, label: '对账单' },
];

/** Nouns a clause trades in; a hit becomes the draft's thing. */
const THINGS = [
  '商品',
  '货物',
  '物资',
  '服务',
  '专栏',
  '课程',
  '手机',
  '设备',
  '账号',
  '货款',
  '技术服务费',
] as const;

/**
 * A party as business text names it: which side, plus at most one job word.
 *
 * The job word is an allowlist rather than "any two characters", because a
 * greedy tail swallows the following verb and turns 读者未在 into a party.
 */
const PARTY =
  /(甲方|乙方|买方|卖方|供应商|采购方|读者|极客时间|平台|承运方|服务方)(代表|专员|经理|主管|财务|采购员|销售|库管|顾问|负责人|人员)?/g;

const splitClauses = (text: string): string[] =>
  text
    .split(/(?<=[。；！？!?\n])/)
    .map((clause) => clause.replaceAll(/[。；！？!?\n]/g, '').trim())
    .filter((clause) => clause.length > 0);

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const partiesOf = (clause: string): string[] =>
  unique(
    [...clause.matchAll(PARTY)]
      .map((match) => `${match[1] ?? ''}${match[2] ?? ''}`.trim())
      .filter((name) => name.length >= 2),
  );

const thingOf = (clause: string): string | undefined =>
  THINGS.find((thing) => clause.includes(thing));

const contractLabelOf = (clause: string): string => {
  const quoted = /《([^》]+)》/.exec(clause)?.[1];

  if (quoted !== undefined) {
    return quoted;
  }

  const named = /([\u4e00-\u9fa5]{2,10}(?:合同|协议))/.exec(clause)?.[1];

  if (named !== undefined) {
    return named;
  }

  // 订阅 and 会员 are agreements the text names by their subject, not by the
  // word 合同: 「读者订阅极客时间专栏」is the 极客时间专栏订阅协议.
  // Two to four characters keeps the nearest noun: the leftmost match of a
  // longer run would swallow the readers as part of the subject.
  const subject = /([\u4e00-\u9fa5]{2,4})(专栏|课程|服务|会员)/.exec(clause);

  return subject === null ? '业务合同' : `${subject[0]}订阅协议`;
};

const isBreachClause = (clause: string): boolean =>
  /违约|未按|未能|逾期|未在/.test(clause);

/**
 * Reads business prose into rows without a model.
 *
 * This is the offline reading, not the good one: it recognises the vocabulary
 * the lecture uses (deadlines, completion verbs, proof documents, the two sides
 * of a contract) and nothing more. Whatever it cannot see stays missing and is
 * reported, so the review panel still decides the model — which is also what
 * keeps the result honest when no model is configured.
 *
 * The clause discipline it does encode is the one that matters: a clause with a
 * deadline is an obligation (`request`), a clause that only reports a result is
 * its answer (`confirmation`), and a clause that repairs a failure is another
 * obligation rather than a rollback.
 */
export const draftFromBusinessText = (
  text: string,
  options: TextExtractionOptions = {},
): TextExtractionResult => {
  const rows: DraftRow[] = [];
  const issues: string[] = [];
  const clauses = splitClauses(text);

  if (clauses.length === 0) {
    return {
      draft: assembleDraftFromRows([], {
        modelName: options.modelName ?? '文本导入的履约模型',
        source: options.source ?? 'unknown',
      }).draft,
      issues: ['没有读到任何业务句子。'],
    };
  }

  let line = 0;
  const emitted = new Set<string>();

  const push = (row: Omit<DraftRow, 'line'>): void => {
    line += 1;
    rows.push({ ...row, line });
  };

  const contractParties = clauses
    .filter((clause) => /签订|签署|签约|达成/.test(clause))
    .map(partiesOf)
    .find((parties) => parties.length >= 2);

  for (const clause of clauses) {
    const stage = isBreachClause(clause) ? '违约处理' : '业务流程';
    const parties = partiesOf(clause);
    const thing = thingOf(clause);
    const breach = isBreachClause(clause);

    if (AGREEMENT.test(clause) && AGREEMENT_SUBJECT.test(clause)) {
      push({
        stage: '合约确立',
        activity: clause,
        evidence: contractLabelOf(clause),
        kind: 'contract',
        parties: (contractParties ?? parties).slice(0, 2),
        ...(thing === undefined ? {} : { thing }),
      });
    }

    if (/询价|征集|招标|索取方案/.test(clause)) {
      push({
        stage: '合约前阶段',
        activity: clause,
        evidence: '询价单',
        kind: 'rfp',
        parties,
        ...(thing === undefined ? {} : { thing }),
      });
    }

    if (/报价|提案|方案/.test(clause) && !/询价/.test(clause)) {
      push({
        stage: '合约前阶段',
        activity: clause,
        evidence: '报价单',
        kind: 'proposal',
        parties,
        ...(thing === undefined ? {} : { thing }),
      });
    }

    const actions = ACTIONS.filter((action) => action.pattern.test(clause));

    for (const action of actions) {
      // A breach clause names both the obligation that failed and its repair, so
      // 开通 appears again after 开通申请 already exists. Today's text establishes
      // the obligation once; a second reading of the same document is a
      // duplicate, not a second commitment.
      if (emitted.has(`${action.label}`)) {
        continue;
      }

      const hasDeadline = DEADLINE.test(clause);
      const hasCompletion = COMPLETION.test(clause);

      // A deadline governs the claim, so a clause with both is still a request;
      // its confirmation is the next clause that reports the result.
      if (hasDeadline || !hasCompletion) {
        emitted.add(`${action.label}`);
        push({
          stage,
          activity: clause,
          evidence: `${action.label}申请`,
          kind: 'fulfillment_request',
          parties,
          ...(thing === undefined ? {} : { thing }),
        });
        continue;
      }

      emitted.add(`${action.label}`);
      push({
        stage,
        activity: clause,
        evidence: `${action.label}确认`,
        kind: 'fulfillment_confirmation',
        parties,
        ...(thing === undefined ? {} : { thing }),
      });
    }

    for (const proof of PROOFS) {
      if (!proof.pattern.test(clause)) {
        continue;
      }

      push({
        stage,
        activity: clause,
        evidence: proof.label,
        kind: 'other_evidence',
        parties,
        ...(thing === undefined ? {} : { thing }),
      });
    }

    if (breach) {
      issues.push(`「${clause.slice(0, 24)}…」按违约处理读入，请确认它触发了哪一项补偿。`);
    }
  }

  const assembled = assembleDraftFromRows(rows, {
    modelName: options.modelName ?? '文本导入的履约模型',
    source: options.source ?? 'unknown',
    description: '由业务自然语言导入：先找合约，再分成对的履约，违约读成新的履约。',
    ...(options.contractContextLabel === undefined
      ? {}
      : { contractContextLabel: options.contractContextLabel }),
    ...(options.preContractContextLabel === undefined
      ? {}
      : { preContractContextLabel: options.preContractContextLabel }),
    ...(options.domainContextLabel === undefined
      ? {}
      : { domainContextLabel: options.domainContextLabel }),
  });

  return { draft: assembled.draft, issues: [...issues, ...assembled.issues] };
};
