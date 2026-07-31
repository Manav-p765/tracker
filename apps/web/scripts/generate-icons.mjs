/**
 * Generates the placeholder maskable PWA icons.
 *
 * Written as a script rather than committed binaries so the icons stay in sync
 * with the palette, and so replacing them later is a one-line change. Emits real
 * PNGs (zlib-deflated scanlines + CRC32 chunks) — no dependencies.
 *
 * Maskable means Android may crop to a circle, so everything meaningful stays
 * inside the centre 80% safe zone; the bone field bleeds to the edges.
 *
 * Palette values are duplicated from styles/tokens.css because a Node script
 * cannot read CSS custom properties. Keep them in sync (DESIGN.md §2).
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PAPER = [0xe8, 0xe2, 0xd2]; // --paper (day)
const SAGE = [0x6f, 0x8a, 0x55]; // --sage (day)
const INK = [0x2e, 0x2b, 0x24]; // --ink (day)

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

/** The 8×8 habit X from components/pixel/pixel-art.ts. */
const X_GLYPH = [
  "1......1",
  ".1....1.",
  "..1..1..",
  "...11...",
  "...11...",
  "..1..1..",
  ".1....1.",
  "1......1",
];

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** @param {number} size @param {(x: number, y: number) => number[]} pixelAt */
function encodePng(size, pixelAt) {
  const stride = size * 3 + 1; // one filter byte per scanline, RGB8
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixelAt(x, y);
      const offset = rowStart + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function iconPixel(size) {
  // The X occupies the middle 40% — comfortably inside the maskable safe zone.
  const glyphSize = Math.round(size * 0.4);
  const glyphOrigin = Math.round((size - glyphSize) / 2);
  const cell = glyphSize / 8;

  return (x, y) => {
    const gx = Math.floor((x - glyphOrigin) / cell);
    const gy = Math.floor((y - glyphOrigin) / cell);
    if (gx >= 0 && gx < 8 && gy >= 0 && gy < 8 && X_GLYPH[gy][gx] === "1") {
      return SAGE;
    }

    // A single ink hairline under the glyph — the journal rule.
    const ruleY = glyphOrigin + glyphSize + Math.round(cell);
    if (
      y >= ruleY &&
      y < ruleY + Math.max(1, Math.round(size / 128)) &&
      x >= glyphOrigin &&
      x < glyphOrigin + glyphSize
    ) {
      return INK;
    }

    return PAPER;
  };
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, iconPixel(size)));
  process.stdout.write(`icons: wrote ${file}\n`);
}
