import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { afterAll, describe, expect, it } from "vitest";
import { migrateNullainDatabase, openNullainDatabase } from "./nullain-db";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nullain-auth-"));
const database = openNullainDatabase(path.join(directory, "auth.db"));
migrateNullainDatabase(database);
const auth = betterAuth({
  secret: "test-secret-with-at-least-thirty-two-characters",
  baseURL: "http://localhost:3000",
  database,
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
  session: { cookieCache: { enabled: false } },
  plugins: [admin()],
});

afterAll(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("Nullain authentication", () => {
  it("creates two local users, persists revocable sessions, and blocks public signup", async () => {
    const first = await auth.api.createUser({
      body: {
        email: "one@example.test",
        name: "One",
        password: "correct-horse-one",
        role: "admin",
      },
    });
    const second = await auth.api.createUser({
      body: { email: "two@example.test", name: "Two", password: "correct-horse-two", role: "user" },
    });
    expect(first.user.id).not.toBe(second.user.id);

    const response = await auth.api.signInEmail({
      body: { email: "one@example.test", password: "correct-horse-one" },
      asResponse: true,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session_token");
    expect(database.prepare('SELECT count(*) AS count FROM "session"').get()).toEqual({ count: 1 });

    await expect(
      auth.api.signUpEmail({
        body: { email: "public@example.test", name: "Public", password: "correct-horse-public" },
      }),
    ).rejects.toThrow();
  });
});
