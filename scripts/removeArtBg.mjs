// One-off (re-runnable): removes the near-white backgrounds of the artwork
// JPGs via border flood fill, writes transparent PNGs next to them.
// Usage: node scripts/removeArtBg.mjs

import sharp from 'sharp';

const JOBS = [
  ['bow.jpg', 'bow.png'],
  ['teddy-balloons.jpg', 'teddy-balloons.png'],
  ['teddy-cloud.jpg', 'teddy-cloud.png'],
  ['blocks.jpg', 'blocks.png'],
  ['heart-balloon.png', 'heart-balloon-clean.png'],
];

// Background heuristic: VERY near-white only. Light watercolor washes
// (#FFF0F5 spread 15, #FFD3DC spread 44) stay opaque; the flood cannot cross
// their rims, so white artwork interiors (clouds, highlights) are protected.
const TOL = 10; // max channel spread for "background-ish"
const MIN = 231; // min channel floor
const FEATHER = 2; // alpha box-blur radius to soften the cut edge

async function processOne(src, dst) {
  const img = sharp(`public/artwork/${src}`);
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const alpha = new Uint8Array(n);
  const seen = new Uint8Array(n);

  const isBg = (i) => {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    return Math.max(r, g, b) - Math.min(r, g, b) <= TOL && Math.min(r, g, b) >= MIN;
  };

  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const seed = (x, y) => {
    const i = y * w + x;
    if (seen[i]) return;
    seen[i] = 1;
    if (isBg(i)) { alpha[i] = 255; queue[tail++] = i; }
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }

  while (head < tail) {
    const i = queue[head++];
    const x = i % w, y = (i / w) | 0;
    if (x + 1 < w) seed(x + 1, y);
    if (x - 1 >= 0) seed(x - 1, y);
    if (y + 1 < h) seed(x, y + 1);
    if (y - 1 >= 0) seed(x, y - 1);
  }

  // Feather the alpha edge
  const feathered = new Uint8Array(alpha);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, count = 0;
      for (let dy = -FEATHER; dy <= FEATHER; dy++) {
        for (let dx = -FEATHER; dx <= FEATHER; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          sum += alpha[ny * w + nx]; count++;
        }
      }
      feathered[y * w + x] = sum / count;
    }
  }

  const rgba = Buffer.alloc(n * 4);
  let transparent = 0;
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = data[i * 3];
    rgba[i * 4 + 1] = data[i * 3 + 1];
    rgba[i * 4 + 2] = data[i * 3 + 2];
    rgba[i * 4 + 3] = 255 - feathered[i];
    if (feathered[i] > 128) transparent++;
  }

  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(`public/artwork/${dst}`);

  console.log(`${src} -> ${dst}: ${Math.round((transparent / n) * 100)}% transparent`);
}

for (const [src, dst] of JOBS) {
  await processOne(src, dst);
}
