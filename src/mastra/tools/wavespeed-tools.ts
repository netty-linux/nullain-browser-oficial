import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Tools WaveSpeed da Nullain — geração de IMAGEM (Flux 2 Klein 4B) e VÍDEO
 * (Wan 2.2 i2v-480p ultra-fast) via API assíncrona da WaveSpeed.
 *
 * Fluxo da API: submit uma prediction (POST) → recebe data.id → poll o
 * result URL (GET) até status "completed" → outputs (URLs do CDN).
 *
 * Requer WAVESPEED_API_KEY no .env.local. Sem a key, os tools retornam erro
 * claro orientando a configurar (não quebram o chat).
 */

const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY ?? "";
const BASE = "https://api.wavespeed.ai/api/v3";
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 120_000; // 2 min — geração de vídeo pode demorar

const FLUX_ENDPOINT = `${BASE}/wavespeed-ai/flux-2-klein-4b/text-to-image`;
const WAN_ENDPOINT = `${BASE}/wavespeed-ai/wan-2.2/i2v-480p-ultra-fast`;
const RESULT_URL = (id: string) => `${BASE}/predictions/${id}/result`;

function hasKey(): boolean {
  return WAVESPEED_API_KEY.length > 0;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${WAVESPEED_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function submitPrediction(endpoint: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WaveSpeed submit ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { data?: { id?: string } };
  const id = data?.data?.id;
  if (!id) throw new Error("WaveSpeed: resposta de submit sem data.id");
  return id;
}

async function pollResult(
  id: string,
): Promise<{ status: string; outputs: unknown[]; error?: string }> {
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    const res = await fetch(RESULT_URL(id), { headers: authHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`WaveSpeed poll ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      data?: { status?: string; outputs?: unknown[]; error?: string };
    };
    const d = data?.data;
    const status = d?.status ?? "processing";
    if (status === "completed") {
      return { status, outputs: d?.outputs ?? [] };
    }
    if (["failed", "cancelled", "timeout", "deleted"].includes(status)) {
      return { status, outputs: [], error: d?.error ?? `status ${status}` };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { status: "timeout", outputs: [], error: "tempo de espera excedido (2 min)" };
}

/** Normaliza outputs (URLs ou objetos) para uma lista de strings legíveis. */
function stringifyOutputs(outputs: unknown[]): string[] {
  return outputs.map((o) => {
    if (typeof o === "string") return o;
    try {
      return JSON.stringify(o);
    } catch {
      return String(o);
    }
  });
}

export const generateImageTool = createTool({
  id: "generate_image",
  description:
    "Generate an image from a text prompt using WaveSpeed Flux 2 Klein 4B (text-to-image). Use when the user asks to create/generate an image, picture, illustration, or visual from a description. Returns the URL(s) of the generated image(s).",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(1)
      .describe("Detailed description of the image to generate (in the user's language)."),
    size: z.string().optional().describe("Output size as 'WIDTH*HEIGHT' (default '1024*1024')."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    urls: z.array(z.string()).optional(),
    error: z.string().optional(),
  }),
  execute: async (input) => {
    if (!hasKey()) {
      return {
        ok: false,
        error:
          "WAVESPEED_API_KEY não configurada. Adicione a key no .env.local (https://wavespeed.ai) e reinicie o dev server.",
      } as never;
    }
    try {
      const id = await submitPrediction(FLUX_ENDPOINT, {
        prompt: input.prompt,
        size: input.size ?? "1024*1024",
        seed: -1,
      });
      const result = await pollResult(id);
      if (result.status !== "completed") {
        return {
          ok: false,
          error: `Geração de imagem falhou: ${result.error ?? result.status}`,
        } as never;
      }
      return { ok: true, urls: stringifyOutputs(result.outputs) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) } as never;
    }
  },
});

function createGenerateVideoTool(attachedImageDataUrl: string | null) {
  return createTool({
    id: "generate_video",
    description:
      "Generate a video from an image using WaveSpeed Wan 2.2 i2v-480p ultra-fast (image-to-video). Use when the user asks to animate/make a video from an image. Requires an image URL (from a previous generate_image, an attached image, or a public URL). Returns the URL(s) of the generated video(s).",
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe("Positive prompt describing the motion/content of the video."),
      image: z
        .string()
        .optional()
        .describe(
          "URL of the source image to animate (public URL, or the URL from a previous generate_image). If omitted, the image attached in the composer is used automatically.",
        ),
      duration: z
        .number()
        .int()
        .min(5)
        .max(8)
        .optional()
        .describe("Video duration in seconds (5 or 8, default 5)."),
      negativePrompt: z.string().optional().describe("Negative prompt to avoid in the video."),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      urls: z.array(z.string()).optional(),
      error: z.string().optional(),
    }),
    execute: async (input) => {
      if (!hasKey()) {
        return {
          ok: false,
          error:
            "WAVESPEED_API_KEY não configurada. Adicione a key no .env.local (https://wavespeed.ai) e reinicie o dev server.",
        } as never;
      }
      try {
        // A imagem de origem pode vir de 3 lugares:
        // 1. O modelo passou `image` (URL de um generate_image anterior ou URL pública).
        // 2. O usuário anexou uma imagem no composer (data URL base64) — o route.ts
        //    repassa pela closure desta tool. Isso permite gerar vídeo mesmo com um
        //    modelo SEM visão computacional (o modelo não precisa "ver" a imagem).
        // 3. Nenhuma das duas → erro claro.
        const image = input.image ?? attachedImageDataUrl;
        if (!image) {
          return {
            ok: false,
            error:
              "Nenhuma imagem de origem fornecida. Anexe uma imagem no composer ou forneça a URL de uma imagem (ex.: de uma geração anterior) para animar.",
          } as never;
        }
        const body: Record<string, unknown> = {
          prompt: input.prompt,
          image,
          duration: input.duration ?? 5,
          seed: -1,
        };
        if (input.negativePrompt) body.negative_prompt = input.negativePrompt;
        const id = await submitPrediction(WAN_ENDPOINT, body);
        const result = await pollResult(id);
        if (result.status !== "completed") {
          return {
            ok: false,
            error: `Geração de vídeo falhou: ${result.error ?? result.status}`,
          } as never;
        }
        return { ok: true, urls: stringifyOutputs(result.outputs) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) } as never;
      }
    },
  });
}

/** Constrói tools isoladas para uma única requisição. */
export function createWaveSpeedToolset(attachedImageDataUrl: string | null = null) {
  return {
    wavespeed: {
      generate_image: generateImageTool,
      generate_video: createGenerateVideoTool(attachedImageDataUrl),
    },
  } as const;
}
