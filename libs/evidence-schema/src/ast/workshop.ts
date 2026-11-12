/**
 * The order a modeling workshop walks, in the method's own terms.
 *
 * This is not a property of a model — nothing on disk records a step — but every
 * surface that talks about modeling has to name the same seven moves: the
 * desktop shows them so a modeler can say "next, the breach path", the agent
 * reads the one a modeler picked as the focus of its turn, and the prompts are
 * written in this order. Naming them once keeps the chips and the instructions
 * from drifting apart.
 *
 * The order is deliberate: a contract before its obligations, obligations before
 * the things they trade in, the things before the computations over them, and
 * the happy path before its failures. Key data comes after the failures because
 * most amounts only become decidable once the compensation path is known.
 */
export const WORKSHOP_STEPS = [
  {
    id: 'anchor-contract',
    label: '锚定合约与双方',
    hint: '先确定哪一份合约约束双方，甲乙方分别是谁',
  },
  {
    id: 'pair-fulfillment',
    label: '成对挖掘履约项',
    hint: '权利方的请求是时段，义务方的确认是时刻',
  },
  {
    id: 'name-things',
    label: '补上标的物与领域组件',
    hint: '交易对象归领域；计价与判定抽成计算器或检查器',
  },
  {
    id: 'invert-dependency',
    label: '反转易变依赖',
    hint: '支付渠道、物流、开票换供应商时不该改主合约',
  },
  {
    id: 'close-breach',
    label: '给违约一条补偿路径',
    hint: '超时、断供、拒付各自触发新的履约对',
  },
  {
    id: 'trace-key-data',
    label: '让每个数字有来源',
    hint: '合同参数、前序凭证或派生规则，三者之外没有第四种',
  },
  {
    id: 'connect-flow',
    label: '串起业务宏流程',
    hint: '渠道、主合约、补充协议连成一条业务脊梁',
  },
] as const;

export type WorkshopStep = (typeof WORKSHOP_STEPS)[number];

export type WorkshopStepId = WorkshopStep['id'];

export const WORKSHOP_STEP_IDS: readonly WorkshopStepId[] = WORKSHOP_STEPS.map(
  (step) => step.id,
);

export const isWorkshopStepId = (value: unknown): value is WorkshopStepId =>
  typeof value === 'string' &&
  (WORKSHOP_STEP_IDS as readonly string[]).includes(value);

/** One-based position of a step, for the "第 3 步" the interface prints. */
export const workshopStepRank = (id: WorkshopStepId): number =>
  WORKSHOP_STEP_IDS.indexOf(id) + 1;

/**
 * How a modeler names the step they want next, inside their own message.
 *
 * The agent has no state to read a "current step" from, so the modeler says it:
 * the prefix travels with the prompt the way a workshop facilitator would read a
 * sticky note off the board.
 */
export const workshopStepFocus = (id: WorkshopStepId): string => {
  const step = WORKSHOP_STEPS.find((candidate) => candidate.id === id);

  return step === undefined
    ? ''
    : `【第 ${workshopStepRank(id)} 步 · ${step.label}】`;
};
