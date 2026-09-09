CREATE TABLE "nullain_bot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "avatarKind" TEXT NOT NULL CHECK ("avatarKind" = 'nullain-logo'),
  "avatarColorToken" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('ready', 'paused')),
  "isSystem" INTEGER NOT NULL DEFAULT 0 CHECK ("isSystem" IN (0, 1)),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  UNIQUE ("ownerUserId", "slug")
);

CREATE UNIQUE INDEX "nullain_bot_one_system_per_owner"
  ON "nullain_bot" ("ownerUserId") WHERE "isSystem" = 1;
CREATE INDEX "nullain_bot_owner_updated_idx"
  ON "nullain_bot" ("ownerUserId", "updatedAt" DESC);

CREATE TABLE "nullain_bot_draft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "sourceConversationId" TEXT,
  "objective" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "avatarColorToken" TEXT NOT NULL,
  "skillNamesJson" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL CHECK ("status" IN ('collecting', 'ready_for_review', 'cancelled', 'created')),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "confirmedRevision" INTEGER,
  "createdBotId" TEXT REFERENCES "nullain_bot" ("id") ON DELETE SET NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE INDEX "nullain_bot_draft_owner_updated_idx"
  ON "nullain_bot_draft" ("ownerUserId", "updatedAt" DESC);

CREATE TABLE "nullain_bot_skill_grant" (
  "botId" TEXT NOT NULL REFERENCES "nullain_bot" ("id") ON DELETE CASCADE,
  "ownerUserId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "skillName" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  PRIMARY KEY ("botId", "skillName")
);

CREATE INDEX "nullain_bot_skill_grant_owner_idx"
  ON "nullain_bot_skill_grant" ("ownerUserId", "botId");

CREATE TABLE "nullain_bot_conversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "botId" TEXT NOT NULL REFERENCES "nullain_bot" ("id") ON DELETE CASCADE,
  "clientConversationId" TEXT NOT NULL,
  "mastraThreadId" TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  UNIQUE ("ownerUserId", "botId", "clientConversationId")
);

CREATE INDEX "nullain_bot_conversation_owner_bot_idx"
  ON "nullain_bot_conversation" ("ownerUserId", "botId", "updatedAt" DESC);
