// Generates flat placeholder PNG icons for the extension at build time, so
// no binary assets need to live in version control. Pure Node (zlib +
// manual PNG chunk framing) — no image library dependency for four tiny
// solid-color-with-a-ring icons.
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SIZES = [16, 32, 48, 128];
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const BG = [0x1e, 0x29, 0x3b, 255];
const FG = [0x5e, 0xd6, 0xb0, 255];

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function chunk(tag, data) {
  const tagBuf = Buffer.from(tag, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tagBuf, data])), 0);
  return Buffer.concat([lenBuf, tagBuf, data, crcBuf]);
}

function makePng(size) {
  const rows = [];
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      const inRing = dist >= size * 0.28 && dist <= size * 0.42;
      const color = inRing ? FG : BG;
      row.set(color, 1 + x * 4);
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const outPath = path.join(OUT_DIR, `icon${size}.png`);
  const png = makePng(size);
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${createHash("sha256").update(png).digest("hex").slice(0, 8)})`);
}
