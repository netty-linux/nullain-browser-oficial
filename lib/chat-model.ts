"use client";

// Fonte única de verdade para o modelo/esforço/web search selecionados no chat.
// O ComposerAction (seletor) grava aqui; o transport (assistant.tsx) lê na
// hora de enviar cada mensagem, via prepareSendMessagesRequest.

import { CHAT_MODEL_IDS, DEFAULT_CHAT_MODEL } from "@/lib/model-catalog";

export { CHAT_MODEL_IDS, DEFAULT_CHAT_MODEL } from "@/lib/model-catalog";

const MODEL_KEY = "nullain-model";
const EFFORT_KEY = "nullain-effort";
const COMPUTER_KEY = "nullain-computer";

export function loadModel(): string {
  try {
    const saved = localStorage.getItem(MODEL_KEY);
    if (saved && (CHAT_MODEL_IDS as readonly string[]).includes(saved)) return saved;
  } catch {
    // localStorage indisponível (private mode etc.) — usa o default
  }
  return DEFAULT_CHAT_MODEL;
}

export function saveModel(model: string): void {
  try {
    localStorage.setItem(MODEL_KEY, model);
  } catch {
    // sem persistência — a escolha vale só para a sessão
  }
}

export function loadEffort(): string | undefined {
  try {
    return localStorage.getItem(EFFORT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveEffort(effort: string | undefined): void {
  try {
    if (effort) localStorage.setItem(EFFORT_KEY, effort);
    else localStorage.removeItem(EFFORT_KEY);
  } catch {
    // sem persistência
  }
}

export function loadComputer(): boolean {
  try {
    return localStorage.getItem(COMPUTER_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveComputer(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(COMPUTER_KEY, "1");
    else localStorage.removeItem(COMPUTER_KEY);
  } catch {
    // sem persistência
  }
}

// --- Integrações Composio (MCP) ---

const INTEGRATIONS_KEY = "nullain-integrations";

/** Toggle Plug (Integrações Composio) ativo. Default: desligado. */
export function loadIntegrations(): boolean {
  try {
    return localStorage.getItem(INTEGRATIONS_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveIntegrations(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(INTEGRATIONS_KEY, "1");
    else localStorage.removeItem(INTEGRATIONS_KEY);
  } catch {
    // sem persistência
  }
}

// --- Skills ---

const SKILLS_KEY = "nullain-skills-disabled";
const SKILLS_SEEN_KEY = "nullain-skills-seen";

/** Skills desativadas pelo usuário (nomes). Default: todas ativas. */
export function loadDisabledSkills(): string[] {
  try {
    const raw = localStorage.getItem(SKILLS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveDisabledSkills(disabled: string[]): void {
  try {
    if (disabled.length) localStorage.setItem(SKILLS_KEY, JSON.stringify(disabled));
    else localStorage.removeItem(SKILLS_KEY);
  } catch {
    // sem persistência
  }
}

export function filterEnabledSkills<T extends { name: string }>(
  skills: readonly T[],
  disabled: readonly string[],
): T[] {
  const disabledNames = new Set(disabled.map((name) => name.toLowerCase()));
  return skills.filter((skill) => !disabledNames.has(skill.name.toLowerCase()));
}

export function applySkillCatalogDefaults(
  skills: readonly { name: string; source?: "native" | "user"; user?: boolean }[],
): string[] {
  const disabled = new Set(loadDisabledSkills());
  let seen = new Set<string>();
  try {
    const parsed = JSON.parse(localStorage.getItem(SKILLS_SEEN_KEY) ?? "[]") as unknown;
    if (Array.isArray(parsed))
      seen = new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {}
  for (const skill of skills) {
    const isUser = skill.source === "user" || skill.user === true;
    if (isUser && !seen.has(skill.name)) disabled.add(skill.name);
    seen.add(skill.name);
  }
  const result = [...disabled];
  saveDisabledSkills(result);
  try {
    localStorage.setItem(SKILLS_SEEN_KEY, JSON.stringify([...seen]));
  } catch {}
  return result;
}

export function markNewSkillDisabled(name: string): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(SKILLS_SEEN_KEY) ?? "[]") as unknown;
    const seen = new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [],
    );
    // O resultado de create_skill permanece no histórico e seu renderer
    // remonta ao voltar ao chat. O default vale só na primeira aparição;
    // reaplicá-lo aqui desativaria silenciosamente uma skill já habilitada.
    if (seen.has(name)) return;
    saveDisabledSkills([...new Set([...loadDisabledSkills(), name])]);
    seen.add(name);
    localStorage.setItem(SKILLS_SEEN_KEY, JSON.stringify([...seen]));
  } catch {}
  window.dispatchEvent(new CustomEvent("nullain-skills-changed", { detail: { name } }));
}

export function forgetSkillPreference(name: string): void {
  saveDisabledSkills(loadDisabledSkills().filter((item) => item !== name));
  try {
    const parsed = JSON.parse(localStorage.getItem(SKILLS_SEEN_KEY) ?? "[]") as unknown;
    const seen = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item !== name)
      : [];
    localStorage.setItem(SKILLS_SEEN_KEY, JSON.stringify(seen));
  } catch {}
}

// --- Geração de imagem/vídeo (WaveSpeed) ---

const GENERATION_KEY = "nullain-generation";
const GENERATION_MODE_KEY = "nullain-generation-mode";

export type GenerationMode = "image" | "video";

/** Toggle Geração (imagem/vídeo via WaveSpeed) ativo. Default: desligado. */
export function loadGeneration(): boolean {
  try {
    return localStorage.getItem(GENERATION_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveGeneration(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(GENERATION_KEY, "1");
    else localStorage.removeItem(GENERATION_KEY);
  } catch {
    // sem persistência
  }
}

/** Modo de geração selecionado no toggle (imagem ou vídeo). Default: imagem. */
export function loadGenerationMode(): GenerationMode {
  try {
    return localStorage.getItem(GENERATION_MODE_KEY) === "video" ? "video" : "image";
  } catch {
    return "image";
  }
}

export function saveGenerationMode(mode: GenerationMode): void {
  try {
    localStorage.setItem(GENERATION_MODE_KEY, mode);
  } catch {
    // sem persistência
  }
}
