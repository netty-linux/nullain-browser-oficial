import { describe, expect, it } from "vitest";
import {
  parsePinnedThreadIds,
  serializePinnedThreadIds,
  updatePinnedThreadIds,
} from "./thread-pins";

describe("thread pins", () => {
  it("lê apenas IDs válidos, únicos e preserva a ordem", () => {
    expect(parsePinnedThreadIds('["thread-2", "thread-1", "thread-2", 7, ""]')).toEqual([
      "thread-2",
      "thread-1",
    ]);
  });

  it("ignora dados ausentes, corrompidos ou no formato errado", () => {
    expect(parsePinnedThreadIds(null)).toEqual([]);
    expect(parsePinnedThreadIds("not-json")).toEqual([]);
    expect(parsePinnedThreadIds('{"thread":"thread-1"}')).toEqual([]);
  });

  it("fixa no início e desafixa sem duplicar IDs", () => {
    const pinned = updatePinnedThreadIds(["thread-1", "thread-2"], "thread-2", true);
    expect(pinned).toEqual(["thread-2", "thread-1"]);
    expect(updatePinnedThreadIds(pinned, "thread-2", false)).toEqual(["thread-1"]);
  });

  it("serializa uma lista sanitizada", () => {
    expect(serializePinnedThreadIds([" thread-1 ", "thread-1", "thread-2"])).toBe(
      '["thread-1","thread-2"]',
    );
  });
});
