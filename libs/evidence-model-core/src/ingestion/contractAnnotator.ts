import type { ClauseAnnotation, ClauseCategory } from '@evidence-poc/evidence-schema';

/**
 * One clause of an agreement, as the workshop reads it.
 *
 * A sentence can do two things at once: 「乙方在次月五日前按销售额的 30% 支付分成」
 * both obliges the seller and states a formula. The category says which bucket
 * decides where the clause goes; `computesValue` says the same sentence still
 * has to be answered by a rule, so the value never becomes a typed-in number.
 */
export interface ClauseReading extends ClauseAnnotation {
  /** True when the clause names a value the domain has to compute. */
  computesValue: boolean;
}

export interface ClauseReadingResult {
  clauses: readonly ClauseReading[];
  /** Clauses the reading could not place, in business language. */
  issues: readonly string[];
}

/**
 * What only a lawyer needs.
 *
 * These clauses are not evidence of anything the business does: they allocate
 * risk, name a forum, or describe how the document itself is delivered. Reading
 * them as obligations produces a model full of duties no system can discharge.
 */
const BOILERPLATE: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /不可抗力/, label: '不可抗力' },
  { pattern: /争议|仲裁|诉讼|法院|管辖/, label: '争议解决' },
  { pattern: /保密|商业秘密/, label: '保密义务' },
  { pattern: /送达|通知方式|通知地址|联系方式/, label: '通知与送达' },
  { pattern: /适用法律|法律适用|依照.{0,6}法律/, label: '法律适用' },
  { pattern: /免责|责任限制|不承担任何责任/, label: '责任限制' },
  { pattern: /一式|份数|附件|签署地|协议标题|可分割性/, label: '文件形式' },
  { pattern: /权利义务.{0,4}转让/, label: '权利义务转让' },
  { pattern: /律师费|诉讼费|公证费/, label: '费用承担' },
];

/**
 * Verbs that name something the business actually has to do.
 *
 * A clause carrying one of these is an obligation regardless of what else it
 * mentions, because the obligation is what the model has to discharge. The
 * formula in the same sentence is picked up separately, by `computesValue`.
 */
const BUSINESS_ACTIONS =
  /支付|付款|转账|缴纳|结算|发货|配送|送达.{0,4}货物|出库|开通|授权|激活|开票|开具|验收|签收|入库|交付|提交|出具|订阅|续费|扣费|代扣|退订|退款|退还|补偿|赔付|赔偿|提供|使用|访问|享受|领取|兑换|消费|终止|中止|暂停|解约|停服|注销|升级|降级|调整|签订|签署|签约|达成/;

/** Vocabulary that names a computed value rather than an act. */
const COMPUTATION: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /计算|折算|核算|公式|算法|按比例|比例|系数|费率|税率|汇率/, label: '计算口径' },
  { pattern: /百分之|\d+(?:\.\d+)?\s*%|乘以|除以|乘上/, label: '数值换算' },
  { pattern: /四舍五入|取整|进位|精度/, label: '取整规则' },
  { pattern: /阶梯|档位|区间|分段/, label: '阶梯规则' },
  { pattern: /上限|下限|封顶|保底|配额|额度/, label: '额度约束' },
  { pattern: /折扣|优惠|减免|抵扣/, label: '优惠规则' },
  { pattern: /有效期|失效|到期|顺延|累计|清零/, label: '期限规则' },
  { pattern: /校验|判定|是否|资格|条件/, label: '判定规则' },
  { pattern: /权重|评分|等级|成长值|积分/, label: '计量规则' },
];

/**
 * Domain nouns a clause is about, used to name the component it becomes.
 *
 * Naming is the one place a reading has to invent, so it only invents when the
 * clause already says what it computes. Anything else is reported and left to
 * the workshop, which is what keeps 「按约定计算」 from becoming a calculator
 * called 约定.
 */
