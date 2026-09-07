"use client";

import { useEffect, useState, type FC } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

const STORAGE_KEY = "nullain-theme";

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const ThemeToggle: FC = () => {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <TooltipIconButton
      tooltip={theme === "dark" ? "Light mode" : "Dark mode"}
      side="bottom"
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 rounded-full"
      aria-label="Toggle theme"
      onClick={toggle}
      suppressHydrationWarning
    >
      {mounted ? (
        theme === "dark" ? (
          <SunIcon className="size-4" />
        ) : (
          <MoonIcon className="size-4" />
        )
      ) : (
        <MoonIcon className="size-4" />
      )}
    </TooltipIconButton>
  );
};
