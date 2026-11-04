// Генератор на синтетични снимки на страници с подчертани (молив, вълнички) думи.
// Употреба: node gen.mjs [брой=20] [seed=1]
import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import { SENTENCES } from "./corpus.mjs";

const N = Number(process.argv[2] ?? 20);
const SEED = Number(process.argv[3] ?? 1);
const OUT = path.join(import.meta.dirname, "data", "synthetic");
fs.mkdirSync(OUT, { recursive: true });

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function makePage(r, id) {
  const W = 1600, H = 2200, M = 150;
  const fs_ = 30 + Math.floor(r() * 8); // размер на шрифта
  const pitch = Math.round(fs_ * (1.45 + r() * 0.35)); // разстояние между редовете
  const font = `${fs_}px Georgia`;
  const page = createCanvas(W, H);
  const c = page.getContext("2d");
  const tint = 238 + Math.floor(r() * 14);
  c.fillStyle = `rgb(${tint},${tint - 3},${tint - 12})`;
  c.fillRect(0, 0, W, H);
  c.font = font;
  c.textBaseline = "alphabetic";

  // текст: разбъркани изречения
  const sents = [...SENTENCES].sort(() => r() - 0.5);
  const words = sents.join(" ").split(/\s+/);
  const lines = [];
  let cur = [], curW = 0;
  const space = c.measureText(" ").width;
  for (const w of words) {
    const ww = c.measureText(w).width;
    if (cur.length && curW + space + ww > W - 2 * M) { lines.push(cur); cur = []; curW = 0; }
    cur.push({ text: w, w: ww });
    curW += (cur.length > 1 ? space : 0) + ww;
  }
  const maxLines = Math.floor((H - 2 * M) / pitch);
  const usedLines = lines.slice(0, Math.min(lines.length, maxLines));

  const density = r(); // 0 = бледо, 1 = плътно
  const pencil = { alpha: 0.35 + density * 0.55, width: 2 + r() * 1.6 };
  const gt = [];
  let y = M + fs_;
  usedLines.forEach((ln, li) => {
    let x = M;
    ln.forEach((wd, wi) => { wd.x = x; wd.y = y; wd.li = li; x += wd.w + space; });
    y += pitch;
  });
  c.fillStyle = "#151515";
  for (const ln of usedLines) for (const wd of ln) c.fillText(wd.text, wd.x, wd.y);

  // подчертаване: ~10% от думите, понякога фрази от 2-3 думи
  for (const ln of usedLines) {
    for (let i = 0; i < ln.length; i++) {
      if (r() < 0.1) {
        const span = r() < 0.2 ? 2 + Math.floor(r() * 2) : 1;
        const end = Math.min(ln.length - 1, i + span - 1);
        for (let k = i; k <= end; k++) ln[k].ul = true;
        const x0 = ln[i].x - 2, x1 = ln[end].x + ln[end].w + 2;
        drawPencil(c, r, x0, x1, ln[i].y + fs_ * 0.2 + 3, pencil);
        i = end + 1;
      }
    }
  }
  for (const ln of usedLines) for (const wd of ln) {
    gt.push({ text: wd.text, line: wd.li, ul: !!wd.ul, box: [wd.x, wd.y - fs_ * 0.8, wd.x + wd.w, wd.y + fs_ * 0.25] });
  }
  return { page, gt, meta: { fontSize: fs_, pitch, density: +density.toFixed(2), alpha: +pencil.alpha.toFixed(2), width: +pencil.width.toFixed(1) } };
}

function drawPencil(c, r, x0, x1, yBase, p) {
  const A = 1.5 + r() * 4; // амплитуда
  const lam = 16 + r() * 16; // дължина на вълната
  const ph = r() * Math.PI * 2;
  const tilt = (r() - 0.5) * 0.02;
  c.lineCap = "round";
  for (let pass = 0; pass < 2; pass++) {
    let prev = null;
    for (let x = x0; x <= x1; x += 2) {
      const yy = yBase + A * Math.sin(((x - x0) / lam) * Math.PI * 2 + ph) + (x - x0) * tilt + (r() - 0.5) * 1.2 + pass * 1.2;
      if (prev) {
        const v = Math.round(40 + r() * 50);
        c.strokeStyle = `rgba(${v},${v},${v + 4},${clamp(p.alpha * (0.6 + r() * 0.5), 0.1, 0.95)})`;
        c.lineWidth = p.width * (0.7 + r() * 0.6);
        c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(x, yy); c.stroke();
      }
      prev = [x, yy];
    }
  }
}

