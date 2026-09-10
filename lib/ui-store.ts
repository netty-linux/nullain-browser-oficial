import { create } from "zustand";

export type SidebarTab = "chats" | "code" | "search" | "skills" | "plugins" | "coworkers";

interface UIState {
  computer: boolean;
  setComputer: (value: boolean | ((prev: boolean) => boolean)) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  activeSidebarTab: SidebarTab;
  setActiveSidebarTab: (tab: SidebarTab) => void;
  mobileComputerOpen: boolean;
  setMobileComputerOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
}

const COMPUTER_KEY = "nullain-computer";

export const useUIStore = create<UIState>((set, get) => ({
  // Sempre `false` na primeira renderização (SSR e hidratação geram o mesmo
  // HTML). O valor salvo é aplicado em `hydrateComputerState()`, dentro de um
  // useEffect pós-mount — ler localStorage aqui quebraria a hidratação quando
  // o Computador estava ligado (aria-pressed/label divergentes).
  computer: false,
  setComputer: (value) => {
    const next = typeof value === "function" ? value(get().computer) : value;
    try {
      if (next) localStorage.setItem(COMPUTER_KEY, "1");
      else localStorage.removeItem(COMPUTER_KEY);
    } catch {
      // sem persistência
    }
    set({ computer: next });
  },
  sidebarCollapsed: false,
  setSidebarCollapsed: (sidebarCollapsed) => {
    try {
      localStorage.setItem("nullain-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch {}
    set({ sidebarCollapsed });
  },
  activeSidebarTab: "chats",
  setActiveSidebarTab: (activeSidebarTab) => set({ activeSidebarTab }),
  mobileComputerOpen: false,
  setMobileComputerOpen: (value) => {
    const next = typeof value === "function" ? value(get().mobileComputerOpen) : value;
    set({ mobileComputerOpen: next });
  },
}));

/**
 * Aplica o valor persistido do toggle Computador APÓS a hidratação.
 * Chamar uma vez em um useEffect pós-mount (ex.: AssistantShell) — nunca
 * durante a renderização.
 */
export function hydrateComputerState(): void {
  if (typeof window === "undefined") return;
  try {
    const saved = localStorage.getItem(COMPUTER_KEY) === "1";
    if (saved !== useUIStore.getState().computer) useUIStore.setState({ computer: saved });
  } catch {
    // sem persistência
  }
}
