// Renders the SVGs from make-brand.mjs into the PNGs the store and the README
// use, via qlmanage — macOS QuickLook, i.e. WebKit, which is the only renderer
// on hand that honours an embedded @font-face. Chrome, drawing an SVG as an
// image, silently substitutes the serif fallback for Archivo.
//
// qlmanage only ever thumbnails into a SQUARE, scaling the SVG to fit the
// width and leaving the rest below. So each render is cropped back here: to the
// board's exact size for the store assets, and to the ink for the lockups,
// which are logos and want no slack on the right.
//
// Run with: node scripts/rasterise-brand.mjs   (after make-brand.mjs)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const brand = fileURLToPath(new URL('../brand', import.meta.url));

// Every SVG is authored SQUARE at its final pixel size (see make-brand.mjs), so
// qlmanage is asked for -s = that side and renders 1:1. What comes back is
// cropped from the top-left to the board's real dimensions.
// name: [width, height, transparent]
// The store assets paint their own ground and want it. The lockups are logos:
// they have to drop onto whatever background the host has, so their alpha is
// recovered (see renderAlpha).
const BOARDS = {
  'store-tile-440x280': [440, 280, false],
  'store-marquee-1400x560': [1400, 560, false],
  'lockup-light': [1864, 432, true],
  'lockup-dark': [1864, 432, true],
};

/** Injects a full-bleed ground into a board SVG, right after its <style>. */
const withGround = (svg, fill) =>
  svg.replace('</style>\n', `</style>\n<rect width="100%" height="100%" fill="${fill}"/>\n`);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Decodes what qlmanage emits into {w, h, rgba}. Alpha is carried rather than
 *  flattened: the lockups are groundless, and a logo that arrives with an opaque
 *  ground is a logo that cannot be dropped onto anything. */
function readPng(file) {
  const buf = readFileSync(file);
  let off = 8;
  const idat = [];
  let w = 0, h = 0, colour = 0, depth = 0;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; colour = data[9];
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (depth !== 8 || (colour !== 2 && colour !== 6)) {
    throw new Error(`unexpected PNG format: depth ${depth}, colour ${colour}`);
  }
  const channels = colour === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const rgba = Buffer.alloc(w * h * 4);
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    raw.copy(line, 0, p, p + stride);
    p += stride;
    // PNG filters, per the spec — qlmanage uses Paeth and Up freely.
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      rgba[o] = line[x * channels];
      rgba[o + 1] = line[x * channels + 1];
      rgba[o + 2] = line[x * channels + 2];
      rgba[o + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    line.copy(prev);
  }
  return { w, h, rgba };
}

function writePng({ w, h, rgba }, file) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

const crop = (img, x0, y0, w, h) => {
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    img.rgba.copy(rgba, y * w * 4, ((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + w) * 4);
  }
  return { w, h, rgba };
};

/**
 * qlmanage composites onto white, so a transparent SVG still comes back opaque.
 * Rendering the same board over white and over black recovers the alpha exactly:
 * for a pixel of colour C and alpha a, the two composites are
 *   Cw = C*a + 255*(1-a)      Cb = C*a
 * so Cw - Cb = 255*(1-a), giving a = 1 - (Cw - Cb)/255, and C = Cb/a. That is
 * exact for antialiased edges too, which a white-knockout threshold is not.
 */
function renderAlpha(white, black) {
  const { w, h } = white;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    // Any channel gives the same alpha; averaging the three is steadier against
    // the odd rounding difference between the two renders.
    let sum = 0;
    for (let c = 0; c < 3; c++) sum += 255 - (white.rgba[o + c] - black.rgba[o + c]);
    const a = Math.max(0, Math.min(255, Math.round(sum / 3)));
    rgba[o + 3] = a;
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) {
      rgba[o + c] = Math.max(0, Math.min(255, Math.round((black.rgba[o + c] * 255) / a)));
    }
  }
  return { w, h, rgba };
}

const tmp = mkdtempSync(join(tmpdir(), 'brand-'));
try {
  const render = (svgPath, stem, side) => {
    execFileSync('qlmanage', ['-t', '-s', String(side), '-o', tmp, svgPath], { stdio: 'ignore' });
    const img = readPng(join(tmp, `${stem}.svg.png`));
    if (img.w !== side) throw new Error(`${stem}: qlmanage gave ${img.w}px, expected ${side}`);
    return img;
  };

  for (const [name, [w, h, transparent]] of Object.entries(BOARDS)) {
    const side = Math.max(w, h);
    const svg = readFileSync(`${brand}/${name}.svg`, 'utf8');
    let square;
    if (transparent) {
      const paths = ['w', 'b'].map((k, i) => {
        const p = join(tmp, `${name}-${k}.svg`);
        writeFileSync(p, withGround(svg, i === 0 ? '#ffffff' : '#000000'));
        return p;
      });
      square = renderAlpha(render(paths[0], `${name}-w`, side), render(paths[1], `${name}-b`, side));
    } else {
      square = render(`${brand}/${name}.svg`, name, side);
    }
    writePng(crop(square, 0, 0, w, h), `${brand}/${name}.png`);
    console.log(`wrote brand/${name}.png  ${w}x${h}${transparent ? '  (alpha)' : ''}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
