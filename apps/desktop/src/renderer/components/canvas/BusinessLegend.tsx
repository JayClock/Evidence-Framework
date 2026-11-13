import { useId, useState } from 'react';
import type { CanvasViewMode } from '@evidence-poc/evidence-canvas-interaction';

import { CATEGORY_TOKENS, CROSS_CONTEXT_EDGE_STYLES, EDGE_STYLES } from './colors';

const STORAGE_KEY = 'evidence.canvas.legend.expanded';
const readExpanded = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

interface BusinessLegendProps {
  compact?: boolean;
  /**
   * The board's reading level, not a preference of the panel itself.
   *
   * A workshop board and a hand-off board draw different things: the compact
   * reading hides times, ids and cardinality, so explaining them there would
   * describe a picture the reader cannot see.
   */
  viewMode?: CanvasViewMode;
}

/** Viewport furniture, not part of a captured or exported business model. */
export const BusinessLegend = ({
  compact = false,
  viewMode = 'simplified',
}: BusinessLegendProps) => {
  const [expanded, setExpanded] = useState(readExpanded);
  const id = useId();
  const standard = viewMode === 'standard';

  return (
    <aside
      data-canvas-control=""
      data-evidence-capture-hide=""
      aria-label="业务图例"
      className={[
        'absolute right-4 z-30 max-w-[calc(100%-48px)] overflow-auto rounded-lg border border-evidence-line bg-white/95 text-[11px] shadow-sm',
        compact ? 'top-[76px] max-h-[35%]' : 'bottom-16 max-h-[45%]',
      ].join(' ')}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-4 px-3 py-2 text-evidence-muted hover:text-evidence-ink"
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          try {
            localStorage.setItem(STORAGE_KEY, String(next));
          } catch {
            /* Storage is optional. */
          }
        }}
      >
        图例说明 <span aria-hidden="true">{expanded ? '−' : '?'}</span>
      </button>
      <div
        id={id}
        hidden={!expanded}
        className="w-56 space-y-2 border-t border-evidence-line p-3"
      >
        {Object.entries(CATEGORY_TOKENS).map(([category, token]) => (
          <div key={category} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-3 w-5 shrink-0 border"
              style={{
                borderColor: token.stroke,
                backgroundColor: token.fill,
                borderRadius: token.radius,
                borderStyle: category === 'context' ? 'dashed' : 'solid',
              }}
            />
            <span>
              {token.label}
              {category === 'context' ? '（容器）' : ''}
            </span>
          </div>
        ))}
        <div className="space-y-1 border-t border-evidence-line pt-2 text-[10px] text-evidence-muted">
          <p>◉：签署该凭证的当事人（合同不标角标）</p>
          <p>⚑：模型声明的凭证责任角色</p>
          <p>时间条：请求期间；时刻章：签署 / 确认</p>
          <div className="flex items-center gap-2">
            <svg aria-hidden="true" width="32" height="12">
              <path
                d="M0 6 H32"
                stroke={EDGE_STYLES.stroke}
                strokeDasharray={EDGE_STYLES.dashed}
              />
            </svg>
            <span>虚线：跨业务边界或角色扮演</span>
          </div>
          <p>箭头：角色扮演（plays_role）</p>
          <div className="space-y-1 border-t border-evidence-line pt-2">
            <p>跨边界的三种原因：</p>
            {Object.entries(CROSS_CONTEXT_EDGE_STYLES).map(([kind, style]) => (
              <div key={kind} className="flex items-start gap-2">
                <svg aria-hidden="true" width="28" height="12" className="shrink-0">
                  <path
                    d="M0 6 H28"
                    stroke={style.stroke}
                    strokeWidth={style.width}
                    strokeDasharray={style.dasharray}
                  />
                  {kind === 'role_inversion' ? (
                    <circle
                      cx="14"
                      cy="6"
                      r="3"
                      fill="#fff"
                      stroke={style.stroke}
                      strokeWidth="1.4"
                    />
                  ) : null}
                </svg>
                <span>{style.label}</span>
              </div>
            ))}
          </div>
          <p>履约虚线框 / 配对线：同一履约，不代表引用</p>
          {standard ? (
            <>
              <p>1..N：源端 / 目标端关系基数</p>
              <p>属性行、实体 ID 与规则标记出现在标准模式</p>
            </>
          ) : (
            <p>简化模式隐藏属性与基数，扮演关系线仅在悬停时显示</p>
          )}
        </div>
      </div>
    </aside>
  );
};
