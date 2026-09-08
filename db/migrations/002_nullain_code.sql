CREATE TABLE "nullain_code_project" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "directoryName" TEXT NOT NULL UNIQUE,
  "provisioningState" TEXT NOT NULL CHECK ("provisioningState" IN ('pending', 'ready', 'failed')),
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  UNIQUE ("ownerUserId", "name")
);

CREATE TABLE "nullain_code_conversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "nullain_code_project" ("id") ON DELETE CASCADE,
  "mastraThreadId" TEXT NOT NULL UNIQUE,
  "provisioningState" TEXT NOT NULL CHECK ("provisioningState" IN ('pending', 'ready', 'failed')),
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE INDEX "nullain_code_conversation_owner_idx"
  ON "nullain_code_conversation" ("ownerUserId", "projectId");

CREATE TABLE "nullain_code_run" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "authSessionId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL REFERENCES "nullain_code_conversation" ("id") ON DELETE CASCADE,
  "taskId" TEXT NOT NULL,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('plan', 'build')),
  "status" TEXT NOT NULL CHECK ("status" IN ('active', 'completed', 'cancelled', 'failed', 'revoked')),
  "startedAt" INTEGER NOT NULL,
  "finishedAt" INTEGER,
  "interruptedReason" TEXT
);

CREATE INDEX "nullain_code_run_session_idx"
  ON "nullain_code_run" ("authSessionId", "status");

CREATE TABLE "nullain_code_decision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL REFERENCES "nullain_code_run" ("id") ON DELETE CASCADE,
  "ownerUserId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "authSessionId" TEXT NOT NULL,
  "toolCallId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('plan', 'write', 'suspension')),
  "argumentsHash" TEXT NOT NULL,
  "decision" TEXT NOT NULL CHECK ("decision" IN ('approved', 'declined')),
  "createdAt" INTEGER NOT NULL,
  UNIQUE ("runId", "toolCallId", "kind")
);
