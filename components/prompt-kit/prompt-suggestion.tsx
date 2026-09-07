"use client";

import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PromptSuggestionProps = ComponentProps<typeof Button> & {
  children: ReactNode;
  highlight?: string;
};

export function PromptSuggestion({
  children,
  className,
  highlight,
  variant,
  size,
  ...props
}: PromptSuggestionProps) {
  const content = typeof children === "string" ? children : "";
  const term = highlight?.trim() ?? "";

  if (!term || !content) {
    return (
      <Button
        type="button"
        variant={variant ?? "outline"}
        size={size ?? "lg"}
        className={cn("rounded-full", className)}
        {...props}
      >
        {children}
      </Button>
    );
  }

  const index = content.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  const before = index >= 0 ? content.slice(0, index) : content;
  const match = index >= 0 ? content.slice(index, index + term.length) : "";
  const after = index >= 0 ? content.slice(index + term.length) : "";

  return (
    <Button
      type="button"
      variant={variant ?? "ghost"}
      size={size ?? "sm"}
      className={cn("w-full justify-start gap-0 rounded-xl py-2", className)}
      {...props}
    >
      <span className="whitespace-pre-wrap text-muted-foreground">{before}</span>
      {match && <span className="whitespace-pre-wrap font-medium text-primary">{match}</span>}
      {after && <span className="whitespace-pre-wrap text-muted-foreground">{after}</span>}
    </Button>
  );
}
