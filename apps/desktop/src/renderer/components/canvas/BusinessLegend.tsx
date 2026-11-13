import { useId, useState } from 'react';
import { CATEGORY_TOKENS, EDGE_STYLES } from './colors';

const STORAGE_KEY = 'evidence.canvas.legend.expanded';
const readExpanded = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

/** Viewport furniture, not part of a captured or exported business model. */
export const BusinessLegend = ({ compact = false }: { compact?: boolean }) => {
  const [expanded, setExpanded] = useState(readExpanded);
  const id = useId();
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
          <p>履约虚线框 / 配对线：同一履约，不代表引用</p>
          <p>1..N：源端 / 目标端关系基数</p>
          <p>标准模式显示属性、时间与规则摘要</p>
        </div>
      </div>
    </aside>
  );
};
