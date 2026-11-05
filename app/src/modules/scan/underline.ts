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

export const DEFAULTS: Options = { bandStart: 3, bandFrac: 0.4, inkThr: 0.88, darkThr: 0.55, grow: 2, delta: 0.05, smooth: 1 };

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

/**
 * Връща оценка 0..1 за всяка дума (в същия ред): дял от колоните под думата със следа от молив.
 * gray: яркост 0..255, дължина W*H.
 */
export function underlineScores(gray: Uint8Array, W: number, H: number, words: Box[], opts: Partial<Options> = {}): number[] {
  const P = { ...DEFAULTS, ...opts };
  const g = blur(gray, W, H, P.smooth);
  const bg = paperLevel(g, W, H);

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
  for (const [k, ws] of lines)
    if (!fits.has(k)) fits.set(k, [gSlope, median(ws.map((w) => w.y + w.h - gSlope * (w.x + w.w / 2)))]);

  const mids = [...lines.keys()].map((k) => fits.get(k)![0] * (W / 2) + fits.get(k)![1]).sort((x, y) => x - y);
  const gaps: number[] = [];
  for (let i = 1; i < mids.length; i++) if (mids[i] - mids[i - 1] > 15 * (W / 1800)) gaps.push(mids[i] - mids[i - 1]);
  const pitch = median(gaps) || 45 * (W / 1800);

  // тъмна маска (печат)
  const dark = new Uint8Array(W * H);
  const norm = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      norm[i] = g[i] / bg(x, y);
      dark[i] = norm[i] < P.darkThr ? 1 : 0;
    }
  const nearDark = (x: number, y: number) => {
    for (let dy = -P.grow; dy <= P.grow; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -P.grow; dx <= P.grow; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < W && dark[yy * W + xx]) return true;
      }
    }
    return false;
  };

  return words.map((w) => {
    const [a, b] = fits.get(w.line)!;
    const xa = Math.round(w.x) + 2;
    const xb = Math.round(w.x + w.w) - 2;
    const vals: number[] = [];
    const grid: (number[] | null)[] = [];
    for (let x = xa; x <= xb; x++) {
      if (x < 0 || x >= W) {
        grid.push(null);
        continue;
      }
      const base = a * x + b;
      const col: number[] = [];
      for (let dy = P.bandStart; dy <= P.bandFrac * pitch; dy++) {
        const y = Math.round(base + dy);
        if (y < 0 || y >= H) continue;
        if (nearDark(x, y)) continue;
        const n = norm[y * W + x];
        col.push(n);
        vals.push(n);
      }
      grid.push(col);
    }
    vals.sort((p, q) => p - q);
    const L = vals.length ? vals[Math.floor(vals.length * 0.75)] : 1;
    const thr = Math.min(P.inkThr, L - P.delta);
    let cols = 0;
    let tot = 0;
    for (const col of grid) {
      if (col === null) continue;
      tot++;
      if (col.some((n) => n < thr)) cols++;
    }
    return tot ? cols / tot : 0;
  });
}