function shoot(r, page, gt) {
  const PW = page.width, PH = page.height;
  const OW = 1800, OH = 2400;
  const out = createCanvas(OW, OH);
  const c = out.getContext("2d");
  const d = 60 + Math.floor(r() * 40);
  c.fillStyle = `rgb(${d},${d - 8},${d - 15})`;
  c.fillRect(0, 0, OW, OH);
  const ang = (r() - 0.5) * 2 * ((3.5 * Math.PI) / 180);
  const sc = 1 + (r() - 0.5) * 0.06;
  const tx = OW / 2, ty = OH / 2;
  const cos = Math.cos(ang) * sc, sin = Math.sin(ang) * sc;
  // точка (px,py) от страницата -> (X,Y) на снимката
  const map = (px, py) => {
    const dx = px - PW / 2, dy = py - PH / 2;
    return [tx + dx * cos - dy * sin, ty + dx * sin + dy * cos];
  };
  c.save();
  c.translate(tx, ty); c.rotate(ang); c.scale(sc, sc); c.translate(-PW / 2, -PH / 2);
  c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = 30;
  c.drawImage(page, 0, 0);
  c.restore();

  // осветление: градиент + сянка
  const g = c.createLinearGradient(r() * OW, 0, r() * OW, OH);
  const k = r();
  g.addColorStop(0, `rgba(255,240,210,${0.12 * k})`);
  g.addColorStop(1, `rgba(0,0,0,${0.35 * k})`);
  c.globalCompositeOperation = "multiply";
  c.fillStyle = g; c.fillRect(0, 0, OW, OH);
  if (r() < 0.3) { // сянка от телефона
    const sg = c.createRadialGradient(OW * (0.3 + r() * 0.4), OH * (0.1 + r() * 0.3), 50, OW / 2, OH / 3, OW * 0.6);
    sg.addColorStop(0, "rgba(40,40,40,0.55)"); sg.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = sg; c.fillRect(0, 0, OW, OH);
  }
  c.globalCompositeOperation = "source-over";

  // замъгляване + шум
  const blurred = createCanvas(OW, OH);
  const bc = blurred.getContext("2d");
  const blur = r() * 1.4;
  bc.filter = `blur(${blur.toFixed(2)}px)`;
  bc.drawImage(out, 0, 0);
  const img = bc.getImageData(0, 0, OW, OH);
  const noise = 3 + r() * 9;
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * noise * 2;
    img.data[i] = clamp(img.data[i] + n, 0, 255);
    img.data[i + 1] = clamp(img.data[i + 1] + n, 0, 255);
    img.data[i + 2] = clamp(img.data[i + 2] + n, 0, 255);
  }
  bc.putImageData(img, 0, 0);

  const gtOut = gt.map((w) => {
    const [x0, y0, x1, y1] = w.box;
    const [cx, cy] = map((x0 + x1) / 2, (y0 + y1) / 2);
    return { text: w.text, line: w.line, ul: w.ul, cx: Math.round(cx), cy: Math.round(cy) };
  });
  return { canvas: blurred, gt: gtOut, cond: { angleDeg: +((ang * 180) / Math.PI).toFixed(2), blur: +blur.toFixed(2), noise: +noise.toFixed(1), light: +k.toFixed(2) } };
}

for (let i = 0; i < N; i++) {
  const r = rng(SEED * 1000 + i);
  const { page, gt, meta } = makePage(r, i);
  const shot = shoot(r, page, gt);
  const id = String(i + 1).padStart(3, "0");
  fs.writeFileSync(path.join(OUT, `${id}.jpg`), shot.canvas.toBuffer("image/jpeg", 88));
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ meta, cond: shot.cond, words: shot.gt }, null, 1));
  console.log(id, JSON.stringify({ ...meta, ...shot.cond }), "underlined:", shot.gt.filter((w) => w.ul).length, "/", shot.gt.length);
}
