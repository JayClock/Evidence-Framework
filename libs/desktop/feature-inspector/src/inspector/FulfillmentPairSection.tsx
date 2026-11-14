import { useMemo, useState } from 'react';

import {
  type EvidenceEntityAST,
  type RuleAST,
  isEvidenceEntity,
} from '@evidence-poc/evidence-schema';
import {
  BindBreachRuleCommand,
  PairFulfillmentCommand,
  UpdateRuleCommand,
  type DomainGraph,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';

import { CelCodeMirrorEditor } from './cel/CelCodeMirrorEditor';
import { useCelCompletion } from './useCelCompletion';

interface FulfillmentPairSectionProps {
  entity: EvidenceEntityAST;
  graph: DomainGraph;
  session: ModelSession;
}

const DEFAULT_BREACH_EXPRESSION =
  '!confirmations.exists(c, c.confirmed_at <= request.expired_at)';

/**
 * Request-side fulfillment structure: completion condition, its result
 * confirmation, and the breach condition.
 *
 * Everything here is read back from the graph (`fulfillmentPair`), so the panel
 * can never present a confirmation the model does not actually pair, and a
 * breach never implies follow-up evidence that nobody modeled.
 */
export const FulfillmentPairSection = ({
  entity,
  graph,
  session,
}: FulfillmentPairSectionProps) => {
  const [pairing, setPairing] = useState(false);
  const [breaching, setBreaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pair = graph.fulfillmentPair(entity.id);

  if (entity.kind !== 'fulfillment_request') {
    return null;
  }

  const confirmationsInContext = graph
    .entitiesInContext(entity.contextRef)
    .filter(
      (candidate): candidate is EvidenceEntityAST =>
        isEvidenceEntity(candidate) &&
        candidate.kind === 'fulfillment_confirmation' &&
        candidate.id !== entity.id,
    );
  const alreadyPaired = new Set(
    (pair?.confirmations ?? []).map((confirmation) => confirmation.id),
  );
  const candidates = confirmationsInContext.filter(
    (candidate) => !alreadyPaired.has(candidate.id),
  );

  return (
    <section data-region="fulfillment-pair">
      <h3 className="mb-1.5 text-[10px] font-semibold tracking-wide text-[#59606c] uppercase">
        履约结构
      </h3>

      <div className="space-y-1.5">
        {error !== null ? (
          <p
            data-pair-error=""
            className="rounded border border-evidence-evidence/40 bg-[#fff7f8] px-2 py-1 text-[9px] leading-snug text-evidence-evidence"
          >
            {error}
          </p>
        ) : null}

        <div className="rounded border border-evidence-line bg-white px-2 py-1">
          <p className="text-[9px] text-[#59606c]">完成条件</p>
          {pair === undefined || pair.completionRules.length === 0 ? (
            <p className="mt-0.5 text-[9px] text-[#8a929e]">未声明完成规则</p>
          ) : (
            pair.completionRules.map((rule) => (
              <CompletionRuleEditor
                key={rule.id}
                entity={entity}
                graph={graph}
                session={session}
                rule={rule}
              />
            ))
          )}

          <p className="mt-1 text-[9px] text-[#59606c]">对应完成凭证</p>
          {pair === undefined || pair.confirmations.length === 0 ? (
            <p className="mt-0.5 text-[9px] text-[#8a929e]">
              未声明结果端确认；确认凭证不是条件成立后自动生成的节点。
            </p>
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {pair.confirmations.map((confirmation) => (
                <li
                  key={confirmation.id}
                  className="truncate text-[9px] text-evidence-ink"
                >
                  → {confirmation.label}
                  <span className="ml-1 font-mono text-[8px] text-evidence-muted">
                    {confirmation.id}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {pairing ? (
            <PairForm
              request={entity}
              candidates={candidates}
              onCancel={() => setPairing(false)}
              onPair={(confirmationId) => {
                setError(
                  dispatchOrReportError(
                    session,
                    () =>
                      new PairFulfillmentCommand({
                        requestRef: entity.id,
                        confirmationRef: confirmationId,
                      }),
                  ),
                );
                setPairing(false);
              }}
            />
          ) : (
            <button
              type="button"
              disabled={candidates.length === 0}
              onClick={() => setPairing(true)}
              className="mt-1 rounded border border-evidence-line px-1.5 py-0.5 text-[9px] text-evidence-muted hover:border-evidence-accent disabled:opacity-40"
              title={
                candidates.length === 0
                  ? '当前合同内没有可配对的结果确认凭证。'
                  : '把同合同内的结果确认绑定为本请求的完成凭证。'
              }
            >
              配对结果确认
            </button>
          )}
        </div>

        <div className="rounded border border-evidence-line bg-white px-2 py-1">
          <p className="text-[9px] text-[#59606c]">违约条件</p>
          {pair === undefined || pair.breachRules.length === 0 ? (
            <>
              <p className="mt-0.5 text-[9px] text-[#8a929e]">未声明</p>
              {breaching ? (
                <BreachForm
                  request={entity}
                  graph={graph}
                  onCancel={() => setBreaching(false)}
                  onBind={(rule) => {
                    setError(
                      dispatchOrReportError(
                        session,
                        () =>
                          new BindBreachRuleCommand({
                            requestRef: entity.id,
                            rule,
                          }),
                      ),
                    );
                    setBreaching(false);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setBreaching(true)}
                  className="mt-1 rounded border border-evidence-line px-1.5 py-0.5 text-[9px] text-evidence-muted hover:border-evidence-accent"
                >
                  新增违约条件
                </button>
              )}
            </>
          ) : (
            pair.breachRules.map((rule) => (
              <div key={rule.id} className="mt-0.5">
                <p className="text-[9px] text-evidence-ink">{rule.label}</p>
                <p className="text-[9px] leading-snug text-[#6b7280]">
                  {rule.description}
                </p>
                <p className="mt-0.5 font-mono text-[8px] text-[#6b7280]">
                  {rule.expression}
                </p>
              </div>
            ))
          )}
          <p className="mt-1 text-[8px] leading-snug text-[#9aa1ac]">
            违约后的凭证：未声明。模型不推断违约后的自动流转，也不补造补偿请求。
          </p>
        </div>
      </div>
    </section>
  );
};

/**
 * Runs one command and reports a rejected guard instead of crashing the panel.
 *
 * Command guards are the authority on red lines, so their message is the message
 * the modeler should read.
 */
const dispatchOrReportError = (
  session: ModelSession,
  create: () => Parameters<ModelSession['dispatch']>[0],
): string | null => {
  try {
    session.dispatch(create());

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '操作被拒绝。';
  }
};

const CompletionRuleEditor = ({
  entity,
  graph,
  session,
  rule,
}: {
  entity: EvidenceEntityAST;
  graph: DomainGraph;
  session: ModelSession;
  rule: RuleAST;
}) => {
  const candidates = useCelCompletion({
    graph,
    entityRef: entity.id,
    ruleId: rule.id,
  });
  const aliases = useMemo(
    () =>
      Object.entries(rule.bindings).map(([alias, binding]) =>
        'ref' in binding
          ? `${alias} → ${graph.getEntity(binding.ref)?.label ?? binding.ref}`
          : `${alias} → 运行时 ${binding.type}`,
      ),
    [graph, rule.bindings],
  );

  return (
    <div className="mt-0.5">
      <p className="text-[9px] text-evidence-ink">{rule.label}</p>
      <p className="text-[9px] leading-snug text-[#6b7280]">
        {rule.description}
      </p>
      <CelCodeMirrorEditor
        value={rule.expression}
        candidates={candidates}
        ariaLabel={`${rule.id} CEL 表达式`}
        onCommit={(expression) => {
          if (expression !== rule.expression) {
            session.dispatch(new UpdateRuleCommand(rule.id, { expression }));
          }
        }}
      />
      <p className="mt-0.5 text-[8px] text-[#8a929e]">
        输入：{aliases.join('，')}
      </p>
    </div>
  );
};

const PairForm = ({
  request,
  candidates,
  onPair,
  onCancel,
}: {
  request: EvidenceEntityAST;
  candidates: readonly EvidenceEntityAST[];
  onPair: (confirmationId: string) => void;
  onCancel: () => void;
}) => {
  const [selected, setSelected] = useState(candidates[0]?.id ?? '');

  return (
    <div className="mt-1 space-y-1">
      <select
        aria-label={`${request.id} 结果确认`}
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className="w-full rounded border border-evidence-line bg-white px-1 py-0.5 text-[9px]"
      >
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={selected === ''}
          onClick={() => onPair(selected)}
          className="rounded bg-evidence-accent px-1.5 py-0.5 text-[9px] text-white disabled:opacity-40"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-evidence-line px-1.5 py-0.5 text-[9px] text-evidence-muted"
        >
          取消
        </button>
      </div>
    </div>
  );
};

const BreachForm = ({
  request,
  graph,
  onBind,
  onCancel,
}: {
  request: EvidenceEntityAST;
  graph: DomainGraph;
  onBind: (rule: {
    id: string;
    label: string;
    description: string;
    bindings: Record<string, { ref: string }>;
    expression: string;
    resultType: 'bool';
  }) => void;
  onCancel: () => void;
}) => {
  const candidates = useCelCompletion({
    graph,
    entityRef: request.id,
  });
  const [ruleId, setRuleId] = useState(`rule.${request.id}-breach`);
  const [description, setDescription] = useState(
    '请求有效期内没有任何交付确认形成时，判定为违约。',
  );
  const [expression, setExpression] = useState(DEFAULT_BREACH_EXPRESSION);

  return (
    <div className="mt-1 space-y-1">
      <input
        aria-label="违约规则 ID"
        value={ruleId}
        onChange={(event) => setRuleId(event.target.value)}
        className="w-full rounded border border-evidence-line bg-white px-1.5 py-0.5 font-mono text-[9px]"
      />
      <input
        aria-label="违约规则业务解释"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className="w-full rounded border border-evidence-line bg-white px-1.5 py-0.5 text-[9px]"
      />
      <CelCodeMirrorEditor
        value={expression}
        candidates={candidates}
        ariaLabel="违约规则表达式"
        onCommit={setExpression}
      />
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() =>
            onBind({
              id: ruleId,
              label: `${request.label}违约判断`,
              description,
              bindings: { request: { ref: request.id } },
              expression,
              resultType: 'bool',
            })
          }
          className="rounded bg-evidence-accent px-1.5 py-0.5 text-[9px] text-white"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-evidence-line px-1.5 py-0.5 text-[9px] text-evidence-muted"
        >
          取消
        </button>
      </div>
    </div>
  );
};
