import { describe, expect, it } from "vitest";
import { isCrossSiteMutation } from "./request-security";

describe("isCrossSiteMutation", () => {
  it("permite mutações da mesma origem", () => {
    const request = new Request("http://localhost:3000/api/skills", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    expect(isCrossSiteMutation(request)).toBe(false);
  });

  it("bloqueia mutações de outra origem", () => {
    const request = new Request("http://localhost:3000/api/skills", {
      method: "DELETE",
      headers: { origin: "https://attacker.example" },
    });
    expect(isCrossSiteMutation(request)).toBe(true);
  });

  it("não bloqueia leituras", () => {
    const request = new Request("http://localhost:3000/api/skills", {
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(isCrossSiteMutation(request)).toBe(false);
  });
});
