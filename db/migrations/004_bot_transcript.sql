CREATE TABLE "nullain_bot_message" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "botConversationId" TEXT NOT NULL REFERENCES "nullain_bot_conversation" ("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL CHECK ("role" IN ('user','assistant')),
  "status" TEXT NOT NULL CHECK ("status" IN ('pending','streaming','completed','failed','cancelled')),
  "sequence" INTEGER NOT NULL,
  "idempotencyKey" TEXT,
  "parentMessageId" TEXT,
  "partsJson" TEXT NOT NULL,
  "publicError" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  UNIQUE("botConversationId", "sequence"),
  UNIQUE("botConversationId", "idempotencyKey")
);
CREATE INDEX "nullain_bot_message_conversation_sequence_idx" ON "nullain_bot_message" ("botConversationId", "sequence");
CREATE UNIQUE INDEX "nullain_bot_message_one_assistant_per_user_idx"
  ON "nullain_bot_message" ("parentMessageId")
  WHERE "role" = 'assistant' AND "parentMessageId" IS NOT NULL;
CREATE TABLE "nullain_bot_run" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "botConversationId" TEXT NOT NULL REFERENCES "nullain_bot_conversation" ("id") ON DELETE CASCADE,
  "userMessageId" TEXT NOT NULL REFERENCES "nullain_bot_message" ("id") ON DELETE CASCADE,
  "assistantMessageId" TEXT NOT NULL REFERENCES "nullain_bot_message" ("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL CHECK ("status" IN ('queued','running','completed','failed','cancelled','interrupted')),
  "claimToken" TEXT,
  "claimedAt" INTEGER,
  "publicError" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  UNIQUE("userMessageId"), UNIQUE("assistantMessageId")
);
CREATE INDEX "nullain_bot_run_conversation_status_idx" ON "nullain_bot_run" ("botConversationId", "status", "updatedAt");
