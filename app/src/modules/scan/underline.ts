/*
  Откриване на подчертани с молив думи. Работи върху сива снимка и кутиите на думите от OCR.
  Безплатно: няма заявки към външни услуги. Портирано от bench/pipeline-b2.mjs (изпитано на реални снимки):
  - основна линия за всеки ред поотделно (перспектива, огъване)
  - печатът (тъмно) се маскира заедно със съседните пиксели, за да не се броят серифи и опашки
  - моливът е по-светъл от печата: търсим непрекъсната „следа“ в лента под думата,
    по-тъмна от нивото на хартията, измерено в същата лента.
*/
export type Box = { t: string; x: number; y: number; w: number; h: number; line: number };

export type Options = {
  bandStart: number;
  bandFrac: number;
  inkThr: number;
  darkThr: number;
  grow: number;
  delta: number;
  smooth: number;
};

export const DEFAULTS: Options = { bandStart: 3, bandFrac: 0.55, inkThr: 0.88, darkThr: 0.55, grow: 2, delta: 0.1, smooth: 1 };

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Размазване с кутия (3 прохода ≈ гаусово), отделимо по хоризонтала и вертикала. */
function blur(src: Uint8Array, W: number, H: number, radius: number): Uint8Array {
  if (radius <= 0) return src;
  const r = Math.max(1, Math.round(radius));
  let a: Float32Array = Float32Array.from(src);
  let b = new Float32Array(a.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[row + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        b[row + x] = sum / (2 * r + 1);
        sum += a[row + Math.min(W - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += b[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        a[y * W + x] = sum / (2 * r + 1);
        sum += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x];
      }
    }
  }
  const out = new Uint8Array(src.length);
  for (let i = 0; i < out.length; i++) out[i] = a[i] + 0.5;
  return out;
}

/** Ниво на хартията: блокови средни, максимален филтър, размазване; четене с билинейна интерполация. */
function paperLevel(g: Uint8Array, W: number, H: number) {
  const S = 8;
  const sw = Math.ceil(W / S);
  const sh = Math.ceil(H / S);
  const small = new Float32Array(sw * sh);
  for (let by = 0; by < sh; by++)
    for (let bx = 0; bx < sw; bx++) {
      let sum = 0;
      let n = 0;
      for (let y = by * S; y < Math.min(H, by * S + S); y++)
        for (let x = bx * S; x < Math.min(W, bx * S + S); x++) {
          sum += g[y * W + x];
          n++;
        }
      small[by * sw + bx] = sum / n;
    }
  const R = 4;
  const mx = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      let m = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= sh) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= sw) continue;
          const v = small[yy * sw + xx];
          if (v > m) m = v;
        }
      }
      mx[y * sw + x] = m;
    }
  // леко размазване 3×3, два пъти
  let cur = mx;
  for (let k = 0; k < 2; k++) {
    const nxt = new Float32Array(cur.length);
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy < 0 || yy >= sh || xx < 0 || xx >= sw) continue;
            s += cur[yy * sw + xx];
            n++;
          }
        nxt[y * sw + x] = s / n;
      }
    cur = nxt;
  }
  return (x: number, y: number) => {
    const fx = Math.min(sw - 1, Math.max(0, x / S - 0.5));
    const fy = Math.min(sh - 1, Math.max(0, y / S - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(sw - 1, x0 + 1);
    const y1 = Math.min(sh - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const top = cur[y0 * sw + x0] * (1 - tx) + cur[y0 * sw + x1] * tx;
    const bot = cur[y1 * sw + x0] * (1 - tx) + cur[y1 * sw + x1] * tx;
    return Math.max(1, top * (1 - ty) + bot * ty);
  };
}

function fitLine(pts: [number, number][]): [number, number] {
  const fit = (p: [number, number][]): [number, number] => {
    const n = p.length;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (const [x, y] of p) {
      sx += x;
      sy += y;
      sxx += x * x;
      sxy += x * y;
    }
    const d = n * sxx - sx * sx;
    const a = d ? (n * sxy - sx * sy) / d : 0;
    return [a, (sy - a * sx) / n];
  };
  let [a, b] = fit(pts);
  if (pts.length >= 5) {
    const res = pts.map(([x, y]) => Math.abs(y - (a * x + b)));
    const lim = Math.max(2, median(res) * 2.5);
    const keep = pts.filter((_, i) => res[i] <= lim);
    if (keep.length >= 3) [a, b] = fit(keep);
  }
  return [a, b];
}

export type ScoreDetail = { f: number[]; baseA?: number; baseB?: number; score: number; run: number; gap: number | null; gapCols: number; rows: number; chain: number };

/**
 * v3: за плътни страници с тъмен молив, залепен до текста (като в помагалото).
 * 1) основната линия на всеки ред се уточнява от профила на мастилото (не от кутиите на OCR);
 * 2) лента веднага под основната линия, БЕЗ маскиране на тъмното (моливът е тъмен и докосва буквите);
 * 3) оценката е дял на колоните със следа и най-дълга непрекъсната серия (опашки на g, y, p покриват малко).
 */
export function underlineDetail(gray: Uint8Array, W: number, H: number, words: Box[], opts: Partial<Options> & { chainFrac?: number; reach?: number; gapTol?: number; refine?: boolean } = {}): ScoreDetail[] {
  const P = { ...DEFAULTS, bandStart: 2, chainFrac: 0.42, reach: 2, gapTol: 1, ...opts };
  const g = blur(gray, W, H, P.smooth);
  const bg = paperLevel(g, W, H);
  const norm = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) norm[y * W + x] = g[y * W + x] / bg(x, y);

  const lines = new Map<number, Box[]>();
  for (const w of words) {
    if (!lines.has(w.line)) lines.set(w.line, []);
    lines.get(w.line)!.push(w);
  }
  const fits = new Map<number, [number, number]>();
  const slopes: number[] = [];
  for (const [k, ws] of lines) {
    const clean = ws.filter((w) => !/[gjpqy,;()|/]/.test(w.t) && w.h > 6);
    const use = clean.length >= 3 ? clean : ws.length >= 3 ? ws : null;
    if (use) {
      const [a, b] = fitLine(use.map((w) => [w.x + w.w / 2, w.y + w.h]));
      fits.set(k, [a, b]);
      if (use.length >= 4) slopes.push(a);
    }
  }
  const gSlope = median(slopes);
  for (const [k, ws] of lines) if (!fits.has(k)) fits.set(k, [gSlope, median(ws.map((w) => w.y + w.h - gSlope * (w.x + w.w / 2)))]);
  const mids = [...lines.keys()].map((k) => fits.get(k)![0] * (W / 2) + fits.get(k)![1]).sort((x, y) => x - y);
  const gaps: number[] = [];
  for (let i = 1; i < mids.length; i++) if (mids[i] - mids[i - 1] > 15 * (W / 1800)) gaps.push(mids[i] - mids[i - 1]);
  const pitch = median(gaps) || 45 * (W / 1800);
  const DARK = 0.62;

  /* 1) Основната линия на всеки ред се ПРОСЛЕДЯВА по цялата му дължина.
        Страниците са извити и под ъгъл. За всеки ред търсим (динамично програмиране) гладка крива, която
        във всяка колона лежи там, където мастилото на буквите спада най-рязко (долният ръб на текста).
        Така грешка на отделна дума или подчертаване, залепено за текста, не мести линията. */
  const dark = new Uint8Array(W * H);
  for (let i = 0; i < dark.length; i++) dark[i] = norm[i] < DARK ? 1 : 0;
  const integral = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let rowSum = 0;
    for (let x = 0; x < W; x++) {
      rowSum += dark[y * W + x];
      integral[(y + 1) * (W + 1) + (x + 1)] = integral[y * (W + 1) + (x + 1)] + rowSum;
    }
  }
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    if (x1 < x0 || y1 < y0) return 0;
    return integral[(y1 + 1) * (W + 1) + (x1 + 1)] - integral[y0 * (W + 1) + (x1 + 1)] - integral[(y1 + 1) * (W + 1) + x0] + integral[y0 * (W + 1) + x0];
  };
  const bottom = (o: Box) => o.y + o.h;
  const cx = (o: Box) => o.x + o.w / 2;
  const STEP = 2;
  const R = 7; // търсене ±7 px около очакваното
  const baseCurves = new Map<number, { x0: number; ys: Float32Array }>();
  for (const [k, ws] of lines) {
    const sorted = [...ws].sort((p, q) => p.x - q.x);
    const clean = sorted.filter((o) => !/[gjpqy,;()|/]/.test(o.t) && o.h > 6);
    const pts = (clean.length >= 2 ? clean : sorted).map((o) => [cx(o), bottom(o)] as [number, number]);
    const x0 = Math.max(0, Math.round(sorted[0].x));
    const x1 = Math.min(W - 1, Math.round(sorted[sorted.length - 1].x + sorted[sorted.length - 1].w));
    // очакваната основна линия: МЕДИАНА от дъната на съседните чисти думи (±300 px). Устойчива е на думи,
    // чиято кутия е стигнала до подчертаването и затова е „слязла“ по-ниско.
    const prior = (x: number) => {
      const near = pts.filter((p) => Math.abs(p[0] - x) < 300).map((p) => p[1] + gSlope * (x - p[0]));
      if (near.length >= 2) return median(near);
      const nearest = [...pts].sort((p, q) => Math.abs(p[0] - x) - Math.abs(q[0] - x))[0];
      return nearest[1] + gSlope * (x - nearest[0]);
    };
    const n = Math.floor((x1 - x0) / STEP) + 1;
    const S = R * 2 + 1;
    const score = new Float32Array(n * S);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * STEP;
      const c = prior(x);
      for (let d = -R; d <= R; d++) {
        const y = Math.round(c + d);
        const above = rect(x - 10, y - 5, x + 10, y);
        const below = rect(x - 10, y + 1, x + 10, y + 5);
        score[i * S + d + R] = above - below - 0.25 * d; // лек превес за по-горния спад: долният ръб на подчертаването не е основна линия
      }
    }
    // Витерби: най-добър гладък път (±1 px на стъпка, малка глоба за промяна)
    const dp = new Float32Array(n * S);
    const from = new Int8Array(n * S);
    for (let d = 0; d < S; d++) dp[d] = score[d];
    for (let i = 1; i < n; i++)
      for (let d = 0; d < S; d++) {
        let best = -1e9;
        let arg = 0;
        for (let q = -1; q <= 1; q++) {
          const pd = d + q;
          if (pd < 0 || pd >= S) continue;
          const v = dp[(i - 1) * S + pd] - (q ? 6 : 0);
          if (v > best) { best = v; arg = q; }
        }
        dp[i * S + d] = best + score[i * S + d];
        from[i * S + d] = arg;
      }
    let d = 0;
    let bv = -1e9;
    for (let q = 0; q < S; q++) if (dp[(n - 1) * S + q] > bv) { bv = dp[(n - 1) * S + q]; d = q; }
    const ys = new Float32Array(n);
    for (let i = n - 1; i >= 0; i--) {
      ys[i] = prior(x0 + i * STEP) + (d - R) + 0.5;
      d += from[i * S + d];
    }
    baseCurves.set(k, { x0, ys });
  }
  const baseAt = (line: number, x: number) => {
    const c = baseCurves.get(line);
    if (!c) return null;
    const f = (x - c.x0) / STEP;
    const i = Math.min(c.ys.length - 1, Math.max(0, Math.floor(f)));
    const j = Math.min(c.ys.length - 1, i + 1);
    const t = Math.min(1, Math.max(0, f - i));
    return c.ys[i] * (1 - t) + c.ys[j] * t;
  };
  const localBase = new Map<Box, [number, number]>();
  for (const w of words) {
    // локална права през кривата около думата (за стария код, който очаква y = a·x + b)
    const xa = w.x, xb = w.x + w.w;
    const y1 = baseAt(w.line, xa) ?? bottom(w) - gSlope * 0;
    const y2 = baseAt(w.line, xb) ?? y1;
    const a = (y2 - y1) / Math.max(1, xb - xa);
    localBase.set(w, [a, y1 - a * xa]);
  }

  return words.map((w) => {
    const [a, b] = localBase.get(w)!;
    const off = 0;
    const xa = Math.round(w.x) + 2;
    const xb = Math.round(w.x + w.w) - 2;
    const vals: number[] = [];
    const grid: number[][] = [];
    const wide: number[][] = []; // разширена лента (с номера на реда), за проследяване на вълнообразна линия
    const dyEnd = Math.max(P.bandStart + 4, P.bandFrac * pitch * 0.75);
    const dyWideEnd = Math.max(P.bandStart + 8, P.chainFrac * pitch);
    for (let x = xa; x <= xb; x++) {
      const col: number[] = [];
      const wcol: number[] = new Array(dyWideEnd - P.bandStart + 1 | 0).fill(1);
      if (x >= 0 && x < W) {
        const base = a * x + b + off;
        for (let dy = P.bandStart; dy <= dyWideEnd; dy++) {
          const y = Math.round(base + dy);
          if (y < 0 || y >= H) continue;
          const n = norm[y * W + x];
          wcol[dy - P.bandStart] = n;
          if (dy <= dyEnd) {
            col.push(n);
            vals.push(n);
          }
        }
      }
      grid.push(col);
      wide.push(wcol);
    }
    vals.sort((p, q) => p - q);
    const L = vals.length ? vals[Math.floor(vals.length * 0.8)] : 1;
    const thr = Math.min(P.inkThr, L - P.delta);
    // колони-„междини“: над основната линия няма печат (между буквите/думите); ако и под нея има следа, това е молив
    const gapCol: boolean[] = [];
    for (let x = xa; x <= xb; x++) {
      let letter = false;
      if (x >= 0 && x < W) {
        const base = a * x + b + off;
        for (let dy = -6; dy <= -1; dy++) {
          const y = Math.round(base + dy);
          if (y >= 0 && y < H && norm[y * W + x] < 0.7) {
            letter = true;
            break;
          }
        }
      }
      gapCol.push(!letter);
    }
    let cols = 0;
    let run = 0;
    let best = 0;
    let gapN = 0;
    let gapInk = 0;
    grid.forEach((col, k) => {
      const ink = col.some((n) => n < thr);
      if (gapCol[k]) {
        gapN++;
        if (ink) gapInk++;
      }
      if (ink) {
        cols++;
        run++;
        if (run > best) best = run;
      } else run = 0;
    });
    // верига: най-дългата свързана следа (преход до ±reach реда между съседни колони, дупки до gapTol колони)
    let chain = 0;
    let prev = new Int32Array(wide[0]?.length ?? 0);
    const gapAge = new Int32Array(prev.length);
    for (let k = 0; k < wide.length; k++) {
      const cur = new Int32Array(prev.length);
      for (let r = 0; r < cur.length; r++) {
        if (wide[k][r] >= thr) continue;
        let best2 = 0;
        for (let q = Math.max(0, r - P.reach); q <= Math.min(cur.length - 1, r + P.reach); q++) if (prev[q] > best2) best2 = prev[q];
        cur[r] = best2 + 1;
        if (cur[r] > chain) chain = cur[r];
      }
      // допускаме малка дупка (текстура на хартията): пренасяме предишните стойности, ако тази колона е празна
      let anyInk = false;
      for (let r = 0; r < cur.length; r++) if (cur[r]) { anyInk = true; break; }
      if (!anyInk && k > 0) {
        for (let r = 0; r < cur.length; r++) gapAge[r] = prev[r] > 0 ? gapAge[r] + 1 : 0;
        for (let r = 0; r < cur.length; r++) cur[r] = gapAge[r] <= P.gapTol && prev[r] > 0 ? prev[r] : 0;
      } else gapAge.fill(0);
      prev = cur;
    }
    const tot = grid.length || 1;
    return { f: [], baseA: a, baseB: b + off, score: cols / tot, run: best / tot, gap: gapN >= 3 ? gapInk / gapN : null, gapCols: gapN, rows: 0, chain: Math.min(1, chain / tot) };
  });
}

