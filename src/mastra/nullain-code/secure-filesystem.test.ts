import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SecureProjectFilesystem, type WriteCapability } from "./secure-filesystem";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(level: WriteCapability["level"] = "none") {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nullain-fs-"));
  directories.push(directory);
  const capability: WriteCapability = { level };
  const filesystem = new SecureProjectFilesystem(directory, capability);
  await filesystem.init();
  return { directory, capability, filesystem };
}

describe("SecureProjectFilesystem", () => {
  it("rejects traversal, absolute, UNC, ADS, device and symlink paths", async () => {
    const { directory, filesystem } = await fixture("build");
    await expect(filesystem.readFile("../secret")).rejects.toThrow();
    await expect(filesystem.readFile("C:\\secret")).rejects.toThrow();
    await expect(filesystem.readFile("\\\\server\\share")).rejects.toThrow();
    await expect(filesystem.writeFile("file.txt:stream", "x")).rejects.toThrow();
    await expect(filesystem.writeFile("CON.txt", "x")).rejects.toThrow();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "nullain-outside-"));
    directories.push(outside);
    await fs.symlink(outside, path.join(directory, "escape"), "junction");
    await expect(filesystem.writeFile("escape/file.txt", "x")).rejects.toThrow(/simbólico/);
  });

  it("allows only plan files before approval and revokes build writes", async () => {
    const { capability, filesystem } = await fixture("plan");
    await filesystem.mkdir(".mastracode", { recursive: true });
    await filesystem.mkdir(".mastracode/plans", { recursive: true });
    await filesystem.writeFile(".mastracode/plans/task.md", "plan");
    await expect(filesystem.writeFile("src.ts", "x", { recursive: true })).rejects.toThrow(
      /aprove/,
    );
    capability.level = "build";
    await filesystem.writeFile("src.ts", "one");
    capability.level = "none";
    await expect(filesystem.writeFile("src.ts", "two")).rejects.toThrow(/aprove/);
  });

  it("detects content changed after a read", async () => {
    const { directory, filesystem } = await fixture("build");
    await filesystem.writeFile("file.txt", "one");
    await filesystem.readFile("file.txt");
    await fs.writeFile(path.join(directory, "file.txt"), "external");
    await expect(filesystem.writeFile("file.txt", "two")).rejects.toThrow(/Conflito/);
  });

  it("rejects hard-linked files", async () => {
    const { directory, filesystem } = await fixture("build");
    await fs.writeFile(path.join(directory, "source.txt"), "shared");
    await fs.link(path.join(directory, "source.txt"), path.join(directory, "linked.txt"));
    await expect(filesystem.readFile("linked.txt")).rejects.toThrow(/Hard links/);
  });

  it("tracks real file changes and produces a reviewable patch", async () => {
    const { directory, filesystem } = await fixture("build");
    await fs.writeFile(path.join(directory, "existing.txt"), "before\n");
    await filesystem.readFile("existing.txt");
    filesystem.resetTrackedChanges();

    await filesystem.writeFile("existing.txt", "after\n");
    await filesystem.writeFile("created.txt", "new\n");

    const changes = await filesystem.getTrackedChanges();
    expect(changes.map(({ path, status }) => ({ path, status }))).toEqual([
      { path: "created.txt", status: "added" },
      { path: "existing.txt", status: "modified" },
    ]);
    expect(changes.find((change) => change.path === "existing.txt")?.patch).toContain("-before");
    expect(changes.find((change) => change.path === "existing.txt")?.patch).toContain("+after");
  });
});
