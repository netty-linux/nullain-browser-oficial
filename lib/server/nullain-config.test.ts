import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNullainConfig,
  getNullainWorkspaceRoot,
  NullainConfigurationError,
} from "./nullain-config";

afterEach(() => vi.unstubAllEnvs());

describe("Nullain configuration", () => {
  it("fails closed without an application secret", () => {
    vi.stubEnv("NULLAIN_AUTH_SECRET", "");
    expect(() => getNullainConfig()).toThrow(NullainConfigurationError);
  });

  it("rejects the application database inside the agent workspace", () => {
    vi.stubEnv("NULLAIN_AUTH_SECRET", "test-secret-with-at-least-thirty-two-characters");
    vi.stubEnv("NULLAIN_APP_DB_PATH", path.join(getNullainWorkspaceRoot(), "auth.db"));
    expect(() => getNullainConfig()).toThrow(/workspace/);
  });

  it("accepts a configurable absolute workspace root", () => {
    const workspaceRoot = path.resolve("D:/Nullain-Code-Workspace");
    vi.stubEnv("NULLAIN_WORKSPACE_ROOT", workspaceRoot);
    expect(getNullainWorkspaceRoot()).toBe(path.normalize(workspaceRoot));
  });

  it("derives Secure cookies from an HTTPS base URL and keeps trusted origins explicit", () => {
    vi.stubEnv("NULLAIN_AUTH_SECRET", "test-secret-with-at-least-thirty-two-characters");
    vi.stubEnv("NULLAIN_AUTH_BASE_URL", "https://code.example.test");
    vi.stubEnv("NULLAIN_AUTH_TRUSTED_ORIGINS", "https://code.example.test");
    const config = getNullainConfig();
    expect(config.secureCookies).toBe(true);
    expect(config.trustedOrigins).toEqual(["https://code.example.test"]);
  });
});
