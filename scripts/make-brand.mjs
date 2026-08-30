// Generates the brand board SVGs, with Archivo embedded in each as a data URI
// so every board renders identically wherever it is opened.
//
// TWO MARKS, SPLIT BY SIZE — the rule the rest of this file obeys:
//
//   solid     extension icons (16-128), store icon, promo tile, marquee
//   outlined  the lockup: README, GitHub, the app header
//
// They share their geometry, so they read as one mark in two dresses. The
// split is not taste: a frame costs two pixels on every side, and at 16px
// there are only sixteen — the outlined mark's border ends up competing with
// its own rules and the interior collapses into noise. The solid mark holds
// all the way down, which is why it is the one that ships as the icon. The
// store also shows the promo tile beside the installed icon, so those must be
// the same object. If you ever collapse to one mark, keep the solid one.
//
// `Local://REST` is a rendered lockup, never a string: every string in the
// product stays `LocalREST`, or the store search terms are lost.
//
// The boards are authored as plain SVG — <rect> and <text> — rather than HTML in
// a <foreignObject>. That is not a style preference: the rasteriser is WebKit
// (see scripts/rasterise-brand.mjs), because Chrome refuses to load a webfont
// inside an SVG drawn as an image and renders every Archivo run as the serif
// fallback. WebKit honours an embedded @font-face in plain SVG text, but its
// foreignObject support drops stylesheets unpredictably. Plain SVG is the shape
// that survives both.
//
// Advance widths are the renderer's problem: the wordmark is one <text> with
// three <tspan>s, so nothing here has to know how wide "Local" is.
//
// Run with: node scripts/make-brand.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILES = fileURLToPath(new URL('../node_modules/@fontsource/archivo/files', import.meta.url));
const outDir = fileURLToPath(new URL('../brand', import.meta.url));
mkdirSync(outDir, { recursive: true });

/* ── fonts ─────────────────────────────────────────────────────────────── */

const CUTS = [
  [400, 'normal'],
  [600, 'normal'],
  [800, 'normal'],
  [800, 'italic'],
];

