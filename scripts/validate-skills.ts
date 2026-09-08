import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseAgentSkill } from "../src/mastra/skills/spec";

const roots = [
  join(process.cwd(), ".agents", "skills"),
  join(process.cwd(), "src", "mastra", "skills", "builtin"),
  join(process.cwd(), "skills", "user-scoped"),
];

function collectSkillDocuments(directory: string, output: string[]): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) collectSkillDocuments(path, output);
    else if (entry === "SKILL.md") output.push(path);
  }
}

const documents: string[] = [];
for (const root of roots) collectSkillDocuments(root, documents);

const failures: string[] = [];
for (const path of documents) {
  try {
    parseAgentSkill(readFileSync(path, "utf8"), basename(dirname(path)));
    console.info(`✓ ${path}`);
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.info(`Validated ${documents.length} Agent Skill${documents.length === 1 ? "" : "s"}.`);
}
