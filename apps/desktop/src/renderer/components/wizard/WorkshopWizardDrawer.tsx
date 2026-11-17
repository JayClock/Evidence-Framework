import { useMemo, useState } from 'react';
import {
  WORKSHOP_STEPS,
  isContractEntity,
} from '@evidence-poc/evidence-schema';
import {
  inspectWorkshop,
  anchorWorkshopContract,
  addWorkshopFulfillment,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';

const fieldClass =
  'w-full rounded border border-evidence-line p-1.5 text-[12px]';
export const WorkshopWizardDrawer = ({
  session,
  onFocus,
  onReview,
}: {
  session: ModelSession;
  onFocus: (id: string) => void;
  onReview: (step: string) => void;
}) => {
  const model = session.getDocument();
  const contracts = model.entities.filter(isContractEntity);
  const [chosen, setChosen] = useState('');
  const contract =
    contracts.find((c) => c.contextRef === chosen) ?? contracts[0];
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const progress = useMemo(
    () => inspectWorkshop(model, contract?.contextRef ?? ''),
    [model, contract?.contextRef],
  );
  const step = WORKSHOP_STEPS[stepIndex]!;
  const current = progress[stepIndex];
  const roles = (contract?.roleRefs ?? []).flatMap((ref) =>
    model.entities.filter((e) => e.id === ref),
  );
  const commit = (action: () => void) => {
    try {
      action();
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <section
      aria-label="共创工作坊"
      className="space-y-3 overflow-auto p-3 text-[12px]"
    >
      <p>按问题共创模型。可自由跳步；“结构就绪”不等于业务确认。</p>
      <label>
        当前合约
        <select
          className={fieldClass}
          aria-label="工作坊合约"
          value={contract?.contextRef ?? ''}
          onChange={(e) => setChosen(e.target.value)}
        >
          {!contracts.length ? <option value="">尚未建立合约</option> : null}
          {contracts.map((c) => (
            <option key={c.id} value={c.contextRef}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <nav aria-label="工作坊步骤" className="space-y-1">
        {WORKSHOP_STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={i === stepIndex ? 'step' : undefined}
            className="block w-full rounded border border-evidence-line p-2 text-left"
            onClick={() => setStepIndex(i)}
          >
            {i + 1}. {s.label} ·{' '}
            {progress[i]?.status === 'ready'
              ? '结构就绪'
              : progress[i]?.status === 'review'
                ? '待人工核对'
                : '待补充'}
          </button>
        ))}
      </nav>
      <h3 className="font-semibold">{step.businessPrompt}</h3>
      <ul className="space-y-1 text-evidence-muted">
        {current?.gaps.map((gap) => (
          <li key={gap}>{gap}</li>
        ))}
      </ul>
      {stepIndex === 0 ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            commit(() => {
              const result = session.mutate(
                (draft) =>
                  anchorWorkshopContract(draft, {
                    label: String(data.get('label') ?? ''),
                    partyA: String(data.get('partyA') ?? ''),
                    partyB: String(data.get('partyB') ?? ''),
                  }),
                '工作坊：锚定合约',
              );
              setChosen(result.contextRef);
              onFocus(result.contractRef);
            });
          }}
        >
          {[
            ['label', '合约名称'],
            ['partyA', '一方角色'],
            ['partyB', '另一方角色'],
          ].map(([name, label]) => (
            <label key={name} className="block">
              {label}
              <input
                className={fieldClass}
                name={name}
                aria-label={label}
                required
              />
            </label>
          ))}
          <button className={fieldClass} type="submit">
            建立合约与双方
          </button>
        </form>
      ) : null}
      {stepIndex === 1 && contract ? (
        <form
          key={contract.id}
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            commit(() => {
              const result = session.mutate(
                (draft) =>
                  addWorkshopFulfillment(draft, {
                    contextRef: contract.contextRef,
                    claimantRef: String(data.get('claimant')),
                    obligorRef: String(data.get('obligor')),
                    label: String(data.get('label') ?? ''),
                    confirmationLabel: String(
                      data.get('confirmationLabel') ?? '',
                    ),
                    deadlineBasis: String(data.get('deadlineBasis') ?? ''),
                  }),
                '工作坊：成对添加履约',
              );
              onFocus(result.request.id);
            });
          }}
        >
          {(['claimant', 'obligor'] as const).map((name, i) => (
            <label key={name} className="block">
              {i ? '义务方' : '权利方'}
              <select
                name={name}
                aria-label={i ? '义务方' : '权利方'}
                defaultValue={roles[i]?.id}
                className={fieldClass}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {[
            ['label', '履约要求'],
            ['confirmationLabel', '完成凭证'],
            ['deadlineBasis', '截止依据'],
          ].map(([name, label]) => (
            <label key={name} className="block">
              {label}
              <input
                name={name}
                aria-label={label}
                required
                className={fieldClass}
              />
            </label>
          ))}
          <button type="submit" className={fieldClass}>
            成对添加履约项
          </button>
        </form>
      ) : null}
      {stepIndex > 1 ? (
        <button
          type="button"
          className={fieldClass}
          onClick={() => onReview(`${step.label}：${step.businessPrompt}`)}
        >
          带着当前问题进入 AI 协同
        </button>
      ) : null}
      {contract ? (
        <button
          type="button"
          className={fieldClass}
          onClick={() => onFocus(contract.id)}
        >
          定位当前合约
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
};
