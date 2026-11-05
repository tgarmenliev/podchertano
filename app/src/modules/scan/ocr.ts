"use client";

import type { Worker as TWorker } from "tesseract.js";
import { AUTO_THRESHOLD, buildLines, mergePasses, rawFromTesseract, toGray, withUnderlines } from "./layout";
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

export type Step = "prepare" | "load" | "read" | "underline";

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
  const words = withUnderlines(gray, img.width, img.height, buildLines(mergePasses(passes)));
  const image = await storedCopy(img.canvas);
  return { words, width: img.width, height: img.height, image, ocrMs };
}

export { AUTO_THRESHOLD };
