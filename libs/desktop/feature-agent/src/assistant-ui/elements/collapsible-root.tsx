// Upstream registry source: https://r.assistant-ui.com/elements-collapsible-root.json
"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { forwardRef } from "react";

export const CollapsibleRoot = forwardRef<
  React.ComponentRef<typeof Collapsible.Root>,
  React.ComponentPropsWithoutRef<typeof Collapsible.Root>
>(function CollapsibleRoot(props, ref) {
  return <Collapsible.Root ref={ref} data-slot="collapsible" {...props} />;
});

export function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof Collapsible.CollapsibleTrigger>) {
  return (
    <Collapsible.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

export function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof Collapsible.CollapsibleContent>) {
  return (
    <Collapsible.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  );
}
