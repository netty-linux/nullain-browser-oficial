"use client";

import { create } from "zustand";

export type CodeProject = {
  id: string;
  name: string;
  directoryPath: string;
  updatedAt: number;
};
export type CodeConversation = { id: string; projectId: string; updatedAt: number };
export type CodeWorkspaceFile = {
  path: string;
  type: "file" | "directory";
  size?: number;
};
export type CodeWorkspaceChange = {
  path: string;
  status: "added" | "modified" | "deleted";
  operations: string[];
  patch?: string;
  binary: boolean;
  truncated: boolean;
};
export type CodeTask = {
  id: string;
  content: string;
  activeForm: string;
  status: "pending" | "in_progress" | "completed";
};
export type CodeDisplayState = {
  isRunning: boolean;
  activeTools: Record<
    string,
    { name: string; status: "streaming_input" | "running" | "completed" | "error" }
  >;
  tasks: CodeTask[];
};
export type CodeWorkspaceSnapshot = {
  files: CodeWorkspaceFile[];
  filesTruncated: boolean;
  changes: CodeWorkspaceChange[];
  mode: string;
  running: boolean;
};

type CodeState = {
  projects: CodeProject[];
  conversations: CodeConversation[];
  projectId?: string;
  conversationId?: string;
  messages: unknown[];
  events: unknown[];
  connected: boolean;
  busy: boolean;
  displayState?: CodeDisplayState;
  workspace?: CodeWorkspaceSnapshot;
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
