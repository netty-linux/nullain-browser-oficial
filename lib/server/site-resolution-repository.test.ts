import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateNullainDatabase, openNullainDatabase } from "./nullain-db";
import { readCachedSiteResolution, writeCachedSiteResolution } from "./site-resolution-repository";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("site resolution cache repository", () => {
  it("round-trips a live entry and ignores it after expiry", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nullain-sites-"));
    directories.push(directory);
    const database = openNullainDatabase(path.join(directory, "app.db"));
    migrateNullainDatabase(database);
    writeCachedSiteResolution(
      {
        queryKey: "cloudflare",
        query: "cloudflare",
        canonicalUrl: "https://www.cloudflare.com/",
        hostname: "www.cloudflare.com",
        confidence: 0.98,
        source: "searxng",
        verifiedAt: 100,
        expiresAt: 200,
      },
      database,
    );
    expect(readCachedSiteResolution("cloudflare", database, 150)?.canonicalUrl).toBe(
      "https://www.cloudflare.com/",
    );
    expect(readCachedSiteResolution("cloudflare", database, 201)).toBeNull();
    database.close();
  });
});
