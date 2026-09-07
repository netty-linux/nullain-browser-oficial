"use client";

import * as React from "react";
import { PreviewCard } from "@base-ui/react/preview-card";

import { cn } from "@/lib/utils";

const HoverCardDelayContext = React.createContext({ openDelay: 150, closeDelay: 0 });

function HoverCard({
  openDelay = 150,
  closeDelay = 0,
  ...props
}: React.ComponentProps<typeof PreviewCard.Root> & {
  openDelay?: number;
  closeDelay?: number;
}) {
  return (
    <HoverCardDelayContext.Provider value={{ openDelay, closeDelay }}>
      <PreviewCard.Root data-slot="hover-card" {...props} />
    </HoverCardDelayContext.Provider>
  );
}

function HoverCardTrigger({
  openDelay,
  closeDelay,
  ...props
}: React.ComponentProps<typeof PreviewCard.Trigger> & {
  openDelay?: number;
  closeDelay?: number;
}) {
  const defaults = React.useContext(HoverCardDelayContext);
  return (
    <PreviewCard.Trigger
      data-slot="hover-card-trigger"
      delay={openDelay ?? defaults.openDelay}
      closeDelay={closeDelay ?? defaults.closeDelay}
      {...props}
    />
  );
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PreviewCard.Popup> & {
  align?: "start" | "center" | "end";
  sideOffset?: number;
}) {
  return (
    <PreviewCard.Portal>
      <PreviewCard.Positioner align={align} sideOffset={sideOffset} className="isolate z-50">
        <PreviewCard.Popup
          data-slot="hover-card-content"
          className={cn(
            "bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-open:zoom-in-95 data-closed:zoom-out-95 z-50 w-64 origin-(--transform-origin) rounded-xl border p-4 shadow-md outline-hidden",
            className,
          )}
          {...props}
        />
      </PreviewCard.Positioner>
    </PreviewCard.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
