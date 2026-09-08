import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nullain-owner-"));
const databasePath = path.join(directory, "owner.db");
vi.stubEnv("NULLAIN_AUTH_SECRET", "test-secret-with-at-least-thirty-two-characters");
vi.stubEnv("NULLAIN_APP_DB_PATH", databasePath);

import {
  createConversation,
  listConversations,
  provisionProjectDirectory,
  requireProject,
} from "./nullain-code-repository";
import { getNullainDatabase, migrateNullainDatabase } from "./nullain-db";

beforeAll(() => {
  const database = getNullainDatabase();
  migrateNullainDatabase(database);
  const insertUser = database.prepare(
    'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)',
  );
  insertUser.run("user-one", "One", "one@owner.test", Date.now(), Date.now());
  insertUser.run("user-two", "Two", "two@owner.test", Date.now(), Date.now());
  database
    .prepare(
      `INSERT INTO nullain_code_project
       (id, ownerUserId, name, directoryName, provisioningState, createdAt, updatedAt)
       VALUES ('project-one', 'user-one', 'Project', 'directory-one', 'ready', ?, ?)`,
    )
    .run(Date.now(), Date.now());
});

afterAll(() => {
  getNullainDatabase().close();
  delete (globalThis as typeof globalThis & { __nullainAppDatabase?: unknown })
    .__nullainAppDatabase;
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("Nullain project ownership", () => {
  it("creates a missing workspace root before provisioning a project", async () => {
    const workspaceRoot = path.join(directory, "missing", "workspace");
    await provisionProjectDirectory(workspaceRoot, "project-directory");
    expect(fs.statSync(path.join(workspaceRoot, "project-directory")).isDirectory()).toBe(true);
  });

  it("never resolves another user's project or conversations", () => {
    expect(requireProject("user-one", "project-one").id).toBe("project-one");
    expect(() => requireProject("user-two", "project-one")).toThrow();
    createConversation("user-one", "project-one");
    expect(listConversations("user-one", "project-one")).toHaveLength(1);
    expect(() => listConversations("user-two", "project-one")).toThrow();
  });
});
