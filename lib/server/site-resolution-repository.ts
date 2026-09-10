import "server-only";

import type Database from "better-sqlite3";
import { getNullainDatabase } from "./nullain-db";

export type CachedSiteResolution = {
  queryKey: string;
  query: string;
  canonicalUrl: string;
  hostname: string;
  confidence: number;
  source: "searxng" | "confirmed";
  verifiedAt: number;
  expiresAt: number;
};

export function readCachedSiteResolution(
  queryKey: string,
  database: Database.Database = getNullainDatabase(),
  now = Date.now(),
): CachedSiteResolution | null {
  const row = database
    .prepare(
      `SELECT queryKey, query, canonicalUrl, hostname, confidence, source, verifiedAt, expiresAt
       FROM nullain_site_resolution_cache
       WHERE queryKey = ? AND expiresAt > ?`,
    )
    .get(queryKey, now) as CachedSiteResolution | undefined;
  return row ?? null;
}

export function writeCachedSiteResolution(
  resolution: CachedSiteResolution,
  database: Database.Database = getNullainDatabase(),
) {
  database
    .prepare(
      `INSERT INTO nullain_site_resolution_cache
         (queryKey, query, canonicalUrl, hostname, confidence, source, verifiedAt, expiresAt)
       VALUES (@queryKey, @query, @canonicalUrl, @hostname, @confidence, @source, @verifiedAt, @expiresAt)
       ON CONFLICT(queryKey) DO UPDATE SET
         query = excluded.query,
         canonicalUrl = excluded.canonicalUrl,
         hostname = excluded.hostname,
         confidence = excluded.confidence,
         source = excluded.source,
         verifiedAt = excluded.verifiedAt,
         expiresAt = excluded.expiresAt`,
    )
    .run(resolution);
  return resolution;
}
