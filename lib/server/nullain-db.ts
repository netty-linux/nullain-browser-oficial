import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { getNullainConfig } from "./nullain-config";

const REQUIRED_MIGRATIONS = ["001_better_auth.sql", "002_nullain_code.sql"] as const;

type GlobalDatabase = typeof globalThis & { __nullainAppDatabase?: Database.Database };

function configure(database: Database.Database) {
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
}

export function openNullainDatabase(databasePath = getNullainConfig().databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  configure(database);
  return database;
}

export function getNullainDatabase() {
  const globals = globalThis as GlobalDatabase;
  if (!globals.__nullainAppDatabase) globals.__nullainAppDatabase = openNullainDatabase();
  return globals.__nullainAppDatabase;
}

function migrationDirectory() {
  return path.join(process.cwd(), "db", "migrations");
}

export function migrationChecksum(sql: string) {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n")).digest("hex");
}

export function migrateNullainDatabase(database: Database.Database) {
  database.exec(`CREATE TABLE IF NOT EXISTS "nullain_migration" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "appliedAt" INTEGER NOT NULL
  )`);

  const find = database.prepare("SELECT checksum FROM nullain_migration WHERE name = ?");
  const record = database.prepare(
    "INSERT INTO nullain_migration (name, checksum, appliedAt) VALUES (?, ?, ?)",
  );
  const apply = database.transaction((name: string, sql: string, digest: string) => {
    database.exec(sql);
    record.run(name, digest, Date.now());
  });

  for (const name of REQUIRED_MIGRATIONS) {
    const sql = fs.readFileSync(path.join(migrationDirectory(), name), "utf8");
    const digest = migrationChecksum(sql);
    const existing = find.get(name) as { checksum: string } | undefined;
    if (existing) {
      if (existing.checksum !== digest)
        throw new Error(`Migration já aplicada foi alterada: ${name}`);
      continue;
    }
    apply(name, sql, digest);
  }
}

export function assertNullainDatabaseReady(database = getNullainDatabase()) {
  const table = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'nullain_migration'")
    .get();
  if (!table) throw new Error("Banco Nullain não migrado. Execute npm run db:migrate.");
  const rows = database.prepare("SELECT name, checksum FROM nullain_migration").all() as Array<{
    name: string;
    checksum: string;
  }>;
  const applied = new Map(rows.map((row) => [row.name, row.checksum]));
  for (const name of REQUIRED_MIGRATIONS) {
    const sql = fs.readFileSync(path.join(migrationDirectory(), name), "utf8");
    if (applied.get(name) !== migrationChecksum(sql)) {
      throw new Error(`Migration ausente ou incompatível: ${name}`);
    }
  }
}
