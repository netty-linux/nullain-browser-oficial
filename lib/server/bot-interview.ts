import "server-only";

import {
  ensureConversationDraft,
  findConversationDraft,
  reviewBotDraft,
  type BotDraft,
} from "./bot-runtime-repository";

const explicitCreation = [
  /\bcri(?:e|ar|a)\s+(?:um\s+)?bot\b/i,
  /\b(?:assistente|agente)\s+permanente\b/i,
  /\b(?:novo|criar)\s+(?:um\s+)?assistente\b/i,
];
const nonCreation = [
  /^ser[aá]\s+que\s+(?:eu\s+)?preciso\s+de\s+(?:um\s+)?bot/i,
  /^quais\s+bots\b/i,
  /^abr[ae]\s+(?:o\s+)?(?:meu\s+)?bot\b/i,
  /^\s*\//,
];

export function isExplicitBotCreationRequest(text: string) {
  const normalized = text.trim();
  return (
    !nonCreation.some((pattern) => pattern.test(normalized)) &&
    explicitCreation.some((pattern) => pattern.test(normalized))
  );
}

export function extractBotObjective(text: string) {
  return text
    .replace(/^(?:eu\s+)?(?:quero|preciso|gostaria\s+de)?\s*/i, "")
    .replace(/\bcri(?:e|ar|a)\s+(?:um\s+)?(?:bot|assistente|agente)\s*(?:permanente)?\s*/i, "")
    .replace(/^para\s+/i, "")
    .trim();
}

export type InterviewResult =
  | { kind: "question"; draft: BotDraft; text: string }
  | { kind: "review"; draft: BotDraft; text: string; part: Record<string, unknown> };

export function advanceBotInterview(
  ownerUserId: string,
  conversationId: string,
  userText: string,
): InterviewResult | null {
  const normalized = userText.trim();
  const existing = findConversationDraft(ownerUserId, conversationId);
  if (existing && (existing.status === "created" || existing.status === "cancelled")) {
    if (isExplicitBotCreationRequest(normalized)) {
      const fresh = ensureConversationDraft(
        ownerUserId,
        conversationId,
        extractBotObjective(normalized) || normalized,
      );
      if (fresh.status === "collecting" && fresh.name === "Novo bot") {
        return {
          kind: "question",
          draft: fresh,
          text: "Entendi o objetivo. Qual nome você quer dar a esse bot permanente?",
        };
      }
      return reviewResult(fresh);
    }
    return null;
  }
  if (!existing && !isExplicitBotCreationRequest(normalized)) return null;
  const draft =
    existing ??
    ensureConversationDraft(
      ownerUserId,
      conversationId,
      extractBotObjective(normalized) || normalized,
    );
  if (draft.status === "created" || draft.status === "cancelled") return null;
  if (draft.status === "collecting" && draft.name === "Novo bot") {
    if (!existing) {
      return {
        kind: "question",
        draft,
        text: "Entendi o objetivo. Qual nome você quer dar a esse bot permanente?",
      };
    }
    if (!normalized) return null;
    const name = normalized.slice(0, 80);
    const reviewed = reviewBotDraft(ownerUserId, draft.id, {
      revision: draft.revision,
      name,
      description: draft.objective.slice(0, 240),
      instructions: `Help continuously with this objective: ${draft.objective}`,
      modelId: draft.modelId,
      avatarColorToken: draft.avatarColorToken,
      skillNames: [],
    });
    return reviewResult(reviewed);
  }
  return null;
}

function reviewResult(draft: BotDraft): InterviewResult {
  const part = botReviewPart(draft);
  return {
    kind: "review",
    draft,
    text: "Revise os dados abaixo. O bot só será criado depois da sua confirmação.",
    part,
  };
}

export function botReviewPart(draft: BotDraft): Record<string, unknown> {
  const snapshot = {
    name: draft.name,
    description: draft.description,
    objective: draft.objective,
    instructions: draft.instructions.slice(0, 500),
    modelId: draft.modelId,
    skillNames: JSON.parse(draft.skillNamesJson) as string[],
    avatarColorToken: draft.avatarColorToken,
    pendingCapabilities: [],
  };
  return { type: "bot-review", version: 1, draftId: draft.id, revision: draft.revision, snapshot };
}
