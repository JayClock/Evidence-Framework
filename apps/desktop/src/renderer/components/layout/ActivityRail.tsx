import { Bot, ListTree, Table2, Zap, type LucideIcon } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@evidence-poc/desktop-ui-kit';

import {
  RAIL_TAB_CHORDS,
  type ActivityRailTabId,
} from '../../state/useWorkspaceLayoutState';

/** What a rail button says when it is not just an icon. */
export interface RailBadge {
  /** Count printed inside the pill; omitted for a bare dot. */
  count?: number;
  tone?: 'default' | 'warning' | 'error';
}

export interface ActivityRailProps {
  pressed: Readonly<Record<ActivityRailTabId, boolean>>;
  onSelect: (tab: ActivityRailTabId) => void;
  badges?: Partial<Record<ActivityRailTabId, RailBadge>>;
}

const RAIL_ITEMS: readonly {
  id: ActivityRailTabId;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  {
    id: 'ledger',
    label: '总台账',
    hint: '打开总台账，阅读与编辑模型字段',
    icon: Table2,
  },
  {
    id: 'diagnostics',
    label: '门禁与诊断',
    hint: 'AST 检查、悬空引用与派生对称性',
    icon: Zap,
  },
  {
    id: 'copilot',
    label: 'AI 协同',
    hint: '多轮访谈、工具调用与补丁复核',
    icon: Bot,
  },
  {
    id: 'directory',
    label: '实体目录',
    hint: '浏览并定位模型实体',
    icon: ListTree,
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
 * The rail switches between canvas and ledger and opens the studio tools.
 */
export const ActivityRail = ({
  pressed,
  onSelect,
  badges = {},
}: ActivityRailProps) => (
  <nav
    aria-label="活动导轨"
    data-region="activity-rail"
    data-workbench-chrome=""
    className="flex h-full w-12 shrink-0 flex-col items-center gap-1.5 border-r border-workbench-border bg-white py-2"
  >
    <TooltipProvider>
      {RAIL_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pressed[item.id];
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
                className="relative flex size-8 shrink-0 items-center justify-center rounded-md text-workbench-muted transition-colors hover:bg-workbench-subtle hover:text-evidence-ink focus-visible:ring-2 focus-visible:ring-evidence-accent focus-visible:outline-none aria-pressed:bg-evidence-accent aria-pressed:text-white aria-pressed:hover:bg-evidence-accent-hover"
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
              {item.id === 'ledger' && active ? '返回画布' : item.hint}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </TooltipProvider>
  </nav>
);
