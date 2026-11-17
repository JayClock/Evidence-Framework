import type { WorkspaceViewMode } from './workspaceViewMode';

const MODES: readonly {
  id: WorkspaceViewMode;
  label: string;
  hint: string;
  shortcut: string;
}[] = [
  {
    id: 'journey',
    label: '业务旅程',
    hint: '按业务阶段与权责泳道阅读模型（V / ⌥1）',
    shortcut: '⌥1',
  },
  {
    id: 'topology',
    label: '拓扑图',
    hint: 'ELK 因果拓扑与技术分析（⌥2）',
    shortcut: '⌥2',
  },
  {
    id: 'table',
    label: '总台账',
    hint: '逐字段阅读与编辑整个模型（⌥3）',
    shortcut: '⌥3',
  },
  {
    id: 'split',
    label: '分屏',
    hint: '左边看旅程、右边读台账或规则（⌥4）',
    shortcut: '⌥4',
  },
];

/**
 * Names the surface the centre stage shows.
 *
 * It is a segmented control rather than a menu because these four
 * states are used constantly; the shortcut is printed
 * on the control itself so the keyboard is discoverable without a help screen.
 */
export const ViewModeSegmentedControl = ({
  mode,
  onChange,
}: {
  mode: WorkspaceViewMode;
  onChange: (mode: WorkspaceViewMode) => void;
}) => (
  <div
    role="group"
    aria-label="工作台视图"
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
