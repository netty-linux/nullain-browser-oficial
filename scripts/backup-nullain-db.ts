import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { existsSync } from "node:fs";
import { getNullainConfig } from "../lib/server/nullain-config";
import { openNullainDatabase } from "../lib/server/nullain-db";

const localEnvironment = path.resolve(process.cwd(), ".env.local");
if (existsSync(localEnvironment)) process.loadEnvFile(localEnvironment);

async function main() {
  const config = getNullainConfig();
  const outputDirectory = path.join(path.dirname(config.databasePath), "backups");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(outputDirectory, `nullain-app.pre-004-${stamp}.db`);
  const database = openNullainDatabase(config.databasePath);
  try {
    await database.backup(target);
    const tables = database
      .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table'")
      .get() as { count: number };
    console.log(JSON.stringify({ backup: path.basename(target), tables: tables.count }));
  } finally {
    database.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Backup falhou.");
  process.exitCode = 1;
});
