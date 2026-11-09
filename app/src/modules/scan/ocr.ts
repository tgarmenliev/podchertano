"use client";

import type { Worker as TWorker } from "tesseract.js";
import { AUTO_THRESHOLD, buildLines, mergePasses, rawFromTesseract, toGray, withUnderlines, type RawWord } from "./layout";
import type { TraceContext } from "./underline";
import { recoverMissing } from "./recover";
import { loadForScan, storedCopy } from "./image";
import type { ScanResult } from "./types";

/*
  Разчитане на страницата в самия браузър (tesseract.js, файловете са наши, в /ocr).
  Снимката не напуска телефона за тази стъпка. Не се викат платени услуги.
*/
let workerPromise: Promise<TWorker> | null = null;
let onProgress: ((p: number) => void) | null = null;

async function getWorker() {
  workerPromise ??= (async () => {
    const { createWorker } = await import("tesseract.js");
    const w = await createWorker("eng", 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr",
      langPath: "/ocr/lang",
      gzip: true,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") onProgress?.(m.progress);
      },
    });
    await w.setParameters({ tessedit_pageseg_mode: "4" as never });
    return w;
  })();
  return workerPromise;
}

export type Step = "prepare" | "load" | "read" | "underline" | "recover";

/** Режими на сегментиране, които пускаме и обединяваме (изпитани на реални снимки: ~97% от текста). */
export const PASSES = ["4", "6", "3"] as const;

export async function scanPage(file: File, on: (step: Step, progress?: number, pass?: number) => void): Promise<ScanResult> {
  on("prepare");
  const img = await loadForScan(file);
  on("load");
  const worker = await getWorker();
  const t0 = performance.now();
  const passes = [];
  for (let k = 0; k < PASSES.length; k++) {
    await worker.setParameters({ tessedit_pageseg_mode: PASSES[k] as never });
    on("read", k / PASSES.length, k + 1);
    onProgress = (p) => on("read", (k + p) / PASSES.length, k + 1);
    try {
      const { data } = await worker.recognize(img.canvas, {}, { blocks: true });
      passes.push(rawFromTesseract(data as never));
    } finally {
      onProgress = null;
    }
  }
  const ocrMs = Math.round(performance.now() - t0);
  on("underline");
  // оставя място за рисуване на екрана преди тежкото изчисление
  await new Promise((r) => setTimeout(r, 0));
  const gray = toGray(img.rgba, img.width, img.height);
  let ctx: TraceContext | null = null;
  let words = withUnderlines(gray, img.width, img.height, buildLines(mergePasses(passes)), (c) => (ctx = c));
  // подчертани думи, които OCR е пропуснал или прочел частично: четем участъка над молива отново
  if (ctx) {
    on("recover");
    await new Promise((r) => setTimeout(r, 0));
    await worker.setParameters({ tessedit_pageseg_mode: "7" as never });
    const recognize = async (b: { x0: number; y0: number; x1: number; y1: number }): Promise<RawWord[]> => {
      const K = 3; // увеличение на участъка: малките букви се четат по-добре
      const w = b.x1 - b.x0;
      const h = b.y1 - b.y0;
      const c = document.createElement("canvas");
      c.width = (w + 20) * K;
      c.height = (h + 18) * K;
      const cx = c.getContext("2d")!;
      cx.fillStyle = "#dcdcdc";
      cx.fillRect(0, 0, c.width, c.height);
      cx.imageSmoothingEnabled = true;
      cx.imageSmoothingQuality = "high";
      cx.drawImage(img.canvas, b.x0, b.y0, w, h, 10 * K, 8 * K, w * K, h * K);
      const { data } = await worker.recognize(c, {}, { blocks: true });
      return rawFromTesseract(data as never).map((r) => ({ ...r, x: b.x0 - 10 + r.x / K, y: b.y0 - 8 + r.y / K, w: r.w / K, h: r.h / K }));
    };
    try {
      words = (await recoverMissing(words, ctx, recognize)).words;
    } catch {
      // възстановяването е бонус: при грешка продължаваме с вече намереното
    }
  }
  const image = await storedCopy(img.canvas);
  return { words, width: img.width, height: img.height, image, ocrMs };
}

export { AUTO_THRESHOLD };
