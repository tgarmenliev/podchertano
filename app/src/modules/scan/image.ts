"use client";

/** Зарежда снимка от iPhone (HEIC/JPEG), изправя ориентацията и я смалява за обработка. */
export const WORK_LONG_SIDE = 1800;
export const STORE_LONG_SIDE = 1400;

export class ImageError extends Error {}

export async function loadForScan(file: File) {
  if (file.size > 40 * 1024 * 1024) throw new ImageError("Снимката е твърде голяма.");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("Този формат не се отваря тук. На iPhone снимай директно от камерата.");
  }
  const scale = Math.min(1, WORK_LONG_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  // Смаляване на стъпки (по ½), за да няма назъбване: тънкият молив и дребният шрифт се губят при рязко смаляване.
  let src: CanvasImageSource = bmp;
  let sw = bmp.width;
  let sh = bmp.height;
  while (sw / 2 >= width && sh / 2 >= height) {
    const step = document.createElement("canvas");
    step.width = Math.max(width, Math.round(sw / 2));
    step.height = Math.max(height, Math.round(sh / 2));
    const sctx = step.getContext("2d")!;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(src, 0, 0, step.width, step.height);
    src = step;
    sw = step.width;
    sh = step.height;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, width, height);
  bmp.close();
  const rgba = ctx.getImageData(0, 0, width, height).data;
  return { canvas, width, height, rgba };
}

/** Компресирано копие за съхранение (по-малко от работното). */
export async function storedCopy(canvas: HTMLCanvasElement): Promise<Blob> {
  const scale = Math.min(1, STORE_LONG_SIDE / Math.max(canvas.width, canvas.height));
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((res) => out.toBlob(res, "image/jpeg", 0.82));
  if (!blob) throw new ImageError("Не успях да компресирам снимката.");
  return blob;
}

/** Снимка за четене с AI: по-едра от запазваната, но малка за изпращане (обикновено под 1 MB). */
export async function aiCopy(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!blob) throw new ImageError("Не успях да подготвя снимката.");
  return blob;
}
