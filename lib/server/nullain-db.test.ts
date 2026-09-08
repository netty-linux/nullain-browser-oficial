import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateNullainDatabase, openNullainDatabase } from "./nullain-db";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("Nullain app database migrations", () => {
  it("applies versioned migrations idempotently to a real SQLite database", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nullain-db-"));
    directories.push(directory);
    const database = openNullainDatabase(path.join(directory, "app.db"));
    migrateNullainDatabase(database);
    migrateNullainDatabase(database);
    const migrations = database.prepare("SELECT name FROM nullain_migration ORDER BY name").all();
    expect(migrations).toEqual([{ name: "001_better_auth.sql" }, { name: "002_nullain_code.sql" }]);
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    database.close();
  });
});
