CREATE TABLE "nullain_bot_openbot_link" (
  "botId" TEXT NOT NULL PRIMARY KEY REFERENCES "nullain_bot" ("id") ON DELETE CASCADE,
  "ownerUserId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "openbotAgentId" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE INDEX "nullain_bot_openbot_link_owner_idx"
  ON "nullain_bot_openbot_link" ("ownerUserId", "botId");