export function underlineScores(gray: Uint8Array, W: number, H: number, words: Box[], opts: Partial<Options> = {}): number[] {
  return underlineDetail(gray, W, H, words, opts).map((d) => d.score);
}


/** Брой признаци (вж. featuresFor). */
export const FEATURE_NAMES = ["cov0-2", "cov2-4", "cov4-6", "cov6-9", "cov9-12", "cov12-16", "chain3-16", "run3-16", "dark<0.35", "dark<0.5", "thick", "letters", "descenders", "contact-clear", "paper"];

/**
 * Признаци за дума за обучен класификатор: покритие по ленти на различна дълбочина под основната линия,
 * непрекъсната следа, колко тъмен е „мастилото“ (печатът е по-черен от графита), дебелина на следата.
 * Печатът залепя за основната линия (горните ленти), подчертаването е 4–16 px под нея.
 */
export function featuresFor(norm: Float32Array, W: number, H: number, w: Box, a: number, b: number, pitch: number): number[] {
  const sc = pitch / 38.5; // мащаб спрямо типичната страница
  const xa = Math.round(w.x) + 2;
  const xb = Math.round(w.x + w.w) - 2;
  const nCols = Math.max(1, xb - xa + 1);
  const bands = [[0, 2], [2, 4], [4, 6], [6, 9], [9, 12], [12, 16]].map(([p, q]) => [Math.round(p * sc), Math.max(Math.round(q * sc), Math.round(p * sc) + 1)]);
  // ниво на хартията в зоната под думата: 85-и персентил
  const samples: number[] = [];
  for (let x = xa; x <= xb; x += 2) {
    const base = a * x + b;
    for (let dy = 3; dy <= Math.round(16 * sc); dy += 2) {
      const y = Math.round(base + dy);
      if (x >= 0 && x < W && y >= 0 && y < H) samples.push(norm[y * W + x]);
    }
  }
  samples.sort((p, q) => p - q);
  const paper = samples.length ? samples[Math.floor(samples.length * 0.85)] : 1;
  const thr = Math.min(0.88, paper - 0.1);
  const cov = bands.map(([p, q]) => {
    let c = 0;
    for (let x = xa; x <= xb; x++) {
      if (x < 0 || x >= W) continue;
      const base = a * x + b;
      let ink = false;
      for (let dy = p; dy <= q && !ink; dy++) {
        const y = Math.round(base + dy);
        if (y >= 0 && y < H && norm[y * W + x] < thr) ink = true;
      }
      if (ink) c++;
    }
    return c / nCols;
  });
  // верига и серия в зоната [3,16]
  let run = 0;
  let bestRun = 0;
  let dark35 = 0;
  let dark50 = 0;
  let inkPix = 0;
  let thickSum = 0;
  let thickN = 0;
  const reach = 2;
  const yMax = Math.round(16 * sc);
  const rowsInk: boolean[][] = [];
  for (let x = xa; x <= xb; x++) {
    const col: boolean[] = [];
    let any = false;
    let streak = 0;
    let maxStreak = 0;
    for (let dy = 3; dy <= yMax; dy++) {
      const y = Math.round(a * x + b + dy);
      const v = x >= 0 && x < W && y >= 0 && y < H ? norm[y * W + x] : 1;
      const ink = v < thr;
      col.push(ink);
      if (ink) {
        any = true;
        inkPix++;
        if (v < 0.35) dark35++;
        if (v < 0.5) dark50++;
        streak++;
        if (streak > maxStreak) maxStreak = streak;
      } else streak = 0;
    }
    rowsInk.push(col);
    if (any) {
      run++;
      if (run > bestRun) bestRun = run;
      thickSum += maxStreak;
      thickN++;
    } else run = 0;
  }
  let chain = 0;
  let prev = new Int32Array(yMax - 2);
  for (const col of rowsInk) {
    const cur = new Int32Array(prev.length);
    for (let r = 0; r < cur.length; r++) {
      if (!col[r]) continue;
      let m = 0;
      for (let q = Math.max(0, r - reach); q <= Math.min(cur.length - 1, r + reach); q++) if (prev[q] > m) m = prev[q];
      cur[r] = m + 1;
      if (cur[r] > chain) chain = cur[r];
    }
    prev = cur;
  }
  const letters = w.t.replace(/[^A-Za-z]/g, "").length;
  const desc = letters ? (w.t.match(/[gjpqy]/g)?.length ?? 0) / letters : 0;
  const clear = (cov[3] + cov[4]) / 2;
  return [
    cov[0], cov[1], cov[2], cov[3], cov[4], cov[5],
    Math.min(1, chain / nCols), bestRun / nCols,
    inkPix ? dark35 / inkPix : 0, inkPix ? dark50 / inkPix : 0,
    thickN ? Math.min(1, thickSum / thickN / 8) : 0,
    Math.min(1, letters / 12), desc, cov[0] - clear, paper,
  ];
}
