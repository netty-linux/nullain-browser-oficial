import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySkillCatalogDefaults,
  filterEnabledSkills,
  loadDisabledSkills,
  markNewSkillDisabled,
  saveDisabledSkills,
} from "./chat-model";

const storage = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});
vi.stubGlobal("window", { dispatchEvent: vi.fn() });
vi.stubGlobal(
  "CustomEvent",
  class {
    constructor(
      public type: string,
      public options?: unknown,
    ) {}
  },
);

beforeEach(() => storage.clear());

describe("skill browser preferences", () => {
  it("applies the disabled default only once for a newly created skill", () => {
    markNewSkillDisabled("copy-humanizada");
    expect(loadDisabledSkills()).toContain("copy-humanizada");

    saveDisabledSkills([]); // usuário ativou a skill
    markNewSkillDisabled("copy-humanizada"); // histórico da criação remontou

    expect(loadDisabledSkills()).not.toContain("copy-humanizada");
  });

  it("defaults only unseen user skills to disabled and keeps native skills enabled", () => {
    expect(
      applySkillCatalogDefaults([
        { name: "skill-creator", source: "native" },
        { name: "copy-humanizada", source: "user" },
      ]),
    ).toEqual(["copy-humanizada"]);
  });

  it("returns only skills enabled for the slash command selector", () => {
    const skills = [
      { name: "commit-writer", label: "Commit writer" },
      { name: "skill-creator", label: "Criador de skills" },
      { name: "copy-humanizada", label: "Copy Humanizada" },
    ];

    expect(filterEnabledSkills(skills, ["commit-writer", "SKILL-CREATOR"])).toEqual([
      { name: "copy-humanizada", label: "Copy Humanizada" },
    ]);
  });
});
