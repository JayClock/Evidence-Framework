import { useEffect, useMemo, useRef, useState } from 'react';
import { collectClauseTrace } from '@evidence-poc/evidence-model-core';
import {
  CLAUSE_CATEGORY_LABELS,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

const BACKGROUNDS = {
  business: '#eef2ff',
  domain: '#ecfdf3',
  boilerplate: '#f2f4f7',
  unknown: '#fff',
};

/** Private authoring material: this drawer is intentionally not a review-page projection. */
export const ClauseTraceDrawer = ({
  model,
  selectedNodeId,
  onFocusEntity,
}: {
  model: DomainModelDocument;
  selectedNodeId: string | null;
  onFocusEntity: (id: string) => void;
}) => {
  const trace = useMemo(() => collectClauseTrace(model), [model]);
  const [showLegal, setShowLegal] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const selectedClause = trace.clauses.find(
    (clause) =>
      selectedNodeId !== null && clause.entityIds.includes(selectedNodeId),
  );
  useEffect(() => {
    if (selectedClause?.category === 'boilerplate') setShowLegal(true);
    const selected = container.current?.querySelector(
      '[data-clause-selected="true"]',
    );
    selected?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [selectedNodeId, selectedClause?.id, showLegal]);
  if (trace.clauses.length === 0 && trace.fullText === null) {
    return (
      <p className="p-3 text-[11px] text-evidence-muted">
        暂无来源条款。可从合同导入，或为业务对象补充来源片段。
      </p>
    );
  }
  let previousEnd = 0;
  return (
    <div ref={container} className="h-full overflow-y-auto p-3 text-[11px]">
      <div className="sticky top-0 z-10 space-y-2 bg-white pb-3">
        <h3 className="font-semibold">条款审计</h3>
        <p>
          来源材料仅供本地审计，不随离线审查页发布。条款分类是阅读建议，不是法律判断。
        </p>
        {trace.fullText === null ? (
          <p role="status">仅保存来源片段，暂无合同全文；未推断条款分类。</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {(['business', 'domain', 'boilerplate'] as const).map((category) => (
            <span key={category}>
              {CLAUSE_CATEGORY_LABELS[category]}{' '}
              {
                trace.clauses.filter((clause) => clause.category === category)
                  .length
              }
            </span>
          ))}
        </div>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showLegal}
            onChange={(event) => setShowLegal(event.target.checked)}
          />
          显示纯法务条款
        </label>
        {trace.unmatchedEntityIds.length > 0 ? (
          <p role="alert">
            {trace.unmatchedEntityIds.length}{' '}
            个对象的来源无法唯一定位，请核对原文。未进行模糊匹配。
          </p>
        ) : null}
      </div>
      <div className="whitespace-pre-wrap leading-6" aria-label="合同来源原文">
        {trace.clauses.map((clause) => {
          const prefix =
            trace.fullText?.slice(previousEnd, clause.charStart) ?? '';
          previousEnd = clause.charEnd ?? 0;
          const selected =
            selectedNodeId !== null &&
            clause.entityIds.includes(selectedNodeId);
          const hidden = clause.category === 'boilerplate' && !showLegal;
          return (
            <div key={clause.id}>
              {prefix}
              <article
                data-clause-id={clause.id}
                data-clause-selected={selected}
                className={`mb-2 rounded border p-2 ${selected ? 'border-evidence-accent ring-2 ring-evidence-accent' : 'border-evidence-line'}`}
                style={{ backgroundColor: BACKGROUNDS[clause.category] }}
              >
                <div className="font-medium">
                  {clause.locator} ·{' '}
                  {clause.category === 'unknown'
                    ? '未分类片段'
                    : CLAUSE_CATEGORY_LABELS[clause.category]}
                </div>
                {hidden ? (
                  <button type="button" onClick={() => setShowLegal(true)}>
                    展开纯法务条款
                  </button>
                ) : (
                  <p>{clause.text}</p>
                )}
                {!hidden ? (
                  <div className="flex flex-wrap gap-1">
                    {clause.entityIds.length === 0 ? (
                      <span className="text-evidence-muted">
                        未关联模型对象
                      </span>
                    ) : (
                      clause.entityIds.map((id) => (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={id === selectedNodeId}
                          onClick={() => onFocusEntity(id)}
                          className="rounded border border-evidence-line bg-white px-2 hover:bg-evidence-hover"
                        >
                          定位{' '}
                          {model.entities.find((entity) => entity.id === id)
                            ?.label ?? id}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </article>
            </div>
          );
        })}
        {trace.fullText?.slice(previousEnd)}
      </div>
    </div>
  );
};
