// Generates the apted Tracker store icons (16/32/48/128) as PNGs.
//
// Dependency-free: rasterizes the brand mark with 4x supersampling and writes
// PNGs via zlib (filter-0 scanlines). The mark is the apted glyph — a black
// rounded square with a white geometric lowercase "a" (bowl + stem), matching
// the Outfit-based drawer handle.
//
// Usage: node scripts/make-icons.mjs   (run from extension/)

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const SIZES = [16, 32, 48, 128];
const SS = 4; // supersample factor

// ── Tiny PNG encoder (RGBA, filter 0) ────────────────────────────────────────

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Shape coverage functions (unit square coordinates) ──────────────────────

const INK = [0, 0, 0, 255]; // brand black
const PAPER = [255, 255, 255, 255];

// Rounded square covering the full icon (8% corner radius).
function inBackground(x, y) {
  const r = 0.08;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Geometric lowercase "a": an annular bowl plus a rounded stem on the right.
// Coordinates in unit space; tuned to read at 16px.
const BOWL = { cx: 0.42, cy: 0.62, outer: 0.225, inner: 0.085 };
const STEM = { x0: 0.515, x1: 0.655, y0: 0.22, y1: 0.845, r: 0.07 };

function inAnnulus(x, y) {
  const dx = x - BOWL.cx;
  const dy = y - BOWL.cy;
  const d = dx * dx + dy * dy;
  return d <= BOWL.outer ** 2 && d >= BOWL.inner ** 2;
}

function inRoundedRect(x, y, { x0, x1, y0, y1, r }) {
  if (x < x0 - r || x > x1 + r || y < y0 - r || y > y1 + r) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inMark(x, y) {
  return inAnnulus(x, y) || inRoundedRect(x, y, STEM);
}

function renderIcon(size) {
  const w = size * SS;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHits = 0;
      let markHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x * SS + sx + 0.5) / w;
          const v = (y * SS + sy + 0.5) / w;
          if (inBackground(u, v)) bgHits++;
          if (inBackground(u, v) && inMark(u, v)) markHits++;
        }
      }
      const total = SS * SS;
      const bgAlpha = bgHits / total;
      const markAlpha = markHits / total;
      // Black tile where the background covers; white where the mark covers.
      // Compose: result = mark over background, over transparent.
      const a = Math.max(bgAlpha, markAlpha);
      if (a === 0) continue;
      const white = markAlpha; // fraction of pixel that is the white mark
      const black = a - white;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(255 * white); // R
      rgba[i + 1] = Math.round(255 * white); // G
      rgba[i + 2] = Math.round(255 * white); // B
      rgba[i + 3] = Math.round(255 * a);
      // Darken the white blend toward black proportionally (coverage AA).
      if (white > 0 && black > 0) {
        const t = black / a; // fraction of coverage that is black
        rgba[i] = rgba[i + 1] = rgba[i + 2] = Math.round(255 * (1 - t));
      }
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync("icons", { recursive: true });
for (const size of SIZES) {
  writeFileSync(`icons/icon${size}.png`, renderIcon(size));
  console.log(`wrote icons/icon${size}.png`);
}
