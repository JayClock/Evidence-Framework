import {
  Activity,
  Bot,
  FlaskConical,
  FolderTree,
  type LucideIcon,
} from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@evidence-poc/desktop-ui-kit';

import {
  RAIL_TAB_CHORDS,
  type RailTabId,
} from '../../state/useWorkspaceLayoutState';

/** What a rail button says when it is not just an icon. */
export interface RailBadge {
  /** Count printed inside the pill; omitted for a bare dot. */
  count?: number;
  tone?: 'default' | 'warning' | 'error';
}

export interface ActivityRailProps {
  activeTab: RailTabId | null;
  onSelect: (tab: RailTabId) => void;
  badges?: Partial<Record<RailTabId, RailBadge>>;
}

const RAIL_ITEMS: readonly {
  id: RailTabId;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  {
    id: 'topology',
    label: '业务结构',
    hint: '上下文层级与业务对象导航',
    icon: FolderTree,
  },
  {
    id: 'diagnostics',
    label: '门禁与诊断',
    hint: 'AST 检查、悬空引用与派生对称性',
    icon: Activity,
  },
  {
    id: 'simulation',
    label: '场景仿真',
    hint: '逐步回放业务场景并比对 trace',
    icon: FlaskConical,
  },
  {
    id: 'copilot',
    label: 'AI 协同',
    hint: '多轮访谈、工具调用与补丁复核',
    icon: Bot,
  },
];

const badgeToneClass = (tone: RailBadge['tone']): string =>
  tone === 'error'
    ? 'bg-[#b42318] text-white'
    : tone === 'warning'
      ? 'bg-[#8d6200] text-white'
      : 'bg-evidence-line text-evidence-ink';

/**
 * The studio's top-level switch, in 48 pixels.
 *
 * Every surface that used to own a permanent column — outline, diagnostics,
 * sandbox, copilot — is a button here instead. The rail never moves and never
 * resizes, so the canvas can claim the whole remaining width while the modeler
 * still reaches every tool with one click or one chord.
 */
export const ActivityRail = ({
  activeTab,
  onSelect,
  badges = {},
}: ActivityRailProps) => (
  <nav
    aria-label="活动导轨"
    data-region="activity-rail"
    className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-evidence-line bg-[#f6f8fa] py-2"
  >
    <TooltipProvider>
      {RAIL_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeTab;
        const badge = badges[item.id];

        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={item.label}
                aria-pressed={active}
                data-rail-tab={item.id}
                onClick={() => onSelect(item.id)}
                className={cn(
                  'relative flex size-9 items-center justify-center rounded-md transition-colors',
                  active
                    ? 'bg-white text-evidence-accent shadow-xs ring-1 ring-evidence-line'
                    : 'text-evidence-muted hover:bg-white hover:text-evidence-ink',
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {badge === undefined ? null : badge.count === undefined ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-evidence-evidence"
                  />
                ) : (
                  <span
                    className={cn(
                      'absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-[9px] leading-4 font-medium tabular-nums',
                      badgeToneClass(badge.tone),
                    )}
                  >
                    {badge.count}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" shortcut={RAIL_TAB_CHORDS[item.id]}>
              {item.hint}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </TooltipProvider>
  </nav>
);
