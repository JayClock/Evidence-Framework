export type GraphViewMode = 'journey' | 'topology';

const MODES: readonly {
  id: GraphViewMode;
  label: string;
  hint: string;
  shortcut: string;
}[] = [
  {
    id: 'journey',
    label: '业务旅程',
    hint: '按业务阶段与权责泳道阅读模型（⌥1）',
    shortcut: '⌥1',
  },
  {
    id: 'topology',
    label: '拓扑图',
    hint: 'ELK 因果拓扑与技术分析（⌥2）',
    shortcut: '⌥2',
  },
];

/** Switches the canvas layout without leaving the canvas. */
export const ViewModeSegmentedControl = ({
  mode,
  onChange,
}: {
  mode: GraphViewMode;
  onChange: (mode: GraphViewMode) => void;
}) => (
  <div
    role="group"
    aria-label="画布布局"
    className="flex items-center rounded-md border border-evidence-line bg-evidence-surface p-0.5 text-[11px]"
  >
    {MODES.map((item) => (
      <button
        key={item.id}
        type="button"
        title={item.hint}
        aria-pressed={mode === item.id}
        onClick={() => onChange(item.id)}
        className={[
          'flex items-center gap-1 rounded px-2 py-0.5 transition-colors',
          mode === item.id
            ? 'bg-white font-medium text-evidence-ink shadow-xs'
            : 'text-evidence-muted hover:text-evidence-ink',
        ].join(' ')}
      >
        <span>{item.label}</span>
        <kbd className="text-[9px] text-evidence-muted/80">{item.shortcut}</kbd>
      </button>
    ))}
  </div>
);
