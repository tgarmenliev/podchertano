/*
  Кои думи да влязат в „Твоят текст“. Чиста логика (без база), за да се тества.
  Идея: най-полезни са думите, които още не са научени, срещат се на няколко страници на помагалото,
  били са грешени или са слабо познати. Не влизат твърде лесните (be, any, upon), боклукът от сканиране
  (две думи през запетая) и думите, които вече са здраво усвоени.
*/
export type Candidate = {
  itemId: string;
  /** дума или израз, както се пише в речника */
  target: string;
  pos: string;
  translationBg: string;
  /** състояние на картата: 0 нова, 1 учене, 2 преговор, 3 наново */
  state: number;
  stability: number;
  lapses: number;
  /** на колко различни страници е срещната */
  pages: number;
  suspended: boolean;
  /** вече е била в текст през последните дни (да не се повтаря веднага) */
  recentlyRead?: boolean;
};

/** Най-основните думи: учат се в първите години. Не си струва да се „преподават“ чрез текст. */
const BASIC = new Set(
  `a an the and or but if so as of to in on at by for with from up out off over under into onto about after before between through during without within
  be am is are was were been being have has had do does did done will would shall should can could may might must not no yes nor any some all each every
  both either neither other another such than then there here when where while which who whom whose what why how this that these those i me my we us our you your
  he him his she her it its they them their one two three four first second also too very much many more most few less least own same only just even still
  again already ever never always often upon among against along around across behind beside beyond near off per via get got go went gone make made say said`
    .split(/\s+/)
    .filter(Boolean),
);

export const isBasic = (target: string) => {
  const words = target.toLowerCase().split(/\s+/);
  return words.length === 1 && BASIC.has(words[0]);
};

/** Подходящ ли е записът за текст: не е боклук от сканиране и не е прекалено дълъг. */
export function isUsable(c: Candidate): boolean {
  if (c.suspended) return false;
  const t = c.target.trim();
  if (!t || /[,;:()]/.test(t)) return false; // „gaunt, stringy“
  if (t.split(/\s+/).length > 3) return false;
  if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(t)) return false;
  if (isBasic(t)) return false;
  // здраво усвоена дума (стабилност над 21 дни) не се пита пак
  if (c.state === 2 && c.stability >= 21) return false;
  return true;
}

/** Малко „шум“ по ден, за да не излизат всеки ден същите думи при равни оценки. Стабилен за един и същ ден. */
export function jitter(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000; // 0..1
}

export type Options = {
  /** колко думи искаме най-много (по подразбиране 10) */
  n?: number;
  /** на колко е допустимо най-малко (по-малко: няма достатъчно за текст) */
  min?: number;
  /** ключ за „шума“, напр. датата */
  seed?: string;
  /** честота на думата: 10 най-чести ... 70 най-редки; undefined, ако не е известна */
  tierOf?: (word: string) => number | undefined;
};

export function score(c: Candidate, o: Pick<Options, "seed" | "tierOf"> = {}): number {
  let s = 0;
  if (c.state === 1 || c.state === 3) s += 2; // вече я учи, но не я знае
  else if (c.state === 0) s += 1;
  else s += c.stability < 7 ? 1.5 : 0.5;
  s += Math.min(3, Math.max(0, c.pages - 1) * 1.5); // среща се в няколко текста
  s += Math.min(3, c.lapses); // греши я
  const t = o.tierOf?.(c.target.toLowerCase().split(/\s+/)[0]);
  if (t !== undefined) {
    if (t >= 60) s -= 3; // много рядка (iguanodon)
    else if (t >= 50) s -= 1;
  } else if (!/\s/.test(c.target)) s -= 1; // не е в речника: вероятно име или грешка при четене
  if (c.recentlyRead) s -= 3; // тази дума вече беше в текст преди малко: даваме шанс на други
  s += jitter(`${o.seed ?? ""}|${c.itemId}`) * 0.8;
  return s;
}

/**
 * Избира думите за текст. Не повече от 4 от една част на речта, до 3 израза и до 2 много редки думи.
 * Връща по-малко от n, ако няма достатъчно; null, ако са по-малко от min.
 */
export function pickReadingWords(cands: Candidate[], o: Options = {}): Candidate[] | null {
  const n = o.n ?? 10;
  const min = o.min ?? 5;
  const ranked = cands
    .filter(isUsable)
    .map((c) => ({ c, s: score(c, o) }))
    .sort((a, b) => b.s - a.s || a.c.itemId.localeCompare(b.c.itemId));

  const out: Candidate[] = [];
  const pos = new Map<string, number>();
  let phrases = 0;
  let rare = 0;
  const seen = new Set<string>();
  const take = (c: Candidate, strict: boolean) => {
    const key = c.target.toLowerCase();
    if (seen.has(key)) return false;
    const multi = /\s/.test(c.target);
    const isRare = (o.tierOf?.(key.split(/\s+/)[0]) ?? 0) >= 50;
    if (strict) {
      if ((pos.get(c.pos) ?? 0) >= 4) return false;
      if (multi && phrases >= 3) return false;
      if (isRare && rare >= 2) return false;
    }
    seen.add(key);
    pos.set(c.pos, (pos.get(c.pos) ?? 0) + 1);
    if (multi) phrases++;
    if (isRare) rare++;
    out.push(c);
    return true;
  };
  for (const { c } of ranked) if (out.length < n) take(c, true);
  // ако ограниченията са оставили места, допълваме с най-добрите останали
  for (const { c } of ranked) if (out.length < Math.min(n, min + 2)) take(c, false);
  return out.length >= min ? out : null;
}
