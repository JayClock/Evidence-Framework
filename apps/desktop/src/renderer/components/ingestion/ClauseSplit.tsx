import {
  CLAUSE_CATEGORY_HINTS,
  CLAUSE_CATEGORY_LABELS,
  countClausesByCategory,
  type ClauseAnnotation,
} from '@evidence-poc/evidence-schema';

/**
 * What the clause reading decided, shown before the draft is trusted.
 *
 * The three buckets are the point of reading a contract this way: a reviewer has
 * to see which sentence became a duty, which became a calculation and which was
 * filtered out as boilerplate. Without it the reading is a black box that
 * quietly drops half an agreement.
 */
export const ClauseSplit = ({
  annotations,
}: {
  annotations: readonly ClauseAnnotation[];
}) => {
  const counts = countClausesByCategory(annotations);
  const boilerplate = annotations.filter(
    (annotation) => annotation.category === 'boilerplate',
  );

  return (
    <section
      aria-label="条款分类"
      className="rounded-md border border-evidence-line bg-[#fbfcfe] px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        {(['business', 'domain', 'boilerplate'] as const).map((category) => (
          <span
            className="rounded-full bg-[#f2f6fb] px-2 py-0.5 text-[10px] text-evidence-ink"
            key={category}
            title={CLAUSE_CATEGORY_HINTS[category]}
          >
            {CLAUSE_CATEGORY_LABELS[category]} {counts[category]}
          </span>
        ))}
        <span className="text-[10px] text-evidence-muted">
          业务条款落成凭证，领域条款抽成计算器，纯法务条款不进模型
        </span>
      </div>

      {boilerplate.length === 0 ? null : (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[10px] text-evidence-muted">
            被过滤的 {boilerplate.length} 句纯法务条款
          </summary>
          <ul className="mt-1 space-y-0.5">
            {boilerplate.map((annotation) => (
              <li
                className="text-[10px] leading-4 text-evidence-muted"
                key={annotation.index}
              >
                · {annotation.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};
