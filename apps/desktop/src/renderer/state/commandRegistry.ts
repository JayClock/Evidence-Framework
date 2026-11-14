import {
  Activity,
  Bot,
  Columns2,
  FileDown,
  FlaskConical,
  FolderTree,
  GitCompareArrows,
  Network,
  Redo2,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Undo2,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import type { WorkspaceViewMode } from '@evidence-poc/desktop-ui-kit';

import type { RailTabId } from './useWorkspaceLayoutState';

/**
 * One keyboard-first action.
 *
 * The palette is an index over behaviour that already exists, not a second
 * implementation of it: `perform` closes over the same session, sensors and
 * export controllers the header buttons use, so a command can never drift from
 * the control it replaced.
 */
export type CommandCategory =
  | 'model'
  | 'view'
  | 'navigation'
  | 'delivery'
  | 'simulation'
  | 'diagnostics'
  | 'agent';

export interface CommandItem {
  /** Stable identity; also the `value` cmdk filters on. */
  id: string;
  title: string;
  /** The second line a row shows when the title alone is ambiguous. */
  subtitle?: string;
  category: CommandCategory;
  /** Printed as key caps on the row, so the palette teaches the chord. */
  shortcut?: string;
  icon?: LucideIcon;
  /** Extra search terms: English names, synonyms, the old button labels. */
  keywords?: readonly string[];
  disabled?: boolean;
  perform: () => void | Promise<void>;
}

/** Group captions in the order a modelling session needs them. */
export const COMMAND_GROUPS: readonly {
  id: CommandCategory;
  label: string;
}[] = [
  { id: 'model', label: '核心操作' },
  { id: 'view', label: '视图' },
  { id: 'navigation', label: '导航' },
  { id: 'delivery', label: '交付与评审' },
  { id: 'simulation', label: '验证与仿真' },
  { id: 'diagnostics', label: '门禁与诊断' },
  { id: 'agent', label: '智能协同' },
];

/**
 * The chords this app actually binds.
 *
 * `Mod` is printed as `⌘` on every platform, matching the view-mode control that
 * already prints `⌘2`: the desktop shell ships for macOS first, and a chord the
 * UI describes wrongly is worse than one written for a single platform.
 */
export const CHORDS = {
  save: '⌘+S',
  undo: '⌘+Z',
  redo: '⌘+Shift+Z',
  search: '⌘+F',
  palette: '⌘+K',
  // The rail owns the bare digits; the three view modes sit one modifier out.
  railTopology: '⌘+1',
  railDiagnostics: '⌘+2',
  railSimulation: '⌘+3',
  railCopilot: '⌘+4',
  graph: '⌥+1',
  table: '⌥+2',
  split: '⌥+3',
  review: '⌥+R',
  exportReview: '⌘+Shift+E',
  delivery: '⌥+D',
  sandbox: '⌥+S',
  rerunSensors: '⌘+Shift+R',
} as const;

export interface CommandCapabilities {
  canUndo: boolean;
  canRedo: boolean;
  /** An unsaved edit makes the export commands read the wrong snapshot. */
  dirty: boolean;
  /** A review export is already being written. */
  busy: boolean;
  viewMode: WorkspaceViewMode;
}

export interface CommandHandlers {
  save: () => void;
  undo: () => void;
  redo: () => void;
  setViewMode: (mode: WorkspaceViewMode) => void;
  focusSearch: () => void;
  openReview: () => void;
  exportReview: () => void;
  exportDiff: () => void;
  openDelivery: () => void;
  openSandbox: () => void;
  rerunSensors: () => void;
  askAgent: () => void;
  openRail: (tab: RailTabId) => void;
}

/**
 * Builds the palette contents.
 *
 * Disabled rows stay in the list instead of disappearing: a modeler who looks
 * for "导出审查页" and finds it greyed out with a reason learns why it cannot
 * run, while a missing row only says the feature is gone.
 */
export const buildCommands = (
  capabilities: CommandCapabilities,
  handlers: CommandHandlers,
): readonly CommandItem[] => {
  const exportStale = capabilities.dirty || capabilities.busy;
  const exportReason = capabilities.busy
    ? '正在导出，请等待当前导出完成'
    : capabilities.dirty
      ? '先保存：正式审查只读取磁盘快照'
      : undefined;

  return [
    {
      id: 'model.save',
      title: '保存模型',
      subtitle: '写回 .evidence/fm 源树',
      category: 'model',
      shortcut: CHORDS.save,
      icon: Save,
      keywords: ['save', 'write', 'disk'],
      perform: handlers.save,
    },
    {
      id: 'model.undo',
      title: '撤销',
      category: 'model',
      shortcut: CHORDS.undo,
      icon: Undo2,
      keywords: ['undo'],
      disabled: !capabilities.canUndo,
      perform: handlers.undo,
    },
    {
      id: 'model.redo',
      title: '重做',
      category: 'model',
      shortcut: CHORDS.redo,
      icon: Redo2,
      keywords: ['redo'],
      disabled: !capabilities.canRedo,
      perform: handlers.redo,
    },
    {
      id: 'view.graph',
      title: '拓扑图',
      subtitle: '按因果与泳道阅读模型',
      category: 'view',
      shortcut: CHORDS.graph,
      icon: Workflow,
      keywords: ['graph', 'canvas', '拓扑'],
      disabled: capabilities.viewMode === 'graph',
      perform: () => handlers.setViewMode('graph'),
    },
    {
      id: 'view.table',
      title: '总台账',
      subtitle: '逐字段阅读整个模型',
      category: 'view',
      shortcut: CHORDS.table,
      icon: Table2,
      keywords: ['table', 'ledger', '台账'],
      disabled: capabilities.viewMode === 'table',
      perform: () => handlers.setViewMode('table'),
    },
    {
      id: 'view.split',
      title: '分屏',
      subtitle: '左边看图、右边改字段',
      category: 'view',
      shortcut: CHORDS.split,
      icon: Columns2,
      keywords: ['split', '分屏'],
      disabled: capabilities.viewMode === 'split',
      perform: () => handlers.setViewMode('split'),
    },
    {
      id: 'view.rail-topology',
      title: '打开业务结构抽屉',
      subtitle: '上下文层级与业务对象导航',
      category: 'view',
      shortcut: CHORDS.railTopology,
      icon: FolderTree,
      keywords: ['rail', 'outline', 'topology', '大纲', '结构'],
      perform: () => handlers.openRail('topology'),
    },
    {
      id: 'view.rail-diagnostics',
      title: '打开门禁与诊断抽屉',
      subtitle: 'AST 检查、悬空引用与派生对称性',
      category: 'view',
      shortcut: CHORDS.railDiagnostics,
      icon: ShieldCheck,
      keywords: ['rail', 'diagnostics', 'lint', '门禁'],
      perform: () => handlers.openRail('diagnostics'),
    },
    {
      id: 'view.rail-copilot',
      title: '打开 AI 协同抽屉',
      subtitle: '多轮访谈、工具调用与补丁复核',
      category: 'view',
      shortcut: CHORDS.railCopilot,
      icon: Bot,
      keywords: ['rail', 'agent', 'copilot', '协同'],
      perform: () => handlers.openRail('copilot'),
    },
    {
      id: 'navigation.search',
      title: '搜索业务对象',
      subtitle: '打开业务结构抽屉，把光标移进搜索框',
      category: 'navigation',
      shortcut: CHORDS.search,
      icon: Search,
      keywords: ['search', 'find', 'entity'],
      perform: handlers.focusSearch,
    },
    {
      id: 'delivery.review',
      title: '打开审查预览',
      subtitle: '审查中心：逐条发现、画布定位与派单',
      category: 'delivery',
      shortcut: CHORDS.review,
      icon: ShieldCheck,
      keywords: ['review', 'preview', '审查'],
      perform: handlers.openReview,
    },
    {
      id: 'delivery.export-review',
      title: '导出离线审查工作台（HTML）',
      subtitle: exportReason ?? '单文件、内联资源、可签名发布',
      category: 'delivery',
      shortcut: CHORDS.exportReview,
      icon: FileDown,
      keywords: ['export', 'html', 'offline', '导出'],
      disabled: exportStale,
      perform: handlers.exportReview,
    },
    {
      id: 'delivery.export-diff',
      title: '导出变更审查差异',
      subtitle: exportReason ?? '与 *.evidence.json 基线比较',
      category: 'delivery',
      icon: GitCompareArrows,
      keywords: ['diff', 'baseline', '差异'],
      disabled: exportStale,
      perform: handlers.exportDiff,
    },
    {
      id: 'delivery.contract',
      title: '打开交付契约（OpenAPI）',
      subtitle: '服务边界、契约与部署草图',
      category: 'delivery',
      shortcut: CHORDS.delivery,
      icon: Network,
      keywords: ['delivery', 'openapi', '契约', '交付'],
      perform: handlers.openDelivery,
    },
    {
      id: 'simulation.sandbox',
      title: '运行场景实例仿真',
      subtitle: '逐步回放业务场景并比对 trace',
      category: 'simulation',
      shortcut: CHORDS.sandbox,
      icon: FlaskConical,
      keywords: ['sandbox', 'simulation', 'scenario', '沙盒'],
      perform: handlers.openSandbox,
    },
    {
      id: 'diagnostics.rerun',
      title: '重新执行静态门禁',
      subtitle: '重跑 AST 与传感器检查',
      category: 'diagnostics',
      shortcut: CHORDS.rerunSensors,
      icon: Activity,
      keywords: ['diagnostics', 'sensors', 'lint', '门禁'],
      perform: handlers.rerunSensors,
    },
    {
      id: 'agent.ask',
      title: '向 AI 建模副驾提问',
      subtitle: '把当前选区交给协同栏',
      category: 'agent',
      icon: Sparkles,
      keywords: ['agent', 'copilot', 'ask', 'ai'],
      perform: handlers.askAgent,
    },
  ];
};

/** Buckets commands by category in `COMMAND_GROUPS` order, skipping empties. */
export const groupCommands = (
  commands: readonly CommandItem[],
): readonly {
  group: (typeof COMMAND_GROUPS)[number];
  items: CommandItem[];
}[] =>
  COMMAND_GROUPS.map((group) => ({
    group,
    items: commands.filter((command) => command.category === group.id),
  })).filter((bucket) => bucket.items.length > 0);
