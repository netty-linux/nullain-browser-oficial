import "server-only";

import { randomUUID } from "node:crypto";
import { getNullainDatabase } from "./nullain-db";
import { CHAT_MODEL_IDS, DEFAULT_CHAT_MODEL } from "@/lib/model-catalog";
import { loadSkills } from "@/src/mastra/skills/loader";

export const BOT_AVATAR_COLORS = ["ocean", "violet", "emerald", "amber", "rose", "indigo"] as const;
export type BotAvatarColor = (typeof BOT_AVATAR_COLORS)[number];

export type NullainBot = {
  id: string;
  ownerUserId: string;
  slug: string;
  name: string;
  description: string;
  instructions: string;
  modelId: string;
  avatarKind: "nullain-logo";
  avatarColorToken: BotAvatarColor;
  status: "ready" | "paused";
  isSystem: 0 | 1;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type BotDraft = {
  id: string;
  ownerUserId: string;
  sourceConversationId: string | null;
  objective: string;
  name: string;
  description: string;
  instructions: string;
  modelId: string;
  avatarColorToken: BotAvatarColor;
  skillNamesJson: string;
  status: "collecting" | "ready_for_review" | "cancelled" | "created";
  revision: number;
  confirmedRevision: number | null;
  createdBotId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type BotConversation = {
  id: string;
  ownerUserId: string;
  botId: string;
  clientConversationId: string;
  mastraThreadId: string;
  createdAt: number;
  updatedAt: number;
};

const SAFE_CONVERSATION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MODEL_IDS = new Set<string>(CHAT_MODEL_IDS);

function database() {
  return getNullainDatabase();
}

function text(value: unknown, label: string, maximum: number, minimum = 1) {
  if (typeof value !== "string") throw new Error(`${label} inválido.`);
  const normalized = value.trim().replace(/\s+/g, " ");
  if (
    normalized.length < minimum ||
    normalized.length > maximum ||
    [...normalized].some((character) => character.charCodeAt(0) < 32)
  ) {
    throw new Error(`${label} deve ter entre ${minimum} e ${maximum} caracteres.`);
  }
  return normalized;
}

function longText(value: unknown, label: string, maximum: number) {
  if (typeof value !== "string") throw new Error(`${label} inválido.`);
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maximum ||
    [...normalized].some((character) => character.charCodeAt(0) < 32)
  ) {
    throw new Error(`${label} deve ter entre 1 e ${maximum} caracteres.`);
  }
  return normalized;
}

function parseSkillNames(value: unknown, ownerUserId: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) throw new Error("Skills selecionadas inválidas.");
  const names = value.map((entry) => text(entry, "Nome da skill", 64));
  if (names.some((name) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))) {
    throw new Error("Nome de skill inválido.");
  }
  const unique = [...new Set(names.map((name) => name.toLowerCase()))];
  const available = new Set(loadSkills(false, ownerUserId).map((skill) => skill.name));
  if (unique.some((name) => !available.has(name))) throw new Error("Skill inexistente.");
  return unique;
}

function parseColor(value: unknown): BotAvatarColor {
  if (typeof value !== "string" || !BOT_AVATAR_COLORS.includes(value as BotAvatarColor)) {
    throw new Error("Cor de identificação inválida.");
  }
  return value as BotAvatarColor;
}

function parseStatus(value: unknown): "ready" | "paused" {
  if (value !== "ready" && value !== "paused") throw new Error("Status inválido.");
  return value;
}

function parseModel(value: unknown) {
  if (typeof value !== "string" || !MODEL_IDS.has(value)) throw new Error("Modelo não permitido.");
  return value;
}

function slugify(value: string) {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "bot";
}

