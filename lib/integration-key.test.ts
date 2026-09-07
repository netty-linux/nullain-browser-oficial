import { describe, expect, it } from "vitest";
import { isIntegrationConsumerKey, sanitizeIntegrationKey } from "./integration-key";

describe("integration keys", () => {
  it("sanitizes control characters without exposing or rewriting valid content", () => {
    expect(sanitizeIntegrationKey("  ck_valid-Key_123\r\n")).toBe("ck_valid-Key_123");
  });

  it("only accepts consumer keys for MCP authentication", () => {
    expect(isIntegrationConsumerKey("ck_valid_Key-123")).toBe(true);
    expect(isIntegrationConsumerKey("ak_project_key_123")).toBe(false);
    expect(isIntegrationConsumerKey("not-a-key")).toBe(false);
  });
});
