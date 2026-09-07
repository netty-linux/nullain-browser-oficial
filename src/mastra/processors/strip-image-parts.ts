import type { InputProcessor } from "@mastra/core/processors";
import { pruneMessageHistory } from "@/lib/server/chat-message-history";

export const VISION_INPUT_CONTEXT_KEY = "nullain:vision-input";

/**
 * Remove imagens históricas antes do request ao modelo. Quando a rota confirma
 * que o turno atual usa um modelo multimodal, somente a imagem da mensagem
 * atual é preservada.
 *
 * Por que existe: o kernel tem memória persistente (Memory + LibSQL em
 * mastra.db, lastMessages: 20). Se o usuário anexou uma imagem em alguma
 * conversa, ela fica salva no histórico persistido. Quando o kernel carrega
 * as últimas 20 mensagens da thread via Memory, a imagem vai junto e o
 * um modelo somente de texto lança:
 *   "this model does not support image input (ref: uuid)"
 *
 * O pruneMessageHistory do route.ts só poda as mensagens que vêm no body do
 * cliente — NÃO as que o kernel puxa da memória persistida. Este processor
 * fecha essa lacuna: roda a cada step do loop, antes do request ao modelo, e
 * remove os binários antigos sem tocar na entrada visual autorizada do turno.
 *
 * A transformação é transiente: a imagem original permanece na memória, mas
 * não volta a ser enviada em todos os turnos seguintes.
 */
export const stripImagePartsProcessor: InputProcessor = {
  id: "strip-image-parts",
  name: "Strip Image Parts",
  description: "Preserve the current visual input for vision models and strip historical images.",
  processInputStep: ({ messages, requestContext }) => {
    const keepLatestUserImages = requestContext?.getRaw(VISION_INPUT_CONTEXT_KEY) === true;
    const result = pruneMessageHistory(messages, { keepLatestUserImages });
    if (result.stats.droppedImageParts > 0) {
      console.info(
        `[strip-image-parts] imagens históricas removidas=${result.stats.droppedImageParts}, visão atual=${keepLatestUserImages ? "preservada" : "desativada"}`,
      );
    }
    return { messages: result.messages as typeof messages };
  },
};
