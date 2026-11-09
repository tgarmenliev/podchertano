/** Дума от страницата. Координатите са в пиксели на обработената снимка. */
export type ScanWord = {
  i: number;
  t: string;
  x: number;
  y: number;
  w: number;
  h: number;
  line: number;
  para: number;
  conf: number;
  /** оценка 0..1, че под думата има линия с молив */
  score: number;
  /** автоматично отбелязана като подчертана */
  auto: boolean;
  /** избрана от ученика (крайният избор) */
  sel: boolean;
};

export type ScanResult = {
  words: ScanWord[];
  width: number;
  height: number;
  /** компресирана снимка за съхранение */
  image: Blob;
  /** по-едра снимка за четене с AI (само ако е включено) */
  aiImage: Blob;
  ocrMs: number;
};
