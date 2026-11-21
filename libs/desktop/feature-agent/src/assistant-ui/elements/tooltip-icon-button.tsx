// Upstream registry source: https://r.assistant-ui.com/tooltip-icon-button.json
"use client";

import { type ComponentPropsWithRef, forwardRef } from "react";
import * as Slot from "@radix-ui/react-slot";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@evidence-poc/desktop-ui-kit";
import { Button } from "@evidence-poc/desktop-ui-kit";
import { cn } from "@evidence-poc/desktop-ui-kit";

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

export const TooltipIconButton = forwardRef<
  HTMLButtonElement,
  TooltipIconButtonProps
>(({ children, tooltip, side = "bottom", className, ...rest }, ref) => {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            {...rest}
            className={cn(
              "aui-button-icon size-6 p-1 active:scale-90",
              className,
            )}
            ref={ref}
          >
            <Slot.Slottable>{children}</Slot.Slottable>
            <span className="aui-sr-only sr-only">{tooltip}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

TooltipIconButton.displayName = "TooltipIconButton";
