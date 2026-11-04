// Конвейер B2: като B, но за реални снимки.
// - без глобално изправяне: основна линия за всеки ред поотделно (перспектива, огъване)
// - печатът (тъмно) се маскира заедно със съседни пиксели, така че серифи и опашки не се броят за молив
import sharp from "sharp";
import { ocrTsv } from "./pipeline-b.mjs";

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function fitLine(pts) {
  // най-малки квадрати с еднократно отхвърляне на отклонения: y = a*x + b
  const fit = (p) => {
    const n = p.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [x, y] of p) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const d = n * sxx - sx * sx; const a = d ? (n * sxy - sx * sy) / d : 0;
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

export async function analyze(imgPath, opts = {}) {
  const P = { bandStart: 3, bandFrac: 0.4, inkThr: 0.88, darkThr: 0.55, smooth: 1.0, grow: 2, rel: true, delta: 0.05, ...opts };
  const words = ocrTsv(imgPath);
  const meta = await sharp(imgPath).metadata();
  const W = meta.width, H = meta.height;
  const raw = await sharp(imgPath).grayscale().blur(P.smooth).raw().toBuffer({ resolveWithObject: true });
  const ch = raw.info.channels;
  const g = ch === 1 ? raw.data : await sharp(raw.data, { raw: { width: W, height: H, channels: ch } }).extractChannel(0).raw().toBuffer();

  // фон (хартия): максимален филтър върху умалена снимка
  const S = 8, sw = Math.ceil(W / S), sh = Math.ceil(H / S);
  const small = await sharp(g, { raw: { width: W, height: H, channels: 1 } }).resize(sw, sh, { kernel: "linear" }).extractChannel(0).raw().toBuffer();
  const R = 4, mx = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let m = 0;
    for (let dy = -R; dy <= R; dy++) { const yy = y + dy; if (yy < 0 || yy >= sh) continue;
      for (let dx = -R; dx <= R; dx++) { const xx = x + dx; if (xx < 0 || xx >= sw) continue; const v = small[yy * sw + xx]; if (v > m) m = v; } }
    mx[y * sw + x] = m;
  }
  const bg = await sharp(Buffer.from(mx), { raw: { width: sw, height: sh, channels: 1 } }).blur(3).resize(W, H, { kernel: "linear" }).extractChannel(0).raw().toBuffer();

  // редове -> основна линия
  const lines = new Map();
  for (const w of words) { if (!lines.has(w.line)) lines.set(w.line, []); lines.get(w.line).push(w); }
  const fits = new Map();
  const slopes = [];
  for (const [k, ws] of lines) {
    const clean = ws.filter((w) => !/[gjpqy,;()|\/]/.test(w.text) && w.h > 6);
    const use = clean.length >= 3 ? clean : ws.length >= 3 ? ws : null;
    if (use) { const [a, b] = fitLine(use.map((w) => [w.left + w.w / 2, w.top + w.h])); fits.set(k, [a, b]); if (use.length >= 4) slopes.push(a); }
  }
  const gSlope = median(slopes);
  for (const [k, ws] of lines) if (!fits.has(k)) {
    const b = median(ws.map((w) => w.top + w.h - gSlope * (w.left + w.w / 2)));
    fits.set(k, [gSlope, b]);
  }
  // разстояние между редове (по средна линия, глобално)
  const mids = [...lines.keys()].map((k) => { const [a, b] = fits.get(k); return a * (W / 2) + b; }).sort((x, y) => x - y);
  const gaps = []; for (let i = 1; i < mids.length; i++) { const d = mids[i] - mids[i - 1]; if (d > 15) gaps.push(d); }
  const pitch = median(gaps) || 45;

  // маска на печата: тъмни пиксели
  const dark = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) dark[i] = g[i] / Math.max(1, bg[i]) < P.darkThr ? 1 : 0;
  const nearDark = (x, y) => {
    for (let dy = -P.grow; dy <= P.grow; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue;
      for (let dx = -P.grow; dx <= P.grow; dx++) { const xx = x + dx; if (xx >= 0 && xx < W && dark[yy * W + xx]) return true; } }
    return false;
  };

  const out = [];
  for (const w of words) {
    const [a, b] = fits.get(w.line);
    const xa = Math.round(w.left) + 2, xb = Math.round(w.left + w.w) - 2;
    // 1) нивото на хартията в лентата на тази дума (75-и персентил на немаскираните пиксели)
    const vals = [], grid = [];
    for (let x = xa; x <= xb; x++) {
      if (x < 0 || x >= W) { grid.push(null); continue; }
      const base = a * x + b; const col = [];
      for (let dy = P.bandStart; dy <= P.bandFrac * pitch; dy++) {
        const y = Math.round(base + dy); if (y < 0 || y >= H) continue;
        const i = y * W + x;
        if (nearDark(x, y)) continue;
        const n = g[i] / Math.max(1, bg[i]); col.push(n); vals.push(n);
      }
      grid.push(col);
    }
    if (opts.trace && new RegExp(opts.trace).test(w.text)) (opts.out ??= []).push({ text: w.text, a, b, xa, xb, y0: P.bandStart, y1: P.bandFrac * pitch, box: [w.left, w.top, w.w, w.h] });
    vals.sort((p, q) => p - q);
    const L = vals.length ? vals[Math.floor(vals.length * 0.75)] : 1;
    const thr = P.rel ? Math.min(P.inkThr, L - P.delta) : P.inkThr;
    let cols = 0, tot = 0;
    for (const col of grid) { if (col === null) continue; tot++; if (col.some((n) => n < thr)) cols++; }
    out.push({ text: w.text, conf: w.conf, left: w.left, top: w.top, w: w.w, h: w.h, score: tot ? cols / tot : 0 });
  }
  return { words: out, angleDeg: (Math.atan(gSlope) * 180) / Math.PI, pitch };
}
