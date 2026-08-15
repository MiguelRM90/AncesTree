/**
 * Renders the app icon to PNG at the sizes a browser needs to offer "install".
 *
 *   node scripts/make-icons.mjs
 *
 * Chrome will not treat a web app as installable without a 192 and a 512 pixel
 * icon, and an SVG in the manifest does not satisfy it. Rather than commit
 * binaries nobody can review, the icon is drawn here from the same shapes as
 * public/icon.svg and written out by a PNG encoder small enough to read.
 */

import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/', import.meta.url);

const GREEN = [0x2f, 0x6b, 0x4f];
const PAPER = [0xfa, 0xf8, 0xf5];

/** The icon, in the 64-unit space of public/icon.svg. */
const DOTS = [
  [20, 17],
  [44, 17],
  [20, 44],
  [32, 44],
  [44, 44],
];

const LINES = [
  [20, 20, 44, 20],
  [32, 20, 32, 29],
  [20, 33, 44, 33],
  [20, 33, 20, 39],
  [32, 33, 32, 39],
  [44, 33, 44, 39],
];

const DOT_RADIUS = 4;
const STROKE = 1.5; // half the SVG's stroke-width
const CORNER = 12;

/** Distance from a point to a line segment, for stroking. */
function distanceToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Inside the rounded square that forms the background. */
function insideCard(x, y) {
  const cx = Math.max(CORNER, Math.min(64 - CORNER, x));
  const cy = Math.max(CORNER, Math.min(64 - CORNER, y));
  return Math.hypot(x - cx, y - cy) <= CORNER;
}

const insideMark = (x, y) =>
  DOTS.some(([dx, dy]) => Math.hypot(x - dx, y - dy) <= DOT_RADIUS) ||
  LINES.some((line) => distanceToSegment(x, y, line) <= STROKE);

/**
 * Four samples per axis. Sixteen tests per pixel is nothing at these sizes and
 * it is the difference between clean curves and a staircase.
 */
const SAMPLES = 4;

function render(size) {
  const scale = 64 / size;
  const pixels = Buffer.alloc((size * 3 + 1) * size);

  for (let py = 0; py < size; py += 1) {
    const row = py * (size * 3 + 1);
    pixels[row] = 0; // filter: none

    for (let px = 0; px < size; px += 1) {
      let card = 0;
      let mark = 0;

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px + (sx + 0.5) / SAMPLES) * scale;
          const y = (py + (sy + 0.5) / SAMPLES) * scale;
          if (!insideCard(x, y)) continue;
          card += 1;
          if (insideMark(x, y)) mark += 1;
        }
      }

      const total = SAMPLES * SAMPLES;
      const at = row + 1 + px * 3;

      // Three regions per pixel, by sample count: outside the card, card, and
      // mark. `mark` is a subset of `card`, so the green share is the
      // difference — mixing that up leaves a bright halo around every edge.
      for (let channel = 0; channel < 3; channel += 1) {
        const outside = PAPER[channel] * (total - card);
        const green = GREEN[channel] * (card - mark);
        const white = 0xff * mark;

        pixels[at + channel] = Math.round((outside + green + white) / total);
      }
    }
  }

  return encodePng(size, pixels);
}

// --- PNG -------------------------------------------------------------------

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);

  return Buffer.concat([head, data, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Write -----------------------------------------------------------------

for (const size of [192, 512]) {
  const png = render(size);
  await writeFile(new URL(`icon-${size}.png`, OUT), png);
  console.log(`  public/icon-${size}.png  ${(png.length / 1024).toFixed(1)} kB`);
}
