import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getNullainDatabase } from "./nullain-db";
import { getNullainWorkspaceRoot } from "./nullain-config";

export type NullainProject = {
  id: string;
  ownerUserId: string;
  name: string;
  directoryName: string;
  provisioningState: "pending" | "ready" | "failed";
  createdAt: number;
  updatedAt: number;
};

export type NullainConversation = {
  id: string;
  ownerUserId: string;
  projectId: string;
  mastraThreadId: string;
  provisioningState: "pending" | "ready" | "failed";
  createdAt: number;
  updatedAt: number;
};

export function normalizeProjectName(value: unknown) {
  if (typeof value !== "string") throw new Error("Nome de projeto inválido.");
  const name = value.trim().replace(/\s+/g, " ");
  if (
    name.length < 1 ||
    name.length > 80 ||
    [...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new Error("O nome do projeto deve ter entre 1 e 80 caracteres.");
  }
  return name;
}

export async function provisionProjectDirectory(workspaceRoot: string, directoryName: string) {
  await fs.mkdir(workspaceRoot, { recursive: true });
  const rootStats = await fs.lstat(workspaceRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error("O diretório raiz do workspace não é um diretório real.");
  }

  const projectPath = path.join(workspaceRoot, directoryName);
  try {
    await fs.mkdir(projectPath, { recursive: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const projectStats = await fs.lstat(projectPath);
  if (!projectStats.isDirectory() || projectStats.isSymbolicLink()) {
    throw new Error("O workspace do projeto não é um diretório real.");
  }
}

export async function createProject(ownerUserId: string, rawName: unknown) {
  const database = getNullainDatabase();
  const name = normalizeProjectName(rawName);
  const project: NullainProject = {
    id: randomUUID(),
    ownerUserId,
    name,
    directoryName: randomUUID(),
    provisioningState: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  database
    .prepare(
      `INSERT INTO nullain_code_project
       (id, ownerUserId, name, directoryName, provisioningState, createdAt, updatedAt)
       VALUES (@id, @ownerUserId, @name, @directoryName, @provisioningState, @createdAt, @updatedAt)`,
    )
    .run(project);
  try {
    await provisionProjectDirectory(getNullainWorkspaceRoot(), project.directoryName);
    project.provisioningState = "ready";
  } catch {
    project.provisioningState = "failed";
  }
  project.updatedAt = Date.now();
  database
    .prepare("UPDATE nullain_code_project SET provisioningState = ?, updatedAt = ? WHERE id = ?")
    .run(project.provisioningState, project.updatedAt, project.id);
  if (project.provisioningState === "failed")
    throw new Error("Não foi possível provisionar o projeto.");
  return project;
}

export function listProjects(ownerUserId: string) {
  return getNullainDatabase()
    .prepare(
      `SELECT id, ownerUserId, name, directoryName, provisioningState, createdAt, updatedAt
       FROM nullain_code_project WHERE ownerUserId = ? ORDER BY updatedAt DESC`,
    )
    .all(ownerUserId) as NullainProject[];
}

export function requireProject(ownerUserId: string, projectId: string) {
  const project = getNullainDatabase()
    .prepare(
      `SELECT id, ownerUserId, name, directoryName, provisioningState, createdAt, updatedAt
       FROM nullain_code_project WHERE id = ? AND ownerUserId = ?`,
    )
    .get(projectId, ownerUserId) as NullainProject | undefined;
  if (!project || project.provisioningState !== "ready")
    throw new Response("Projeto não encontrado.", { status: 404 });
  return project;
}

export function getProjectPath(project: NullainProject) {
  return path.join(getNullainWorkspaceRoot(), project.directoryName);
}

export function createConversation(ownerUserId: string, projectId: string) {
  requireProject(ownerUserId, projectId);
  const conversation: NullainConversation = {
    id: randomUUID(),
    ownerUserId,
    projectId,
    mastraThreadId: randomUUID(),
    provisioningState: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const database = getNullainDatabase();
  database
    .prepare(
      `INSERT INTO nullain_code_conversation
       (id, ownerUserId, projectId, mastraThreadId, provisioningState, createdAt, updatedAt)
       VALUES (@id, @ownerUserId, @projectId, @mastraThreadId, @provisioningState, @createdAt, @updatedAt)`,
    )
    .run(conversation);
  return conversation;
}

export function markConversationReady(id: string, ready: boolean) {
  getNullainDatabase()
    .prepare(
      "UPDATE nullain_code_conversation SET provisioningState = ?, updatedAt = ? WHERE id = ?",
    )
    .run(ready ? "ready" : "failed", Date.now(), id);
}

export function requireConversation(ownerUserId: string, conversationId: string) {
  const conversation = getNullainDatabase()
    .prepare(
      `SELECT id, ownerUserId, projectId, mastraThreadId, provisioningState, createdAt, updatedAt
       FROM nullain_code_conversation WHERE id = ? AND ownerUserId = ?`,
    )
    .get(conversationId, ownerUserId) as NullainConversation | undefined;
  if (!conversation) throw new Response("Conversa não encontrada.", { status: 404 });
  return conversation;
}

export function listConversations(ownerUserId: string, projectId: string) {
  requireProject(ownerUserId, projectId);
  return getNullainDatabase()
    .prepare(
      `SELECT id, ownerUserId, projectId, mastraThreadId, provisioningState, createdAt, updatedAt
       FROM nullain_code_conversation WHERE ownerUserId = ? AND projectId = ? ORDER BY updatedAt DESC`,
    )
    .all(ownerUserId, projectId) as NullainConversation[];
}

export function deleteConversation(ownerUserId: string, conversationId: string) {
  const conversation = requireConversation(ownerUserId, conversationId);
  const result = getNullainDatabase()
    .prepare("DELETE FROM nullain_code_conversation WHERE id = ? AND ownerUserId = ?")
    .run(conversation.id, ownerUserId);
  if (result.changes !== 1) throw new Response("Conversa não encontrada.", { status: 404 });
  return conversation;
}
