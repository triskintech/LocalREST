// Generates the mark: a solid accent field with two bone rules — a long one
// over a short one — echoing the request and response panes. No border radius,
// matching Modernist.
//
// The mark is nothing but rectangles, so the PNGs are written pixel by pixel
// here rather than rasterised from the SVG. That means no image dependency, and
// every size is exact instead of resampled from one master.
//
//   public/icons/*.png   the sizes the manifest declares
//   brand/mark.svg       vector master — README, web, print, any size
//   brand/mark-*.png     HD raster for anywhere SVG is not accepted
//
// Run with: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ACCENT = [0xec, 0x30, 0x13];
const BONE = [0xf3, 0xf2, 0xf2];

/** Rules as fractions of the icon size: [x0, x1, y0, y1]. */
const RULES = [
  [0.22, 0.78, 0.3, 0.42],
  [0.22, 0.55, 0.58, 0.7],
];

// A separate cut for 16px, in whole pixels. Scaling the fractions down to a
// 16px grid rounds both rules to 2px with a 2px gap, which silts into a flat
// square in the toolbar and the extensions list. Hand-set, the rules are 3px
// with the gap held at 2, so the pair still reads as two marks at the one size
// where the icon is actually small. The long:short ratio is the same 0.59.
const RULES_16 = [
  [3, 13, 4, 7],
  [3, 9, 9, 12],
];

/** Rule bands in whole pixels for `size`. */
function bandsFor(size) {
  if (size === 16) return RULES_16.map(([x0, x1, y0, y1]) => ({ x0, x1, y0, y1 }));
  return RULES.map(([x0, x1, y0, y1]) => ({
    x0: Math.round(x0 * size),
    x1: Math.round(x1 * size),
    y0: Math.round(y0 * size),
    y1: Math.max(Math.round(y1 * size), Math.round(y0 * size) + 1),
  }));
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function renderPng(size) {
  // One filter byte (0 = none) plus RGB per pixel, per row.
  const raw = Buffer.alloc(size * (1 + size * 3));
  const bands = bandsFor(size);

  for (let y = 0; y < size; y++) {
    let offset = y * (1 + size * 3);
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const onRule = bands.some((b) => y >= b.y0 && y < b.y1 && x >= b.x0 && x < b.x1);
      const [r, g, b] = onRule ? BONE : ACCENT;
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The mark as SVG, on a 128 grid. Uses RULES directly, so it is the 48/128
 *  geometry — the 16px cut is a raster-only concern. */
function renderSvg() {
  const G = 128;
  const hex = (c) => '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('');
  const rects = RULES.map(([x0, x1, y0, y1]) => {
    const round = (n) => Number((n * G).toFixed(2));
    return `  <rect x="${round(x0)}" y="${round(y0)}" width="${round(x1 - x0)}" `
      + `height="${round(y1 - y0)}" fill="${hex(BONE)}"/>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${G} ${G}" width="${G}" height="${G}">`,
    `  <title>LocalREST</title>`,
    `  <rect width="${G}" height="${G}" fill="${hex(ACCENT)}"/>`,
    ...rects,
    `</svg>`,
    ``,
  ].join('\n');
}

const iconDir = fileURLToPath(new URL('../public/icons', import.meta.url));
const brandDir = fileURLToPath(new URL('../brand', import.meta.url));
mkdirSync(iconDir, { recursive: true });
mkdirSync(brandDir, { recursive: true });

// 32 is not optional on Windows: without it Chrome downsamples the 48 for the
// extensions page and the favicon, and the rules go soft.
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`${iconDir}/${size}.png`, renderPng(size));
  console.log(`wrote public/icons/${size}.png`);
}

writeFileSync(`${brandDir}/mark.svg`, renderSvg());
console.log('wrote brand/mark.svg');

for (const size of [256, 512, 1024]) {
  writeFileSync(`${brandDir}/mark-${size}.png`, renderPng(size));
  console.log(`wrote brand/mark-${size}.png`);
}
