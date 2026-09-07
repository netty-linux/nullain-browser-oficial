"use client";

// Compressão de imagens anexadas no composer, antes de entrarem no histórico.
//
// Motivo: o histórico de mensagens viaja COMPLETO a cada envio e imagens em
// data URL base64 inflam o payload ~37%. Com screenshots grandes (FF14 1-3 MB),
// algumas mensagens bastam para estourar a leitura do body no servidor. O
// servidor agora poda imagens antigas, mas comprimir na ORIGEM reduz o peso
// da imagem atual também (que viaja sempre).
//
// Estratégia: decode via createImageBitmap + canvas, resize pra caber em
// MAX_DIMENSION e re-encode em WebP quality JPEG_QUALITY (fallback JPEG se o
// browser não codificar WebP). PNG original como último recurso (função
// retorna o File original se a compressão não compensar).

const MAX_DIMENSION = 1600;
const ENCODE_QUALITY = 0.82;
const MIN_BYTES_TO_COMPRESS = 120 * 1024; // < 120 KB: não vale o re-encode

export async function compressImageFile(file: File): Promise<File> {
  // Só imagens raster; GIF animado não vale a pena (perde animação)
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (file.size <= MIN_BYTES_TO_COMPRESS) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    // WebP primeiro (melhor compressão); fallback JPEG (universal)
    let blob = await canvasToBlob(canvas, "image/webp", ENCODE_QUALITY);
    let mime = "image/webp";
    if (!blob || blob.size >= file.size) {
      blob = await canvasToBlob(canvas, "image/jpeg", ENCODE_QUALITY);
      mime = "image/jpeg";
    }
    if (!blob || blob.size >= file.size) return file; // compressão não compensou

    const name = file.name.replace(/\.[^.]+$/, "") + (mime === "image/webp" ? ".webp" : ".jpg");
    return new File([blob], name, { type: mime, lastModified: Date.now() });
  } catch {
    // decode falhou (formato exótico etc.) — usa o original
    return file;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}
