// THE PLANET'S SURFACE AS DATA (his direction 2026-10-21): a seeded height field → flat-shaded classes (deep, shallow, lowland, upland,
// highland, ice) at the planet's own scale, drawn as a vector-like map; the colony's w × h grid stays, but every cell is DRAWN as the
// Voronoi region of its jittered centre (jitter ≤ 25 % of a cell, so grid neighbours stay neighbours), split into its 4 slots by the
// two axes through the seed. Pure functions on arrays: the same code paints a canvas ImageData in the game and a PNG in node.
export const KINDS = ['living', 'ocean', 'ice', 'rock'];
export const CLS = { deep: 0, shallow: 1, low: 2, mid: 3, high: 4, ice: 5 };
const WATER = { living: 0.62, ocean: 0.88, ice: 0.3, rock: 0 };            // share of the surface under water
export const PALETTE = {                                                     // per class, [r,g,b]
  living: [[24, 58, 104], [44, 104, 150], [86, 134, 70], [128, 134, 86], [196, 190, 170], [232, 240, 246]],
  ocean:  [[16, 48, 96], [36, 96, 148], [96, 140, 92], [140, 140, 100], [200, 196, 180], [232, 240, 246]],
  ice:    [[40, 60, 84], [78, 104, 128], [206, 216, 224], [226, 232, 238], [246, 248, 250], [255, 255, 255]],
  rock:   [[52, 44, 40], [70, 60, 54], [118, 96, 72], [150, 128, 94], [190, 170, 136], [220, 206, 180]],
};
// ---- seeded noise ----
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function perlin(seed) {
  const r = mulberry(seed), p = new Uint8Array(512), g = []; for (let i = 0; i < 256; i++) { p[i] = i; const a = r() * 6.2832; g.push([Math.cos(a), Math.sin(a)]); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + (b - a) * t, dot = (i, x, y) => { const v = g[p[i] & 255]; return v[0] * x + v[1] * y; };
  return (x, y) => { const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y); const u = fade(x), v = fade(y);
    return lerp(lerp(dot(p[X + p[Y]], x, y), dot(p[X + 1 + p[Y]], x - 1, y), u), lerp(dot(p[X + p[Y + 1]], x, y - 1), dot(p[X + 1 + p[Y + 1]], x - 1, y - 1), u), v); };
}
function fbm(n, x, y, oct = 5) { let a = 1, f = 1, s = 0, norm = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; a *= 0.5; f *= 2.1; } return s / norm; }
// ---- the surface ----
export function terrain(seed, w, h, kind, { cellW = 140, cellH = 70, jitter = 0.25 } = {}) {
  const W = w * cellW, H = h * cellH, N = W * H, s = hash(seed + '|' + kind), n = perlin(s), n2 = perlin(s ^ 0x9e3779b9), rnd = mulberry(s ^ 0x7f4a7c15);
  const height = new Float32Array(N), cls = new Uint8Array(N), owner = new Int16Array(N), slot = new Uint8Array(N);
  const scale = 1 / 230;                                                     // a continent spans a couple of cells
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = x * scale + fbm(n2, x * scale * 0.7, y * scale * 0.7, 3) * 0.6, wy = y * 2 * scale;   // the 2:1 squash: the world is twice as tall as it looks
    let v = fbm(n, wx, wy) * 0.5 + 0.5;
    if (kind === 'ocean') v = v * 0.9 + 0.05 * fbm(n2, x * scale * 4, y * scale * 8, 2);           // scattered islands
    height[y * W + x] = v;
  }
  // sea level and the land bands by quantile, so the water share is exactly the kind's
  const sorted = Float32Array.from(height).sort(), q = t => sorted[Math.min(N - 1, Math.floor(t * N))];
  const sea = WATER[kind], lv = [q(sea * 0.6), q(sea), q(sea + (1 - sea) * 0.45), q(sea + (1 - sea) * 0.75), q(sea + (1 - sea) * 0.94)];
  const capFrom = kind === 'ice' ? 0.55 : kind === 'rock' ? 2 : 0.86;      // |latitude| beyond which the ground is ice
  for (let y = 0; y < H; y++) { const lat = Math.abs(y / H * 2 - 1); for (let x = 0; x < W; x++) { const i = y * W + x, v = height[i];
    let c = sea === 0 ? (v < lv[2] ? CLS.low : v < lv[3] ? CLS.mid : v < lv[4] ? CLS.high : CLS.ice) : v < lv[0] ? CLS.deep : v < lv[1] ? CLS.shallow : v < lv[2] ? CLS.low : v < lv[3] ? CLS.mid : v < lv[4] ? CLS.high : CLS.ice;
    if (kind === 'rock' && c === CLS.ice) c = CLS.high;
    if (c >= CLS.low && lat + 0.06 * fbm(n2, x * 0.02, y * 0.04, 2) > capFrom) c = CLS.ice;         // polar caps
    if (kind === 'ice' && c <= CLS.shallow && lat > 0.75) c = CLS.ice;                                   // frozen seas near the poles
    cls[i] = c; } }
  // the cells: a jittered seed per grid cell; every pixel belongs to the nearest seed (= the Voronoi region) and to a slot by the axes
  const seeds = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seeds.push({ x: (i + 0.5 + (rnd() - 0.5) * 2 * jitter) * cellW, y: (j + 0.5 + (rnd() - 0.5) * 2 * jitter) * cellH });
  const land = new Float32Array(w * h), area = new Float32Array(w * h);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, gi = Math.min(w - 1, Math.floor(x / cellW)), gj = Math.min(h - 1, Math.floor(y / cellH)); let best = -1, bd = 1e18;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ci = gi + di, cj = gj + dj; if (ci < 0 || cj < 0 || ci >= w || cj >= h) continue; const k = cj * w + ci, dx = (x - seeds[k].x), dy = (y - seeds[k].y) * 2, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = k; } }
    owner[i] = best; slot[i] = (x >= seeds[best].x ? 1 : 0) + (y >= seeds[best].y ? 2 : 0); area[best]++; if (cls[i] >= CLS.low) land[best]++;
  }
  for (let k = 0; k < w * h; k++) land[k] = area[k] ? land[k] / area[k] : 0;
  return { w, h, W, H, cellW, cellH, kind, height, cls, owner, slot, seeds, land };
}
// ---- paint into an RGBA buffer (Uint8ClampedArray of ImageData, or a node Buffer): flat classes, a darker coast, cell frames, slot lines ----
export function paint(T, rgba, { frames = true, slots = true } = {}) {
  const { W, H, cls, owner, slot } = T, pal = PALETTE[T.kind];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, c = cls[i]; let [r, g, b] = pal[c];
    const right = x + 1 < W ? i + 1 : i, down = y + 1 < H ? i + W : i;
    const water = c <= CLS.shallow, wR = cls[right] <= CLS.shallow, wD = cls[down] <= CLS.shallow;
    if (water !== wR || water !== wD) { r *= 0.55; g *= 0.6; b *= 0.65; }                                 // the coast line
    else if (c !== cls[right] || c !== cls[down]) { r *= 0.9; g *= 0.9; b *= 0.9; }                        // a contour between bands
    if (frames && (owner[i] !== owner[right] || owner[i] !== owner[down])) { r = r * 0.35 + 20; g = g * 0.35 + 24; b = b * 0.35 + 30; }
    else if (slots && (slot[i] !== slot[right] || slot[i] !== slot[down])) { r = r * 0.8 + 30; g = g * 0.8 + 32; b = b * 0.8 + 36; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
