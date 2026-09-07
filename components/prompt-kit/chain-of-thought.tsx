"use client";

import React from "react";
import { ChevronDownIcon, CircleIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type ChainOfThoughtItemProps = React.ComponentProps<"div">;

export const ChainOfThoughtItem = ({ children, className, ...props }: ChainOfThoughtItemProps) => (
  <div className={cn("text-sm text-muted-foreground", className)} {...props}>
    {children}
  </div>
);

export type ChainOfThoughtTriggerProps = React.ComponentProps<typeof CollapsibleTrigger> & {
  leftIcon?: React.ReactNode;
  swapIconOnHover?: boolean;
};

export const ChainOfThoughtTrigger = ({
  children,
  className,
  leftIcon,
  swapIconOnHover = true,
  ...props
}: ChainOfThoughtTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      "group/trigger flex cursor-pointer items-center justify-start gap-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground",
      className,
    )}
    {...props}
  >
    <div className="flex items-center gap-2">
      {leftIcon ? (
        <span className="relative inline-flex size-4 items-center justify-center">
          <span
            className={cn("transition-opacity", swapIconOnHover && "group-hover/trigger:opacity-0")}
          >
            {leftIcon}
          </span>
          {swapIconOnHover && (
            <ChevronDownIcon className="absolute size-4 opacity-0 transition-[opacity,transform] group-hover/trigger:opacity-100 group-data-open/trigger:rotate-180" />
          )}
        </span>
      ) : (
        <span className="relative inline-flex size-4 items-center justify-center">
          <CircleIcon className="size-2 fill-current" />
        </span>
      )}
      <span>{children}</span>
    </div>
    {!leftIcon && (
      <ChevronDownIcon className="size-4 transition-transform group-data-open/trigger:rotate-180" />
    )}
  </CollapsibleTrigger>
);

export type ChainOfThoughtContentProps = React.ComponentProps<typeof CollapsibleContent>;

export const ChainOfThoughtContent = ({
  children,
  className,
  ...props
}: ChainOfThoughtContentProps) => (
  <CollapsibleContent
    className={cn(
      "overflow-hidden text-popover-foreground data-closed:animate-collapsible-up data-open:animate-collapsible-down",
      className,
    )}
    {...props}
  >
    <div className="grid grid-cols-[min-content_minmax(0,1fr)] gap-x-4">
      <div className="ml-1.75 h-full w-px bg-primary/20" />
      <div className="mt-2 min-w-0 space-y-2 pb-2">{children}</div>
    </div>
  </CollapsibleContent>
);

export type ChainOfThoughtProps = {
  children: React.ReactNode;
  className?: string;
};

export function ChainOfThought({ children, className }: ChainOfThoughtProps) {
  const childrenArray = React.Children.toArray(children);
  return (
    <div className={cn("space-y-0", className)}>
      {childrenArray.map((child, index) => (
        <React.Fragment key={index}>
          {React.isValidElement(child) &&
            React.cloneElement(child as React.ReactElement<ChainOfThoughtStepProps>, {
              isLast: index === childrenArray.length - 1,
            })}
        </React.Fragment>
      ))}
    </div>
  );
}

export type ChainOfThoughtStepProps = {
  children: React.ReactNode;
  className?: string;
  isLast?: boolean;
};

export const ChainOfThoughtStep = ({
  children,
  className,
  isLast = false,
  ...props
}: ChainOfThoughtStepProps & React.ComponentProps<typeof Collapsible>) => (
  <Collapsible className={cn("group", className)} data-last={isLast} {...props}>
    {children}
    <div className="flex justify-start group-data-[last=true]:hidden">
      <div className="ml-1.75 h-4 w-px bg-primary/20" />
    </div>
  </Collapsible>
);
