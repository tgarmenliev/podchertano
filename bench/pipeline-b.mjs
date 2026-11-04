// Конвейер B: OCR с координати на думите (Tesseract) + анализ на пиксели под всяка дума.
import { execFileSync } from "node:child_process";
import sharp from "sharp";

export function ocrTsv(imgPath) {
  const out = execFileSync("tesseract", [imgPath, "stdout", "-l", "eng", "--psm", "4", "tsv"], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
  });
  const rows = out.split("\n").slice(1).map((l) => l.split("\t"));
  const words = [];
  for (const r of rows) {
    if (r.length < 12 || r[0] !== "5") continue;
    const text = (r[11] ?? "").trim();
    if (!text) continue;
    words.push({ text, conf: +r[10], left: +r[6], top: +r[7], w: +r[8], h: +r[9], line: `${r[2]}-${r[3]}-${r[4]}` });
  }
  return words;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };

function lineSlope(ws) {
  // регресия на долната граница по центъра на думата
  const n = ws.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const w of ws) { const x = w.left + w.w / 2, y = w.top + w.h; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const d = n * sxx - sx * sx;
  return d ? (n * sxy - sx * sy) / d : 0;
}

export async function analyze(imgPath, opts = {}) {
  const P = { bandFrac: 0.38, inkThr: 0.85, smooth: 1.2, ...opts };
  const words = ocrTsv(imgPath);
  const lines = new Map();
  for (const w of words) { if (!lines.has(w.line)) lines.set(w.line, []); lines.get(w.line).push(w); }
  const slopes = [...lines.values()].filter((l) => l.length >= 5).map(lineSlope);
  const angle = Math.atan(median(slopes)); // радиани, >0 = наклон надолу вдясно

  // изправяне на снимката (само за анализ; OCR не се повтаря)
  const base = sharp(imgPath).grayscale();
  const meta = await sharp(imgPath).metadata();
  let rotPipe = base.clone().rotate((-angle * 180) / Math.PI, { background: "#ffffff" });
  const rot0 = await rotPipe.raw().toBuffer({ resolveWithObject: true });
  // леко изглаждане срещу шума на сензора (иначе единични тъмни пиксели изглеждат като молив)
  const rot = { info: rot0.info, data: await sharp(rot0.data, { raw: { width: rot0.info.width, height: rot0.info.height, channels: rot0.info.channels } }).extractChannel(0).blur(P.smooth).raw().toBuffer() };
  const { width: W, height: H } = rot.info;
  const g = rot.data; // 1 канал
  const a = -angle, cos = Math.cos(a), sin = Math.sin(a);
  const cx0 = meta.width / 2, cy0 = meta.height / 2, cx1 = W / 2, cy1 = H / 2;
  const map = (x, y) => [cx1 + (x - cx0) * cos - (y - cy0) * sin, cy1 + (x - cx0) * sin + (y - cy0) * cos];

  // оценка на фона (хартията): максимален филтър върху умалена снимка
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

  // геометрия на редовете в изправената рамка
  const mapped = words.map((w) => {
    const [x0, yb0] = map(w.left, w.top + w.h); const [x1, yb1] = map(w.left + w.w, w.top + w.h);
    const [, yt] = map(w.left, w.top);
    return { ...w, X0: x0, X1: x1, B: (yb0 + yb1) / 2, T: yt };
  });
  const lineBase = new Map(); const lineOrder = [];
  for (const [k, ws] of lines) {
    const m = mapped.filter((w) => w.line === k);
    const clean = m.filter((w) => !/[gjpqy,;()]/.test(w.text));
    const b = clean.length >= 2 ? median(clean.map((w) => w.B)) : pct(m.map((w) => w.B), 0.3);
    lineBase.set(k, b); lineOrder.push(b);
  }
  lineOrder.sort((x, y) => x - y);
  const gaps = []; for (let i = 1; i < lineOrder.length; i++) { const d = lineOrder[i] - lineOrder[i - 1]; if (d > 8) gaps.push(d); }
  const pitch = median(gaps) || 50;

  const out = []; out.bands = [];
  for (const w of mapped) {
    const base0 = lineBase.get(w.line);
    const y0 = Math.round(base0 + 1), y1 = Math.round(base0 + P.bandFrac * pitch);
    const xa = Math.round(w.X0) + 2, xb = Math.round(w.X1) - 2;
    let cols = 0, tot = 0;
    for (let x = xa; x <= xb; x++) {
      if (x < 0 || x >= W) continue; tot++;
      let ink = false;
      for (let y = y0; y <= y1 && y < H; y++) {
        const i = y * W + x; if (y < 0) continue;
        if (g[i] / Math.max(1, bg[i]) < P.inkThr) { ink = true; break; }
      }
      if (ink) cols++;
    }
    if (opts.debug) (out.bands ??= []).push([xa, y0, xb, y1, w.score ?? 0]);
    // оригиналният център на кутията (за съпоставяне с истината)
    out.push({ text: w.text, conf: w.conf, left: w.left, top: w.top, w: w.w, h: w.h, score: tot ? cols / tot : 0 });
  }
  return { bg, bands: out.bands, W, H, gray: g, words: out, angleDeg: (angle * 180) / Math.PI, pitch };
}
