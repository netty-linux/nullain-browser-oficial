CREATE TABLE "nullain_site_resolution_cache" (
  "queryKey" TEXT NOT NULL PRIMARY KEY,
  "query" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "hostname" TEXT NOT NULL,
  "confidence" REAL NOT NULL CHECK ("confidence" >= 0 AND "confidence" <= 1),
  "source" TEXT NOT NULL CHECK ("source" IN ('searxng', 'confirmed')),
  "verifiedAt" INTEGER NOT NULL,
  "expiresAt" INTEGER NOT NULL
);

CREATE INDEX "nullain_site_resolution_cache_expiry_idx"
  ON "nullain_site_resolution_cache" ("expiresAt");
