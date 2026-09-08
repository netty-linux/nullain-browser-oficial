"use client";

import { create } from "zustand";

export type CodeProject = { id: string; name: string; updatedAt: number };
export type CodeConversation = { id: string; projectId: string; updatedAt: number };

type CodeState = {
  projects: CodeProject[];
  conversations: CodeConversation[];
  projectId?: string;
  conversationId?: string;
  messages: unknown[];
  events: unknown[];
  connected: boolean;
  busy: boolean;
  error?: string;
  set: (values: Partial<Omit<CodeState, "set">>) => void;
};

export const useNullainCodeStore = create<CodeState>((set) => ({
  projects: [],
  conversations: [],
  messages: [],
  events: [],
  connected: false,
  busy: false,
  set,
}));