const fontCss = CUTS.map(([weight, style]) => {
  const b64 = readFileSync(`${FILES}/archivo-latin-${weight}-${style}.woff2`).toString('base64');
  return `@font-face{font-family:'Archivo';font-style:${style};font-weight:${weight};`
    + `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}).join('\n');

/* ── palette ───────────────────────────────────────────────────────────── */

const LIGHT = {
  bg: '#f3f2f2', ink: '#201e1d', accent: '#ec3013', accent700: '#ae1800',
  // 65% ink on bone: 4.96:1, so the slashes hold at 16px as well as at 160px.
  slash: '#6a6868', rule: '#201e1d',
};
const DARK = {
  bg: '#1a1817', ink: '#eae7e6', accent: '#ff5a38', accent700: '#ff8d75',
  slash: '#a19f9e', rule: '#eae7e6',
};

/* ── pieces ────────────────────────────────────────────────────────────── */

/** The solid mark — what ships as the extension icon. */
function markSolid(x, y, s, t) {
  const r = (x0, x1, y0, y1) =>
    `<rect x="${(x + x0 * s).toFixed(2)}" y="${(y + y0 * s).toFixed(2)}" `
    + `width="${((x1 - x0) * s).toFixed(2)}" height="${((y1 - y0) * s).toFixed(2)}" fill="${t.bg}"/>`;
  return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${t.accent}"/>`
    + r(0.22, 0.78, 0.3, 0.42) + r(0.22, 0.55, 0.58, 0.7);
}

/** The outlined mark — the display variant, from the 9a header. */
function markOutline(x, y, s, t) {
  const b = s * 0.0714;
  const padX = s * 0.143;
  const barH = s * 0.143;
  const top = y + s * 0.2857;
  const innerX = x + b + padX;
  const innerW = s - 2 * b - 2 * padX;
  return `<rect x="${(x + b / 2).toFixed(2)}" y="${(y + b / 2).toFixed(2)}" `
    + `width="${(s - b).toFixed(2)}" height="${(s - b).toFixed(2)}" fill="none" `
    + `stroke="${t.ink}" stroke-width="${b.toFixed(2)}"/>`
    + `<rect x="${innerX.toFixed(2)}" y="${top.toFixed(2)}" width="${innerW.toFixed(2)}" `
    + `height="${barH.toFixed(2)}" fill="${t.accent}"/>`
    + `<rect x="${innerX.toFixed(2)}" y="${(top + barH * 2).toFixed(2)}" `
    + `width="${(innerW * 0.56).toFixed(2)}" height="${barH.toFixed(2)}" fill="${t.ink}"/>`;
}

/** Local://REST as one text run, so the renderer resolves the advance widths. */
function wordmark(x, baseline, size, t) {
  return `<text x="${x}" y="${baseline}" font-family="Archivo" font-size="${size}" `
    + `letter-spacing="${(-0.035 * size).toFixed(2)}">`
    + `<tspan font-weight="800" font-style="italic" fill="${t.ink}">Local</tspan>`
    + `<tspan font-weight="600" fill="${t.slash}">://</tspan>`
    + `<tspan font-weight="800" fill="${t.accent700}">REST</tspan>`
    + `</text>`;
}

// Archivo's cap height, as a fraction of font-size. Optically centring a run of
// capitals against a square means centring its CAP height, not its em box —
// aligning the em box leaves the text visibly high, because the descender space
// is empty here (`Local://REST` has none).
const CAP = 0.73;

/** The wordmark, vertically centred on `centreY` by its cap height. */
const wordmarkAt = (x, centreY, size, t) => wordmark(x, centreY + (size * CAP) / 2, size, t);

const text = (x, y, size, weight, fill, body, extra = '') =>
  `<text x="${x}" y="${y}" font-family="Archivo" font-size="${size}" font-weight="${weight}" `
  + `fill="${fill}"${extra}>${body}</text>`;

// Total advance of `Local://REST` at font-size 1, including the -0.035em
// tracking — measured with canvas measureText against the real Archivo:
//   Local 2.613 + :// 0.827 + REST 2.681
// It is only used to size the lockup canvas to its content. Re-measure if the
// tracking or the weights change.
const WORDMARK_EM = 6.121;

// Boards are authored in design units and emitted at design x scale. Two
// things about the rasteriser force the shape of this:
//
//   1. qlmanage only ever produces a SQUARE, and how it fits a non-square SVG
//      into that square is not predictable — a 1864x432 board asked for -s 1864
//      came back at roughly 4x, while a 440x280 board asked for -s 440 came
//      back at 1x. So the canvas here IS square, with the board in the top-left
//      and the rest of the square painted in the same ground. Square into
//      square is 1:1 with nothing left to interpret; the filler is cropped off
//      by scripts/rasterise-brand.mjs.
//   2. It will not scale reliably either, so the scale is baked into the
//      coordinates rather than asked for at render time.
const doc = (w, h, t, body, k = 1, ground = true) => {
  const side = Math.max(w, h) * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" `
    + `viewBox="0 0 ${side} ${side}">\n`
    + `<style type="text/css">${fontCss}</style>\n`
    + (ground ? `<rect width="${side}" height="${side}" fill="${t.bg}"/>\n` : '')
    + `<g transform="scale(${k})">${body}</g>\n</svg>\n`;
};

/* ── boards ────────────────────────────────────────────────────────────── */

/** Chrome Web Store small promo tile. Must be exactly 440x280. */
function tile() {
  const t = LIGHT;
  const p = 30;
  return doc(440, 280, t,
    markSolid(p, p, 44, t)
    + wordmarkAt(p + 44 + 14, p + 22, 38, t)
    + `<rect x="${p}" y="100" width="${440 - 2 * p}" height="3" fill="${t.rule}"/>`
    + text(p, 141, 21, 600, t.ink, 'An API client that runs')
    + text(p, 168, 21, 600, t.ink, 'entirely in your browser.')
    + text(p, 250, 12, 700, t.accent700, 'NO ACCOUNT &#183; NO CLOUD &#183; NO 200MB APP',
      ' letter-spacing="1.44"'));
}

/** Chrome Web Store marquee. Must be exactly 1400x560. */
function marquee() {
  const t = LIGHT;
  const p = 76;
  return doc(1400, 560, t,
    markSolid(p, p, 88, t)
    + wordmarkAt(p + 88 + 28, p + 44, 76, t)
    + `<rect x="${p}" y="204" width="${1400 - 2 * p}" height="3" fill="${t.rule}"/>`
    + text(p, 274, 40, 600, t.ink, 'Build, send and organise HTTP requests')
    + text(p, 324, 40, 600, t.ink, 'without an account.')
    + text(p, 484, 15, 700, t.accent700,
      'REQUESTS &#183; COLLECTIONS &#183; ENVIRONMENTS &#183; CURL &#183; POSTMAN IMPORT',
      ' letter-spacing="1.8"'));
}

/** Mark + wordmark, on a canvas sized to exactly fit them.
 *
 *  No ground: this is a logo, and it gets dropped onto whatever background the
 *  host has — a bone block on GitHub's white reads as a stray card. The light
 *  and dark cuts differ in ink, not in ground, so a <picture> swaps them. */
function lockup(theme) {
  const t = theme;
  const s = 104;      // mark
  const p = 56;       // padding
  const gap = 30;
  const size = 112;   // wordmark
  const w = p + s + gap + Math.ceil(WORDMARK_EM * size) + p;
  return doc(w, s + 2 * p, t,
    markOutline(p, p, s, t) + wordmarkAt(p + s + gap, p + s / 2, size, t), 2, false);
}

const boards = {
  'store-tile-440x280': tile(),
  'store-marquee-1400x560': marquee(),
  'lockup-light': lockup(LIGHT),
  'lockup-dark': lockup(DARK),
};

// The outlined mark on its own, as a vector master. Its counterpart for the
// solid mark is brand/mark.svg, written by scripts/make-icons.mjs.
writeFileSync(`${outDir}/mark-outline.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">\n`
  + `  <title>LocalREST</title>\n  ${markOutline(0, 0, 128, LIGHT)}\n</svg>\n`);
console.log('wrote brand/mark-outline.svg');

for (const [name, svg] of Object.entries(boards)) {
  writeFileSync(`${outDir}/${name}.svg`, svg);
  console.log(`wrote brand/${name}.svg`);
}
