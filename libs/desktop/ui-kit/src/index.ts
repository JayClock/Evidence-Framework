export {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from './Resizable.js';
export type { ResizableHandleProps } from './Resizable.js';
export { cn } from './utils.js';
export { ViewModeSegmentedControl } from './ViewModeSegmentedControl.js';
export {
  WORKSPACE_VIEW_MODES,
  type WorkspaceViewMode,
} from './workspaceViewMode.js';

// Design-system primitives. Every desktop surface composes these instead of
// growing its own button, popover or toast, so density and focus rings stay one
// decision rather than one per screen.
export { Button, controlVariants } from './components/button/Button.js';
export type { ButtonProps } from './components/button/Button.js';
export { Badge, badgeVariants } from './components/badge/Badge.js';
export type { BadgeProps } from './components/badge/Badge.js';
export { Kbd, KbdChord } from './components/badge/Kbd.js';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './components/dialog/Dialog.js';
export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
} from './components/sheet/Sheet.js';
export type { SheetContentProps } from './components/sheet/Sheet.js';
export {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from './components/popover/Popover.js';
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './components/tooltip/Tooltip.js';
export type { TooltipContentProps } from './components/tooltip/Tooltip.js';
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandSeparator,
  CommandShortcut,
} from './components/command/Command.js';
export type { CommandDialogProps } from './components/command/Command.js';
export { Toaster, notify, toast } from './components/sonner/Toaster.js';
export { CodeEditor, type CodeEditorProps, type CodeLanguage } from './components/code/CodeEditor.js';
export { celLanguage, celStreamParser } from './components/code/celLanguage.js';
