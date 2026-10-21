// THE PLANET'S SURFACE, CELLS FIRST (his idea 2026-10-21): the colony's w × h grid, every cell drawn as the Voronoi region of its jittered
// centre on a surface that WRAPS left to right (the strip is the sphere's belt), and the CELLS DEFINE THE TOPOGRAPHY: each cell is an
// ocean / lowland / upland / highland / ice / chasm cell (clustered so oceans and ranges are coherent), and the terrain is elaborated
// along the cell borders — coastlines wobble, a shallow band and a beach follow them, contours between land bands wobble too.
// A planet has a GROSS size (w × h cells) and a NET size (the usable cells: land that is not a chasm). Pure functions on arrays:
// the same code paints a canvas ImageData in the game and a PNG in node.
export const KINDS = ['living', 'ocean', 'ice', 'rock'];
export const CLS = { deep: 0, shallow: 1, low: 2, mid: 3, high: 4, ice: 5, chasm: 6 };
export const CELL_TYPES = ['ocean', 'low', 'mid', 'high', 'ice', 'chasm'];
const SHARE = {                                                              // of the cells: water, highland (of the land), chasm, polar ice chance
  living: { water: 0.42, high: 0.25, chasm: 0, polar: 0.8 },
  ocean:  { water: 0.78, high: 0.3, chasm: 0, polar: 0.6 },
  ice:    { water: 0.3, high: 0.2, chasm: 0.05, polar: 1 },
  rock:   { water: 0, high: 0.3, chasm: 0.15, polar: 0 },
};
export const PALETTE = {                                                     // per class, [r,g,b]: deep, shallow, low, mid, high, ice, chasm
  living: [[24, 58, 104], [52, 118, 160], [92, 140, 72], [132, 138, 88], [182, 176, 150], [232, 240, 246], [30, 26, 24]],
  ocean:  [[16, 48, 96], [40, 110, 160], [100, 146, 90], [146, 144, 100], [196, 190, 170], [232, 240, 246], [30, 26, 24]],
  ice:    [[34, 52, 76], [70, 98, 124], [210, 220, 228], [176, 190, 202], [120, 130, 142], [244, 247, 250], [40, 46, 56]],
  rock:   [[52, 44, 40], [70, 60, 54], [120, 98, 72], [152, 130, 96], [192, 172, 138], [222, 208, 184], [26, 22, 20]],
};
export const USABLE = t => t !== 'ocean' && t !== 'chasm';
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
function fbm(n, x, y, oct = 4) { let a = 1, f = 1, s = 0, norm = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; a *= 0.5; f *= 2.1; } return s / norm; }
// ---- the cells' natures: clustered by growing from a few seeds through the (wrapping) grid ----
function assignTypes(w, h, kind, rnd) {
  const n = w * h, type = new Array(n).fill('low'), S = SHARE[kind];
  const nb = k => { const i = k % w, j = Math.floor(k / w), out = [((i + 1) % w) + j * w, ((i - 1 + w) % w) + j * w]; if (j > 0) out.push(k - w); if (j < h - 1) out.push(k + w); return out; };
  const grow = (want, label, allowed) => {                                   // seeds = 1 per 5 cells of the quota, then random frontier growth
    if (want <= 0) return; let count = 0; const frontier = [];
    for (let s = 0, tries = 0; s < Math.max(1, Math.round(want / 5)) && tries < 200; tries++) { const k = Math.floor(rnd() * n); if (allowed(type[k])) { type[k] = label; count++; s++; frontier.push(...nb(k)); } }
    while (count < want && frontier.length) { const k = frontier.splice(Math.floor(rnd() * frontier.length), 1)[0]; if (!allowed(type[k])) continue; type[k] = label; count++; frontier.push(...nb(k)); }
  };
  grow(Math.round(n * S.water), 'ocean', t => t === 'low');
  const land = type.filter(t => t === 'low').length;
  grow(Math.round(land * S.high), 'high', t => t === 'low');
  for (let k = 0; k < n; k++) if (type[k] === 'low' && nb(k).some(q => type[q] === 'high')) type[k] = 'mid';   // uplands ring the ranges
  grow(Math.round(n * S.chasm), 'chasm', t => t === 'low' || t === 'mid');
  if (kind === 'ice') for (let k = 0; k < n; k++) if (type[k] === 'low') type[k] = 'ice';          // (polar caps are a latitude band, painted per pixel)
  return type;
}
// ---- the surface: ×2 RESOLUTION (his ask 2026-10-21) — every cell is 4 SLOTS, each slot its own jittered Voronoi region with its own
// nature; a cell is the union of its 4 slots, so its frame is organic too. gross / net are counted in slots. ----
export function terrain(seed, w, h, kind, { cellW = 140, cellH = 70, jitter = 0.25 } = {}) {
  const W = w * cellW, H = h * cellH, N = W * H, s = hash(seed + '|' + kind), rnd = mulberry(s ^ 0x7f4a7c15), n1 = perlin(s), n2 = perlin(s ^ 0x9e3779b9);
  const w2 = w * 2, h2 = h * 2, sw = cellW / 2, sh = cellH / 2;                                    // the slot grid
  const type = assignTypes(w2, h2, kind, rnd);                                                     // a nature per SLOT
  const cellOf = k => (Math.floor(k / w2) >> 1) * w + ((k % w2) >> 1), slotOf = k => ((k % w2) & 1) + 2 * (Math.floor(k / w2) & 1);
  // ONE MORE LEVEL (his ask 2026-10-21, "small islands inside oceans"): a DETAIL Voronoi, 4 per slot, not part of the district logic —
  // every detail cell inherits its slot's nature with a small chance to flip: an island in an ocean slot, a lake or a bump on land
  const w4 = w * 4, h4 = h * 4, dw = cellW / 4, dh = cellH / 4, parentOf = k => (Math.floor(k / w4) >> 1) * w2 + ((k % w4) >> 1);
  const seeds = []; for (let j = 0; j < h4; j++) for (let i = 0; i < w4; i++) seeds.push({ x: (i + 0.5 + (rnd() - 0.5) * 2 * jitter) * dw, y: (j + 0.5 + (rnd() - 0.5) * 2 * jitter) * dh });
  const FLIP = { living: { island: 0.09, lake: 0.06, bump: 0.12 }, ocean: { island: 0.07, lake: 0.04, bump: 0.1 }, ice: { island: 0.05, lake: 0.05, bump: 0.1 }, rock: { island: 0, lake: 0, bump: 0.14, pit: 0.04 } }[kind];
  const dtype = []; for (let k = 0; k < w4 * h4; k++) { const t = type[parentOf(k)], r = rnd(); let d = t;
    if (t === 'ocean') { if (r < FLIP.island) d = 'low'; }
    else if (t === 'chasm') { if (r < 0.1) d = 'mid'; }
    else if (r < FLIP.lake && t !== 'ice' && kind !== 'rock') d = 'ocean';
    else if (r < FLIP.lake + FLIP.bump) d = t === 'low' ? 'mid' : t === 'mid' ? 'high' : t === 'ice' ? 'mid' : 'mid';
    else if (FLIP.pit && r < FLIP.lake + FLIP.bump + FLIP.pit) d = 'chasm';
    dtype.push(d); }
  const cls = new Uint8Array(N), owner = new Int16Array(N), slot = new Uint8Array(N), sub = new Int16Array(N), det = new Int16Array(N), amp = dh * 1.3, band = dh * 0.9, beach = dh * 0.35;
  const wrapDx = dx => { dx = Math.abs(dx); return Math.min(dx, W - dx); };
  const rank = t => t === 'ocean' ? 0 : t === 'chasm' ? 0 : t === 'low' ? 1 : t === 'ice' ? 1 : t === 'mid' ? 2 : 3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, gi = Math.floor(x / dw), gj = Math.floor(y / dh);
    const wob = fbm(n1, x / 120, y / 60) * amp, wob2 = fbm(n2, x / 80, y / 40, 3) * amp * 0.7;    // the border wobble, soft and slow (his "soften the coasts")
    const hill = fbm(n2, x / 70, y / 35, 3);                                                       // inner relief: patches of higher / lower ground
    let best = -1, bd = 1e18, tBest = -1, tbd = 1e18; const dists = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const cj = gj + dj; if (cj < 0 || cj >= h4) continue; const ci = (gi + di + w4) % w4, k = cj * w4 + ci;
      const dx = wrapDx(x - seeds[k].x), dy = (y - seeds[k].y) * 2, d = Math.sqrt(dx * dx + dy * dy);
      if (d < bd) { bd = d; best = k; }
      const dn = d + (rank(dtype[k]) === 0 ? wob : wob2) * (rank(dtype[k]) % 2 ? 1 : -1);          // noisy distance: the terrain's own ownership
      dists.push([dn, k]); if (dn < tbd) { tbd = dn; tBest = k; }
    }
    det[i] = best; sub[i] = parentOf(best); owner[i] = cellOf(sub[i]); slot[i] = slotOf(sub[i]);
    const t = dtype[tBest]; let c;
    const water = t === 'ocean', nearest = f => { let m = 1e18; for (const [dn, k] of dists) if (f(dtype[k])) m = Math.min(m, dn); return m - tbd; };
    if (water) { c = nearest(q => q !== 'ocean') < band || hill > 0.34 ? CLS.shallow : CLS.deep; }
    else if (t === 'chasm') c = CLS.chasm;
    else if (t === 'ice') c = CLS.ice;
    else { c = t === 'low' ? CLS.low : t === 'mid' ? CLS.mid : CLS.high;
      if (hill > 0.2 && c < CLS.high) c++; else if (hill < -0.22 && c > CLS.low) c--;
      if (c !== CLS.low && nearest(q => q === 'ocean') < beach) c = CLS.low; }
    const lat = Math.abs(y / H * 2 - 1) + wob2 / cellH * 0.25, cap = kind === 'ice' ? 0.72 : 0.9;      // the polar caps: a wobbly latitude band
    if (lat > cap && c !== CLS.chasm && (kind !== 'rock')) c = CLS.ice;
    cls[i] = c;
  }
  const land = new Float32Array(w * h), area = new Float32Array(w * h);                             // usable share of every CELL's area
  for (let i = 0; i < N; i++) { area[owner[i]]++; if (cls[i] >= CLS.low && cls[i] !== CLS.chasm) land[owner[i]]++; }
  for (let k = 0; k < w * h; k++) land[k] = area[k] ? land[k] / area[k] : 0;
  const slotType = Array.from({ length: w * h }, () => new Array(4)); for (let k = 0; k < type.length; k++) slotType[cellOf(k)][slotOf(k)] = type[k];
  const net = type.filter(USABLE).length;
  return { w, h, W, H, cellW, cellH, kind, type, slotType, cls, owner, slot, sub, det, seeds, land, gross: w * h * 4, net };
}
// ---- paint into an RGBA buffer: flat classes, a darker coast, cell frames, slot lines ----
export function paint(T, rgba, { frames = true, slots = true } = {}) {
  const { W, H, cls, owner, sub } = T, pal = PALETTE[T.kind];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, c = cls[i]; let [r, g, b] = pal[c];
    const right = x + 1 < W ? i + 1 : y * W, down = y + 1 < H ? i + W : i;                               // the right edge continues at the left (wrap)
    const water = c <= CLS.shallow, wR = cls[right] <= CLS.shallow, wD = cls[down] <= CLS.shallow;
    if (water !== wR || water !== wD) { r *= 0.55; g *= 0.6; b *= 0.65; }
    else if (c !== cls[right] || c !== cls[down]) { r *= 0.88; g *= 0.88; b *= 0.88; }
    if (frames && (owner[i] !== owner[right] || owner[i] !== owner[down])) { r = r * 0.35 + 20; g = g * 0.35 + 24; b = b * 0.35 + 30; }
    else if (slots && (sub[i] !== sub[right] || sub[i] !== sub[down])) { r = r * 0.8 + 30; g = g * 0.8 + 32; b = b * 0.8 + 36; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
