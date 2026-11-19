import {
  Activity,
  Bot,
  ListChecks,
  Network,
  Redo2,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Undo2,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import type { GraphViewMode } from '@evidence-poc/desktop-ui-kit';

import { RAIL_TAB_CHORDS, type RailTabId } from './useWorkspaceLayoutState';
import type { WorkspaceViewMode } from './useWorkspaceViewMode';

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
  | 'delivery'
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
  { id: 'delivery', label: '交付契约' },
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
  palette: '⌘+K',
  journey: '⌥+1',
  graph: '⌥+2',
  zoomSelection: '⇧+2',
  delivery: '⌥+D',
  rerunSensors: '⌘+Shift+R',
  problems: '⌥+X',
} as const;

export interface CommandCapabilities {
  canUndo: boolean;
  canRedo: boolean;
  viewMode: WorkspaceViewMode;
  /** Whether anything is selected, so "zoom to selection" can be honest. */
  hasSelection: boolean;
}

export interface CommandHandlers {
  save: () => void;
  undo: () => void;
  redo: () => void;
  setViewMode: (mode: GraphViewMode) => void;
  /** Frames the selected object. */
  zoomToSelection: () => void;
  openDelivery: () => void;
  rerunSensors: () => void;
  askAgent: () => void;
  openRail: (tab: RailTabId) => void;
  openProblems: () => void;
  toggleProblems: () => void;
}

/**
 * Builds the palette contents.
 *
 * Disabled rows stay visible so unavailable history and view actions explain
 * the current editor state instead of appearing to be missing features.
 */
export const buildCommands = (
  capabilities: CommandCapabilities,
  handlers: CommandHandlers,
): readonly CommandItem[] => {
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
      id: 'view.journey',
      title: '业务旅程',
      subtitle: '按业务阶段、权责泳道与违约走廊阅读模型',
      category: 'view',
      shortcut: CHORDS.journey,
      icon: Workflow,
      keywords: ['journey', 'swimlane', '旅程', '泳道'],
      disabled: capabilities.viewMode === 'journey',
      perform: () => handlers.setViewMode('journey'),
    },
    {
      id: 'view.graph',
      title: '拓扑图',
      subtitle: 'ELK 因果拓扑与技术分析',
      category: 'view',
      shortcut: CHORDS.graph,
      icon: Workflow,
      keywords: ['graph', 'canvas', '拓扑'],
      disabled: capabilities.viewMode === 'topology',
      perform: () => handlers.setViewMode('topology'),
    },
    {
      id: 'view.zoom-selection',
      title: '缩放到当前对象',
      subtitle: '把选中的实体铺满画布',
      category: 'view',
      shortcut: CHORDS.zoomSelection,
      icon: Search,
      keywords: ['zoom', 'selection', 'focus', '放大'],
      disabled: !capabilities.hasSelection,
      perform: handlers.zoomToSelection,
    },
    {
      id: 'view.rail-diagnostics',
      title: '打开门禁与诊断面板',
      subtitle: 'AST 检查、悬空引用与派生对称性',
      category: 'view',
      shortcut: RAIL_TAB_CHORDS.diagnostics,
      icon: ShieldCheck,
      keywords: ['rail', 'diagnostics', 'lint', '门禁'],
      perform: handlers.openProblems,
    },
    {
      id: 'view.rail-copilot',
      title: '打开 AI 协同抽屉',
      subtitle: '多轮访谈、工具调用与补丁复核',
      category: 'view',
      shortcut: RAIL_TAB_CHORDS.copilot,
      icon: Bot,
      keywords: ['rail', 'agent', 'copilot', '协同'],
      perform: () => handlers.openRail('copilot'),
    },
    {
      id: 'model.workshop',
      title: '打开共创工作坊',
      subtitle: '七步业务提问与履约建模',
      category: 'model',
      icon: ListChecks,
      keywords: ['workshop', 'new', '新建', '向导'],
      perform: () => handlers.openRail('workshop'),
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
      id: 'diagnostics.problems',
      title: '展开或收合门禁问题面板',
      subtitle: '按等级过滤、定位到问题对象',
      category: 'diagnostics',
      shortcut: CHORDS.problems,
      icon: ShieldCheck,
      keywords: ['problems', 'issues', 'problems panel', '问题'],
      perform: handlers.toggleProblems,
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
