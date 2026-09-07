export const DEFAULT_CHAT_MODEL = "ollama-cloud/gpt-oss:20b";
export const DEFAULT_VISION_CHAT_MODEL = "ollama-cloud/glm-5.3-flash";

export const CHAT_MODEL_IDS = [
  "ollama-cloud/gpt-oss:20b",
  "ollama-cloud/deepseek-v4-flash:0731",
  "ollama-cloud/deepseek-v4-pro:0813",
  "ollama-cloud/kimi-k3",
  "ollama-cloud/kimi-k2.7-code",
  "ollama-cloud/kimi-k2.6",
  "ollama-cloud/glm-5.3",
  "ollama-cloud/glm-5.2",
  "ollama-cloud/glm-5.1",
  "ollama-cloud/glm-5.3-flash",
  "ollama-cloud/qwen3.5",
  "ollama-cloud/gemma4",
  "ollama-cloud/minimax-m3",
  "ollama-cloud/minimax-m2.7",
  "ollama-cloud/nemotron-3-ultra",
  "ollama-cloud/nemotron-3-nano:30b",
  "ollama-cloud/mistral-large-3:675b",
] as const;

export const VISION_CHAT_MODEL_IDS = [
  "ollama-cloud/glm-5.3-flash",
  "ollama-cloud/gemma4",
  "ollama-cloud/minimax-m3",
  "ollama-cloud/kimi-k2.7-code",
  "ollama-cloud/kimi-k2.6",
  "ollama-cloud/kimi-k3",
  "ollama-cloud/qwen3.5",
  "ollama-cloud/mistral-large-3:675b",
] as const;

export const SUPPORTED_IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const SUPPORTED_IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

const VISION_MODEL_SET = new Set<string>(VISION_CHAT_MODEL_IDS);
const SUPPORTED_IMAGE_MEDIA_TYPE_SET = new Set<string>(SUPPORTED_IMAGE_MEDIA_TYPES);

export function isVisionChatModel(model: string): boolean {
  return VISION_MODEL_SET.has(model);
}

export function isSupportedImageMediaType(mediaType: unknown): boolean {
  if (typeof mediaType !== "string") return false;
  return SUPPORTED_IMAGE_MEDIA_TYPE_SET.has(mediaType.split(";", 1)[0]!.trim().toLowerCase());
}

export function resolveSupportedImageMediaType(file: {
  name: string;
  type: string;
}): string | null {
  const declaredType = file.type.split(";", 1)[0]!.trim().toLowerCase();
  if (isSupportedImageMediaType(declaredType)) return declaredType;

  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return null;
}
