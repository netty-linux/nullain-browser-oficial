import { afterAll, describe, expect, it } from "vitest";
import {
  destroyLocalComputer,
  getLocalComputer,
  clickLocalComputer,
  humanClickLocalComputer,
  humanKeyLocalComputer,
  humanTypeLocalComputer,
  navigateLocalComputer,
  readLocalComputer,
  screenshotLocalComputer,
  snapshotLocalComputer,
  setLocalComputerControl,
  listLocalComputerTabs,
  switchLocalComputerTab,
  typeLocalComputer,
  type LocalComputerScope,
} from "./local-computer";

const enabled = process.env.NULLAIN_LOCAL_COMPUTER_INTEGRATION === "1";
const runId = `${process.pid}-${Date.now()}`;
const first: LocalComputerScope = {
  ownerUserId: "integration-user",
  botId: "integration-bot",
  conversationId: `conversation-a-${runId}`,
};
const second: LocalComputerScope = { ...first, conversationId: `conversation-b-${runId}` };

describe.runIf(enabled)("local computer integration", () => {
  afterAll(async () => {
    await Promise.all([destroyLocalComputer(first), destroyLocalComputer(second)]);
  });

  it("navigates, reads, snapshots and captures a real local Chromium page", async () => {
    const page = await navigateLocalComputer(first, "https://example.com", "tool-navigation");
    const snapshot = await snapshotLocalComputer(first);
    const screenshot = await screenshotLocalComputer(first);

    expect(page.url).toBe("https://example.com/");
    expect(page.title).toBe("Example Domain");
    expect(page.text).toContain("Example Domain");
    expect(snapshot.snapshotId).toBe(1);
    expect(snapshot.elements.length).toBeGreaterThan(0);
    expect(screenshot.width).toBe(1280);
    expect(screenshot.height).toBe(800);
    expect([...Buffer.from(screenshot.base64, "base64").subarray(0, 3)]).toEqual([
      0xff, 0xd8, 0xff,
    ]);

    const link = snapshot.elements.find((element) => element.tag === "a");
    expect(link).toBeDefined();
    const clicked = await clickLocalComputer(first, link!.ref, snapshot.snapshotId);
    expect(clicked.url).toContain("iana.org");

    await expect(clickLocalComputer(first, link!.ref, snapshot.snapshotId - 1)).rejects.toThrow(
      "Snapshot expirado",
    );
    await navigateLocalComputer(first, "https://example.com");
  }, 30_000);

  it("isolates pages by conversation scope", async () => {
    await navigateLocalComputer(second, "https://example.com/?scope=second");
    const [left, right] = await Promise.all([readLocalComputer(first), readLocalComputer(second)]);

    expect(left.url).toBe("https://example.com/");
    expect(right.url).toContain("scope=second");
  }, 30_000);

  it("gates direct human input behind an explicit control handoff", async () => {
    await navigateLocalComputer(first, "https://example.com");
    await expect(humanClickLocalComputer(first, 10, 10)).rejects.toThrow("Assuma o controle");

    await setLocalComputerControl(first, "human");
    await humanClickLocalComputer(first, 200, 200);
    await humanKeyLocalComputer(first, "Tab");
    await humanTypeLocalComputer(first, "Nullain");

    await expect(snapshotLocalComputer(first)).rejects.toThrow("usuário está controlando");
    await setLocalComputerControl(first, "assistant");
    expect((await snapshotLocalComputer(first)).snapshotId).toBeGreaterThan(0);
  }, 30_000);

  it("restores the scoped page after the Next server cache is lost", async () => {
    await navigateLocalComputer(first, "https://example.com");
    delete (globalThis as { __nullainLocalComputerSessions?: unknown })
      .__nullainLocalComputerSessions;
    expect((await readLocalComputer(first)).url).toBe("https://example.com/");
  }, 30_000);

  it("lists and switches tabs without crossing the conversation scope", async () => {
    const session = await getLocalComputer(first);
    const extra = await session.context.newPage();
    await extra.goto("https://example.com/?tab=second", {
      waitUntil: "domcontentloaded",
    });
    const tabs = await listLocalComputerTabs(first);
    const extraTab = tabs.find((tab) => tab.url.includes("tab=second"));
    expect(extraTab).toBeDefined();
    const switched = await switchLocalComputerTab(first, extraTab!.index);
    expect(switched.url).toContain("tab=second");
  }, 30_000);

  it("fills both regular and contenteditable fields without aborting the run", async () => {
    const session = await getLocalComputer(first);
    await session.page.setContent(`
      <label>Search <input aria-label="Search" /></label>
      <div role="textbox" aria-label="Editor" contenteditable="true"></div>
    `);
    const firstSnapshot = await snapshotLocalComputer(first);
    const search = firstSnapshot.elements.find((element) => element.name === "Search");
    const editor = firstSnapshot.elements.find((element) => element.name === "Editor");
    expect(search).toBeDefined();
    expect(editor).toBeDefined();

    await typeLocalComputer(first, search!.ref, firstSnapshot.snapshotId, "Neurotecnologia");
    await typeLocalComputer(first, editor!.ref, firstSnapshot.snapshotId, "Resumo local");

    expect(await session.page.locator("input").inputValue()).toBe("Neurotecnologia");
    expect(await session.page.locator('[role="textbox"]').innerText()).toBe("Resumo local");
  }, 30_000);
});
