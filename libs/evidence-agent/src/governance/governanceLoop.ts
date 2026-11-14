/**
 * Deciding what a drift finding means for the next turn.
 *
 * The policy is deliberately a pure function of what the sensors reported: the
 * loop that surrounds it can retry, ask a person or patch the model, but it may
 * not reinterpret a finding on the way. Everything here is structural, so the
 * orchestrator's audit and the desktop's status bar feed the same decision
 * without either package depending on the other.
 */

/** A production drift as this loop reads it. */
export interface GovernanceDrift {
  kind: string;
  severity: 'block' | 'warn';
  message: string;
  evidenceRef?: string | null;
  contextRef?: string | null;
}

/** What the replay of the model's own scenarios reported. */
export interface GovernanceSimulation {
  scenarioCount: number;
  passedCount: number;
  errors?: readonly string[];
}

export type GovernanceVerdict =
  | 'healthy'
  | 'model_lagging'
  | 'production_overreach'
  | 'needs_repair';

export type GovernanceActionKind =
  | 'adopt_production_change'
  | 'close_compensation_gap'
  | 'move_write_to_owner'
  | 'raise_blocking_ticket'
  | 'repair_model';

/** One thing the next turn may do, and the tool that would do it. */
export interface GovernanceAction {
  kind: GovernanceActionKind;
  /** Entity or context the action is about, when the finding named one. */
  target: string | null;
  reason: string;
  /** Macro tool that performs it; null when the action is a person's decision. */
  tool: string | null;
}

export interface GovernanceDecision {
  verdict: GovernanceVerdict;
  /** One line per signal group, so a reader can see why the verdict was chosen. */
  rationale: readonly string[];
  actions: readonly GovernanceAction[];
  /** True only when the model may be edited: no blocking drift and a green replay. */
  canPatchModel: boolean;
}

const action = (
  kind: GovernanceActionKind,
  drift: GovernanceDrift | null,
  reason: string,
  tool: string | null,
): GovernanceAction => ({
  kind,
  target: drift?.evidenceRef ?? drift?.contextRef ?? null,
  reason,
  tool,
});

/**
 * One action per finding kind.
 *
 * The split matters more than the wording: some findings mean the model fell
 * behind a change the business already made, and some mean a service wrote what
 * nobody agreed to. For the first, the model moves. For the second, it must not.
 */
const actionFor = (drift: GovernanceDrift): GovernanceAction => {
  switch (drift.kind) {
    case 'UNMODELED_EVIDENCE_COMMITTED':
      return action(
        'adopt_production_change',
        drift,
        '生产提交了模型里没有的凭证：先确认它代表一笔真实业务，再把它补进所属上下文。',
        'roleify_and_invert_dependency',
      );
    case 'UNMODELED_ATTRIBUTE_WRITTEN':
      return action(
        'adopt_production_change',
        drift,
        '生产写入了未声明的字段：要么补声明并给出提供方，要么让服务停止写入。',
        'apply_model_patch',
      );
    case 'BREACH_WITHOUT_FOLLOW_UP':
      return action(
        'close_compensation_gap',
        drift,
        '违约之后没有任何后续履约：补一条补偿履约对，而不是把违约当作结束。',
        'add_breach_compensation',
      );
    case 'CROSS_CONTEXT_WRITE':
      return action(
        'move_write_to_owner',
        drift,
        '凭证被别的上下文直接写入：让所属上下文自己提交，或改成一次显式履约调用。',
        'apply_model_patch',
      );
    case 'DERIVED_VALUE_SUPPLIED':
      return action(
        'raise_blocking_ticket',
        drift,
        '派生值被当成入参写入：这是服务端漏洞，不能靠改模型迁就。',
        null,
      );
    default:
      return action(
        'raise_blocking_ticket',
        drift,
        `无法归类的漂移 ${drift.kind}：交给人工判定，不要自行修改模型。`,
        null,
      );
  }
};

const VERDICT_OF_ACTION: Readonly<
  Record<GovernanceActionKind, GovernanceVerdict | null>
> = {
  adopt_production_change: 'model_lagging',
  close_compensation_gap: 'model_lagging',
  move_write_to_owner: 'production_overreach',
  raise_blocking_ticket: 'production_overreach',
  repair_model: 'needs_repair',
};

/**
 * Turns the sensors into one verdict and the actions it licenses.
 *
 * A failing replay closes the patch path even when the drift is adoptable: the
 * model has to be green before it may absorb a production change, or the
 * repair would be built on a broken baseline.
 */
export const decideGovernance = ({
  drift,
  simulation,
}: {
  drift: readonly GovernanceDrift[];
  simulation?: GovernanceSimulation;
}): GovernanceDecision => {
  const rationale: string[] = [];
  const actions = drift.map(actionFor);

  if (drift.length === 0) {
    rationale.push('生产与模型没有分歧。');
  }

  for (const item of drift) {
    rationale.push(
      `${item.severity === 'block' ? '[阻塞]' : '[警告]'} ${item.kind}：${item.message}`,
    );
  }

  const blocking = drift.filter((item) => item.severity === 'block');
  const replayFailed =
    simulation !== undefined && simulation.passedCount < simulation.scenarioCount;

  if (simulation === undefined) {
    rationale.push('没有回放结果：本轮不确认模型仍然成立。');
  } else {
    rationale.push(
      `${simulation.passedCount}/${simulation.scenarioCount} 个场景通过回放。`,
    );
  }

  if (replayFailed) {
    actions.push({
      kind: 'repair_model',
      target: null,
      reason: '已有场景回放失败：先修好模型，再谈吸收生产变化。',
      tool: 'run_sensors',
    });
  }

  const verdictOf = (item: GovernanceAction): GovernanceVerdict | null =>
    VERDICT_OF_ACTION[item.kind];

  const ranked = actions
    .map(verdictOf)
    .filter((item): item is GovernanceVerdict => item !== null);

  const verdict: GovernanceVerdict = ranked.includes('production_overreach')
    ? 'production_overreach'
    : replayFailed || ranked.includes('needs_repair')
      ? 'needs_repair'
      : ranked.includes('model_lagging')
        ? 'model_lagging'
        : 'healthy';

  return {
    verdict,
    rationale,
    actions,
    canPatchModel:
      blocking.length === 0 &&
      !replayFailed &&
      simulation !== undefined &&
      verdict === 'model_lagging',
  };
};