const DOMAIN_NOUNS: readonly {
  pattern: RegExp;
  label: string;
  role: 'calculator' | 'checker';
}[] = [
  { pattern: /等级|成长值/, label: '会员等级', role: 'calculator' },
  { pattern: /积分/, label: '积分', role: 'calculator' },
  { pattern: /折扣|优惠|减免|抵扣/, label: '优惠金额', role: 'calculator' },
  { pattern: /有效期|失效|到期|顺延/, label: '有效期', role: 'calculator' },
  { pattern: /配额|额度|上限|封顶|保底/, label: '额度', role: 'calculator' },
  { pattern: /费率|税率|汇率|分成比例|佣金/, label: '费率', role: 'calculator' },
  { pattern: /校验|判定|资格|退订条件/, label: '资格', role: 'checker' },
];

/** Splits an agreement into the sentences a workshop can point at. */
export const splitContractClauses = (text: string): string[] =>
  text
    .split(/(?<=[。；！？!?\n])/)
    .map((clause) => clause.replaceAll(/[。；！？!?\n]/g, '').trim())
    .filter((clause) => clause.length > 0);

const firstMatch = (
  patterns: readonly { pattern: RegExp; label: string }[],
  clause: string,
): string | undefined =>
  patterns.find((candidate) => candidate.pattern.test(clause))?.label;

/**
 * Reads an agreement into the three buckets before anything is modelled.
 *
 * The order is the method's: risk allocation is filtered out first, because a
 * jurisdiction clause says 「提交仲裁委仲裁」 — an action verb — without obliging
 * the business to deliver anything; then an action verb decides the business
 * bucket; only then is a formula considered on its own. A clause that matches
 * nothing is kept as boilerplate *and reported*, so a sentence the reading did
 * not understand is visible instead of silently dropped or turned into a made-up
 * duty.
 */
export const annotateContractClauses = (
  text: string,
): ClauseReadingResult => {
  const clauses: ClauseReading[] = [];
  const issues: string[] = [];

  splitContractClauses(text).forEach((clause, position) => {
    const index = position + 1;
    const legal = firstMatch(BOILERPLATE, clause);
    const computesValue = COMPUTATION.some(({ pattern }) =>
      pattern.test(clause),
    );
    const computation = firstMatch(COMPUTATION, clause);
    const action = BUSINESS_ACTIONS.test(clause);

    const [category, reason] = ((): [ClauseCategory, string] => {
      if (legal !== undefined) {
        return ['boilerplate', `风险分配或程序性条款：${legal}`];
      }

      if (action) {
        return ['business', '约定了业务动作及其权责'];
      }

      if (computation !== undefined) {
        return ['domain', `描述了需要计算的取值：${computation}`];
      }

      return ['boilerplate', '未能归类，按不由系统承载处理'];
    })();

    if (legal !== undefined && action) {
      issues.push(
        `第 ${index} 句既含程序性内容（${legal}）又提到业务动作：「${clause.slice(0, 30)}…」。已按纯法务条款处理，若其中确有履约义务请人工移出。`,
      );
    }

    if (reason === '未能归类，按不由系统承载处理') {
      issues.push(
        `第 ${index} 句未能归入业务或领域：「${clause.slice(0, 30)}…」。已暂按纯法务条款处理，请人工确认。`,
      );
    }

    clauses.push({ index, text: clause, category, reason, computesValue });
  });

  return { clauses, issues };
};

/**
 * Names the domain component a computing clause describes, when the clause says
 * what it computes.
 *
 * Returns `undefined` for 「按约定计算」: a workshop that names its own
 * calculators is more useful than one that guesses, and an unnamed rule stays
 * visible as a gap.
 */
export const domainNounOf = (
  clause: string,
): { label: string; role: 'calculator' | 'checker' } | undefined => {
  const noun = DOMAIN_NOUNS.find(({ pattern }) => pattern.test(clause));

  if (noun === undefined) {
    return undefined;
  }

  return { label: noun.label, role: noun.role };
};
