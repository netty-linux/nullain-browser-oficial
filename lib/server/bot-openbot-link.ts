import "server-only";

import { getNullainDatabase } from "./nullain-db";
import { requireBot } from "./bot-runtime-repository";

export type BotOpenBotLink = {
  botId: string;
  ownerUserId: string;
  openbotAgentId: string;
  createdAt: number;
  updatedAt: number;
};

export function isBotComputerLinkEnabled(): boolean {
  return process.env.NULLAIN_BOT_COMPUTER === "1";
}

const SAFE_AGENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function getBotOpenBotLink(ownerUserId: string, botId: string): BotOpenBotLink | null {
  requireBot(ownerUserId, botId);
  const row = getNullainDatabase()
    .prepare("SELECT * FROM nullain_bot_openbot_link WHERE botId = ? AND ownerUserId = ?")
    .get(botId, ownerUserId) as BotOpenBotLink | undefined;
  return row ?? null;
}

export function setBotOpenBotLink(
  ownerUserId: string,
  botId: string,
  openbotAgentId: unknown,
): BotOpenBotLink {
  const bot = requireBot(ownerUserId, botId);
  if (bot.isSystem) throw new Error("O bot principal usa o computador padrão da Nullain.");
  if (typeof openbotAgentId !== "string" || !SAFE_AGENT_ID.test(openbotAgentId)) {
    throw new Error("Identificador do agente OpenBot inválido.");
  }
  const now = Date.now();
  const database = getNullainDatabase();
  database
    .prepare(
      `INSERT INTO nullain_bot_openbot_link (botId, ownerUserId, openbotAgentId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (botId) DO UPDATE SET openbotAgentId = excluded.openbotAgentId, updatedAt = excluded.updatedAt`,
    )
    .run(bot.id, ownerUserId, openbotAgentId, now, now);
  return getBotOpenBotLink(ownerUserId, bot.id) as BotOpenBotLink;
}

export function clearBotOpenBotLink(ownerUserId: string, botId: string): void {
  requireBot(ownerUserId, botId);
  getNullainDatabase()
    .prepare("DELETE FROM nullain_bot_openbot_link WHERE botId = ? AND ownerUserId = ?")
    .run(botId, ownerUserId);
}
