"use client";

import type { Worker as TWorker } from "tesseract.js";
import { AUTO_THRESHOLD, toGray, withUnderlines, wordsFromTesseract } from "./layout";
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

export async function scanPage(file: File, on: (step: Step, progress?: number) => void): Promise<ScanResult> {
  on("prepare");
  const img = await loadForScan(file);
  on("load");
  const worker = await getWorker();
  on("read", 0);
  onProgress = (p) => on("read", p);
  const t0 = performance.now();
  let data;
  try {
    ({ data } = await worker.recognize(img.canvas, {}, { blocks: true }));
  } finally {
    onProgress = null;
  }
  const ocrMs = Math.round(performance.now() - t0);
  on("underline");
  // оставя място за рисуване на екрана преди тежкото изчисление
  await new Promise((r) => setTimeout(r, 0));
  const gray = toGray(img.rgba, img.width, img.height);
  const words = withUnderlines(gray, img.width, img.height, wordsFromTesseract(data as never));
  const image = await storedCopy(img.canvas);
  return { words, width: img.width, height: img.height, image, ocrMs };
}

export { AUTO_THRESHOLD };
