import { useEffect, useMemo, useState } from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@evidence-poc/desktop-ui-kit';

import {
  groupCommands,
  type CommandItem as Command,
} from '../../state/commandRegistry';

/** One business object the palette may jump to. */
export interface CommandTarget {
  /** Node id the canvas, ledger and inspector all select by. */
  id: string;
  label: string;
  /** Category word printed after the label: 凭证 / 参与方 / 角色. */
  category: string;
  /** Enclosing contexts, root first; shown as the row's trail. */
  path?: readonly string[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: readonly Command[];
  targets: readonly CommandTarget[];
  onFocusTarget: (nodeId: string) => void;
}

/**
 * The keyboard entry point to everything the editor can do.
 *
 * Two kinds of row share one list because they answer the same question — "where
 * do I want to be?" — with the same three keys. Typing narrows both, `↑↓` moves,
 * `Enter` commits. Commands come first so an empty query is a menu of actions
 * rather than a wall of entity names; objects appear once the query has
 * something to match against.
 */
export const CommandPalette = ({
  open,
  onOpenChange,
  commands,
  targets,
  onFocusTarget,
}: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const buckets = useMemo(() => groupCommands(commands), [commands]);
  const searching = query.trim() !== '';

  // A dismissed palette must reopen as a menu, not as the previous query.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const run = (command: Command) => {
    if (command.disabled === true) return;
    // Close first: an export opens a native save dialog, and a modal that keeps
    // the focus trap while the OS takes over cannot be escaped afterwards.
    onOpenChange(false);
    void command.perform();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      label="快速命令"
      shouldFilter
    >
      <CommandInput
        autoFocus
        aria-label="搜索命令或业务对象"
        placeholder="输入命令，或搜索业务对象…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList aria-label="命令与业务对象">
        <CommandEmpty>没有匹配的命令或业务对象</CommandEmpty>

        {searching && targets.length > 0 ? (
          <CommandGroup heading="业务对象">
            {targets.map((target) => (
              <CommandItem
                key={target.id}
                value={`entity:${target.id}`}
                keywords={[
                  target.label,
                  target.category,
                  ...(target.path ?? []),
                ]}
                onSelect={() => {
                  onOpenChange(false);
                  onFocusTarget(target.id);
                }}
              >
                <span className="truncate">{target.label}</span>
                <span className="ml-auto shrink-0 text-[10px] text-evidence-muted">
                  {target.path === undefined || target.path.length === 0
                    ? target.category
                    : `${target.path.join(' / ')} · ${target.category}`}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {buckets.map(({ group, items }) => (
          <CommandGroup key={group.id} heading={group.label}>
            {items.map((command) => {
              const Icon = command.icon;

              return (
                <CommandItem
                  key={command.id}
                  value={command.id}
                  keywords={[
                    command.title,
                    command.subtitle ?? '',
                    ...(command.keywords ?? []),
                  ]}
                  disabled={command.disabled}
                  onSelect={() => run(command)}
                >
                  {Icon === undefined ? null : (
                    <Icon
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-evidence-muted"
                    />
                  )}
                  <span className="shrink-0">{command.title}</span>
                  {command.subtitle === undefined ? null : (
                    <span className="truncate text-[10px] text-evidence-muted">
                      {command.subtitle}
                    </span>
                  )}
                  {command.shortcut === undefined ? null : (
                    <CommandShortcut chord={command.shortcut} />
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>

      <footer
        data-slot="command-footer"
        className="flex h-7 shrink-0 items-center gap-3 border-t border-evidence-line px-3 text-[10px] text-evidence-muted"
      >
        <span>↑↓ 选择</span>
        <span>↵ 执行</span>
        <span>Esc 关闭</span>
      </footer>
    </CommandDialog>
  );
};
