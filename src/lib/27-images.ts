// Procesado de imagen en cliente: HEIC -> JPEG, correccion EXIF de
// orientacion, y dos salidas JPEG (display ~2000px, thumb ~400px).

export interface ProcessedImage {
  display: Blob;
  thumb: Blob;
  width: number; // dimensiones reales del display
  height: number;
}

const DISPLAY_LONG_SIDE = 2000;
const THUMB_LONG_SIDE = 400;
const DISPLAY_QUALITY = 0.88;
const THUMB_QUALITY = 0.85;

export function isHeic(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  return /\.hei[cf]$/i.test(file.name || "");
}

async function decodeOriented(blob: Blob): Promise<ImageBitmap> {
  // imageOrientation: 'from-image' aplica el EXIF de orientacion al decodificar.
  // Si el navegador no acepta la opcion, decodificamos sin ella.
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(blob);
  }
}

function renderJpeg(bmp: ImageBitmap, longSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const w = bmp.width;
  const h = bmp.height;
  const scale = Math.min(1, longSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas 2D no disponible"));
  ctx.drawImage(bmp, 0, 0, cw, ch);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve({ blob, width: cw, height: ch });
        else reject(new Error("No se pudo codificar la imagen"));
      },
      "image/jpeg",
      quality,
    );
  });
}

export async function processImageFile(file: File): Promise<ProcessedImage> {
  let src: Blob = file;
  if (isHeic(file)) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    src = Array.isArray(converted) ? converted[0] : converted;
  }
  const bmp = await decodeOriented(src);
  try {
    const display = await renderJpeg(bmp, DISPLAY_LONG_SIDE, DISPLAY_QUALITY);
    const thumb = await renderJpeg(bmp, THUMB_LONG_SIDE, THUMB_QUALITY);
    return { display: display.blob, thumb: thumb.blob, width: display.width, height: display.height };
  } finally {
    bmp.close?.();
  }
}

// Vista previa de trabajo para el editor de alineacion.
export async function previewUrl(blob: Blob): Promise<string> {
  const bmp = await decodeOriented(blob);
  const { blob: jpg } = await renderJpeg(bmp, 1600, 0.85);
  bmp.close?.();
  return URL.createObjectURL(jpg);
}
