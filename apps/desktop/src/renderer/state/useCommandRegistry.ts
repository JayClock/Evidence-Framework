import { useMemo } from 'react';

import {
  buildCommands,
  type CommandCapabilities,
  type CommandHandlers,
  type CommandItem,
} from './commandRegistry';

/**
 * The palette contents for the current editor state.
 *
 * Both arguments are objects, so the caller memoizes them: `handlers` closes
 * over a session that changes identity on every document revision, and
 * rebuilding fourteen rows per keystroke would make the palette sort differently
 * mid-typing. The rule is documented here because the failure is invisible.
 */
export const useCommandRegistry = (
  capabilities: CommandCapabilities,
  handlers: CommandHandlers,
): readonly CommandItem[] =>
  useMemo(
    () => buildCommands(capabilities, handlers),
    [capabilities, handlers],
  );