function nextSlug(ownerUserId: string, name: string) {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  const exists = database().prepare("SELECT 1 FROM nullain_bot WHERE ownerUserId = ? AND slug = ?");
  while (exists.get(ownerUserId, candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function nextColor(ownerUserId: string): BotAvatarColor {
  const used = new Set(
    (
      database()
        .prepare("SELECT avatarColorToken FROM nullain_bot WHERE ownerUserId = ?")
        .all(ownerUserId) as Array<{ avatarColorToken: BotAvatarColor }>
    ).map((bot) => bot.avatarColorToken),
  );
  return BOT_AVATAR_COLORS.find((color) => !used.has(color)) ?? BOT_AVATAR_COLORS[0];
}

function systemBotValues(ownerUserId: string): NullainBot {
  const now = Date.now();
  return {
    id: randomUUID(),
    ownerUserId,
    slug: "nullain",
    name: "Nullain",
    description: "Assistente principal da Nullain.",
    instructions:
      "You are the Nullain system bot. Use the shared operational contract and help directly. Do not claim to be a separate worker.",
    modelId: DEFAULT_CHAT_MODEL,
    avatarKind: "nullain-logo",
    avatarColorToken: "ocean",
    status: "ready",
    isSystem: 1,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function ensureSystemBot(ownerUserId: string): NullainBot {
  const existing = database()
    .prepare("SELECT * FROM nullain_bot WHERE ownerUserId = ? AND isSystem = 1")
    .get(ownerUserId) as NullainBot | undefined;
  if (existing) return existing;
  const bot = systemBotValues(ownerUserId);
  try {
    database()
      .prepare(
        `INSERT INTO nullain_bot
         (id, ownerUserId, slug, name, description, instructions, modelId, avatarKind, avatarColorToken, status, isSystem, revision, createdAt, updatedAt)
         VALUES (@id, @ownerUserId, @slug, @name, @description, @instructions, @modelId, @avatarKind, @avatarColorToken, @status, @isSystem, @revision, @createdAt, @updatedAt)`,
      )
      .run(bot);
    return bot;
  } catch {
    const raced = database()
      .prepare("SELECT * FROM nullain_bot WHERE ownerUserId = ? AND isSystem = 1")
      .get(ownerUserId) as NullainBot | undefined;
    if (raced) return raced;
    throw new Error("Não foi possível iniciar a Nullain.");
  }
}

export function listBots(ownerUserId: string) {
  ensureSystemBot(ownerUserId);
  return database()
    .prepare(
      "SELECT * FROM nullain_bot WHERE ownerUserId = ? ORDER BY isSystem DESC, createdAt ASC",
    )
    .all(ownerUserId) as NullainBot[];
}

export function requireBot(ownerUserId: string, botId: string): NullainBot {
  const bot = database()
    .prepare("SELECT * FROM nullain_bot WHERE id = ? AND ownerUserId = ?")
    .get(botId, ownerUserId) as NullainBot | undefined;
  if (!bot) throw new Response("Bot não encontrado.", { status: 404 });
  return bot;
}

export function createBotDraft(
  ownerUserId: string,
  input: { objective: unknown; sourceConversationId?: unknown },
) {
  const objective = longText(input.objective, "Objetivo", 1_500);
  const sourceConversationId =
    typeof input.sourceConversationId === "string" &&
    SAFE_CONVERSATION_ID.test(input.sourceConversationId)
      ? input.sourceConversationId
      : null;
  const now = Date.now();
  const draft: BotDraft = {
    id: randomUUID(),
    ownerUserId,
    sourceConversationId,
    objective,
    name: "Novo bot",
    description: objective.slice(0, 180),
    instructions: `Help with this persistent objective: ${objective}`,
    modelId: DEFAULT_CHAT_MODEL,
    avatarColorToken: nextColor(ownerUserId),
    skillNamesJson: "[]",
    status: "collecting",
    revision: 1,
    confirmedRevision: null,
    createdBotId: null,
    createdAt: now,
    updatedAt: now,
  };
  database()
    .prepare(
      `INSERT INTO nullain_bot_draft
       (id, ownerUserId, sourceConversationId, objective, name, description, instructions, modelId, avatarColorToken, skillNamesJson, status, revision, confirmedRevision, createdBotId, createdAt, updatedAt)
       VALUES (@id, @ownerUserId, @sourceConversationId, @objective, @name, @description, @instructions, @modelId, @avatarColorToken, @skillNamesJson, @status, @revision, @confirmedRevision, @createdBotId, @createdAt, @updatedAt)`,
    )
    .run(draft);
  return draft;
}

export function requireDraft(ownerUserId: string, draftId: string): BotDraft {
  const draft = database()
    .prepare("SELECT * FROM nullain_bot_draft WHERE id = ? AND ownerUserId = ?")
    .get(draftId, ownerUserId) as BotDraft | undefined;
  if (!draft) throw new Response("Rascunho não encontrado.", { status: 404 });
  return draft;
}

export function findConversationDraft(
  ownerUserId: string,
  sourceConversationId: string,
): BotDraft | null {
  return (
    (database()
      .prepare(
        `SELECT * FROM nullain_bot_draft
         WHERE ownerUserId = ? AND sourceConversationId = ?
         ORDER BY createdAt DESC LIMIT 1`,
      )
      .get(ownerUserId, sourceConversationId) as BotDraft | undefined) ?? null
  );
}

export function ensureConversationDraft(
  ownerUserId: string,
  sourceConversationId: string,
  objective: unknown,
): BotDraft {
  const existing = findConversationDraft(ownerUserId, sourceConversationId);
  if (existing && existing.status !== "cancelled" && existing.status !== "created") return existing;
  return createBotDraft(ownerUserId, { objective, sourceConversationId });
}

export function requireBotConversation(
  ownerUserId: string,
  conversationId: string,
): BotConversation {
  const result = database()
    .prepare("SELECT * FROM nullain_bot_conversation WHERE id = ? AND ownerUserId = ?")
    .get(conversationId, ownerUserId) as BotConversation | undefined;
  if (!result) throw new Response("Conversa não encontrada.", { status: 404 });
  return result;
}

export function reviewBotDraft(
  ownerUserId: string,
  draftId: string,
  input: {
    revision: unknown;
    name: unknown;
    description: unknown;
    instructions: unknown;
    modelId: unknown;
    avatarColorToken: unknown;
    skillNames?: unknown;
  },
) {
  const draft = requireDraft(ownerUserId, draftId);
  if (draft.status === "cancelled" || draft.status === "created") {
    throw new Error("Este rascunho não pode mais ser alterado.");
  }
  if (input.revision !== draft.revision)
    throw new Error("O rascunho mudou. Revise os dados atuais.");
  const nextRevision = draft.revision + 1;
  const values = {
    name: text(input.name, "Nome", 80),
    description: text(input.description, "Resumo", 240),
    instructions: longText(input.instructions, "Instruções", 8_000),
    modelId: parseModel(input.modelId),
    avatarColorToken: parseColor(input.avatarColorToken),
    skillNamesJson: JSON.stringify(parseSkillNames(input.skillNames, ownerUserId)),
    status: "ready_for_review" as const,
    revision: nextRevision,
    confirmedRevision: nextRevision,
    updatedAt: Date.now(),
  };
  database()
    .prepare(
      `UPDATE nullain_bot_draft SET name = @name, description = @description, instructions = @instructions,
       modelId = @modelId, avatarColorToken = @avatarColorToken, skillNamesJson = @skillNamesJson,
       status = @status, revision = @revision, confirmedRevision = @confirmedRevision, updatedAt = @updatedAt
       WHERE id = @draftId AND ownerUserId = @ownerUserId`,
    )
    .run({ ...values, draftId, ownerUserId });
  return requireDraft(ownerUserId, draftId);
}

export function cancelBotDraft(ownerUserId: string, draftId: string) {
  const draft = requireDraft(ownerUserId, draftId);
  if (draft.status === "created") throw new Error("Um bot já foi criado com este rascunho.");
  database()
    .prepare(
      "UPDATE nullain_bot_draft SET status = 'cancelled', updatedAt = ? WHERE id = ? AND ownerUserId = ?",
    )
    .run(Date.now(), draftId, ownerUserId);
}

export function createBotFromDraft(
  ownerUserId: string,
  draftId: string,
  revision: unknown,
): NullainBot {
  const draft = requireDraft(ownerUserId, draftId);
  if (draft.createdBotId) return requireBot(ownerUserId, draft.createdBotId);
  if (draft.status !== "ready_for_review" || draft.confirmedRevision !== draft.revision) {
    throw new Error("Revise o rascunho antes de criar o bot.");
  }
  if (revision !== draft.revision) throw new Error("A revisão enviada está desatualizada.");
  const now = Date.now();
  const bot: NullainBot = {
    id: randomUUID(),
    ownerUserId,
    slug: nextSlug(ownerUserId, draft.name),
    name: draft.name,
    description: draft.description,
    instructions: draft.instructions,
    modelId: draft.modelId,
    avatarKind: "nullain-logo",
    avatarColorToken: draft.avatarColorToken,
    status: "ready",
    isSystem: 0,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  const skills = JSON.parse(draft.skillNamesJson) as string[];
  const transaction = database().transaction(() => {
    const fresh = requireDraft(ownerUserId, draftId);
    if (fresh.createdBotId) return requireBot(ownerUserId, fresh.createdBotId);
    if (fresh.revision !== draft.revision || fresh.confirmedRevision !== fresh.revision) {
      throw new Error("O rascunho mudou. Revise novamente.");
    }
    database()
      .prepare(
        `INSERT INTO nullain_bot
         (id, ownerUserId, slug, name, description, instructions, modelId, avatarKind, avatarColorToken, status, isSystem, revision, createdAt, updatedAt)
         VALUES (@id, @ownerUserId, @slug, @name, @description, @instructions, @modelId, @avatarKind, @avatarColorToken, @status, @isSystem, @revision, @createdAt, @updatedAt)`,
      )
      .run(bot);
    const grant = database().prepare(
      "INSERT INTO nullain_bot_skill_grant (botId, ownerUserId, skillName, createdAt) VALUES (?, ?, ?, ?)",
    );
    for (const skillName of skills) grant.run(bot.id, ownerUserId, skillName, now);
    database()
      .prepare(
        "UPDATE nullain_bot_draft SET status = 'created', createdBotId = ?, updatedAt = ? WHERE id = ? AND ownerUserId = ?",
      )
      .run(bot.id, now, draftId, ownerUserId);
    return bot;
  });
  return transaction();
}

export function updateBotProfile(
  ownerUserId: string,
  botId: string,
  input: {
    revision: unknown;
    name?: unknown;
    description?: unknown;
    instructions?: unknown;
    modelId?: unknown;
    avatarColorToken?: unknown;
    status?: unknown;
    skillNames?: unknown;
  },
) {
  const bot = requireBot(ownerUserId, botId);
  if (bot.isSystem)
    throw new Error("A identidade principal da Nullain não pode ser alterada aqui.");
  if (input.revision !== bot.revision) throw new Error("O perfil mudou. Atualize antes de salvar.");
  const values = {
    name: input.name === undefined ? bot.name : text(input.name, "Nome", 80),
    description:
      input.description === undefined ? bot.description : text(input.description, "Resumo", 240),
    instructions:
      input.instructions === undefined
        ? bot.instructions
        : longText(input.instructions, "Instruções", 8_000),
    modelId: input.modelId === undefined ? bot.modelId : parseModel(input.modelId),
    avatarColorToken:
      input.avatarColorToken === undefined
        ? bot.avatarColorToken
        : parseColor(input.avatarColorToken),
    status: input.status === undefined ? bot.status : parseStatus(input.status),
    revision: bot.revision + 1,
    updatedAt: Date.now(),
  };
  const skillNames =
    input.skillNames === undefined ? null : parseSkillNames(input.skillNames, ownerUserId);
  const transaction = database().transaction(() => {
    database()
      .prepare(
        `UPDATE nullain_bot SET name = @name, description = @description, instructions = @instructions,
       modelId = @modelId, avatarColorToken = @avatarColorToken, status = @status, revision = @revision, updatedAt = @updatedAt
       WHERE id = @botId AND ownerUserId = @ownerUserId`,
      )
      .run({ ...values, botId, ownerUserId });
    if (skillNames !== null) {
      database()
        .prepare("DELETE FROM nullain_bot_skill_grant WHERE botId = ? AND ownerUserId = ?")
        .run(botId, ownerUserId);
      const grant = database().prepare(
        "INSERT INTO nullain_bot_skill_grant (botId, ownerUserId, skillName, createdAt) VALUES (?, ?, ?, ?)",
      );
      for (const skillName of skillNames)
        grant.run(botId, ownerUserId, skillName, values.updatedAt);
    }
  });
  transaction();
  return requireBot(ownerUserId, botId);
}

export function deleteBot(ownerUserId: string, botId: string, input: { confirmName?: unknown }) {
  const bot = requireBot(ownerUserId, botId);
  if (bot.isSystem) throw new Error("A identidade principal da Nullain não pode ser excluída.");
  const confirmName = typeof input.confirmName === "string" ? input.confirmName.trim() : "";
  if (confirmName !== bot.name)
    throw new Error("Confirme a exclusão digitando o nome exato do bot.");
  database()
    .prepare("DELETE FROM nullain_bot WHERE id = ? AND ownerUserId = ?")
    .run(botId, ownerUserId);
}

export function ensureBotConversation(
  ownerUserId: string,
  botId: string,
  clientConversationId: unknown,
) {
  requireBot(ownerUserId, botId);
  if (
    typeof clientConversationId !== "string" ||
    !SAFE_CONVERSATION_ID.test(clientConversationId)
  ) {
    throw new Error("Identificador de conversa inválido.");
  }
  const existing = database()
    .prepare(
      `SELECT * FROM nullain_bot_conversation
       WHERE ownerUserId = ? AND botId = ? AND clientConversationId = ?`,
    )
    .get(ownerUserId, botId, clientConversationId) as BotConversation | undefined;
  if (existing) return existing;
  const boundElsewhere = database()
    .prepare(
      "SELECT botId FROM nullain_bot_conversation WHERE ownerUserId = ? AND clientConversationId = ?",
    )
    .get(ownerUserId, clientConversationId) as { botId: string } | undefined;
  if (boundElsewhere && boundElsewhere.botId !== botId) {
    throw new Error("Esta conversa já pertence a outro bot.");
  }
  const now = Date.now();
  const conversation: BotConversation = {
    id: randomUUID(),
    ownerUserId,
    botId,
    clientConversationId,
    mastraThreadId: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  try {
    database()
      .prepare(
        `INSERT INTO nullain_bot_conversation
         (id, ownerUserId, botId, clientConversationId, mastraThreadId, createdAt, updatedAt)
         VALUES (@id, @ownerUserId, @botId, @clientConversationId, @mastraThreadId, @createdAt, @updatedAt)`,
      )
      .run(conversation);
    return conversation;
  } catch {
    const raced = database()
      .prepare(
        `SELECT * FROM nullain_bot_conversation
         WHERE ownerUserId = ? AND botId = ? AND clientConversationId = ?`,
      )
      .get(ownerUserId, botId, clientConversationId) as BotConversation | undefined;
    if (raced) return raced;
    throw new Error("Não foi possível vincular a conversa do bot.");
  }
}

export function resolveBotRuntime(
  ownerUserId: string,
  botId: unknown,
  clientConversationId: unknown,
) {
  if (typeof botId !== "string") throw new Error("Bot inválido.");
  const bot = requireBot(ownerUserId, botId);
  if (bot.status !== "ready") throw new Error("Este bot está pausado.");
  const conversation = ensureBotConversation(ownerUserId, bot.id, clientConversationId);
  const skills = bot.isSystem
    ? null
    : (
        database()
          .prepare(
            "SELECT skillName FROM nullain_bot_skill_grant WHERE botId = ? AND ownerUserId = ? ORDER BY skillName",
          )
          .all(bot.id, ownerUserId) as Array<{ skillName: string }>
      ).map((grant) => grant.skillName);
  return { bot, conversation, grantedSkillNames: skills };
}

export function listGrantedSkillNames(ownerUserId: string, botId: string): string[] | null {
  const bot = requireBot(ownerUserId, botId);
  if (bot.isSystem) return null;
  return (
    database()
      .prepare(
        "SELECT skillName FROM nullain_bot_skill_grant WHERE botId = ? AND ownerUserId = ? ORDER BY skillName",
      )
      .all(bot.id, ownerUserId) as Array<{ skillName: string }>
  ).map((grant) => grant.skillName);
}
