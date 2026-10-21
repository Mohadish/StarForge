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
// ---- the surface: THREE NESTED VORONOI LEVELS (his complaint 2026-10-21: "the more detail, the more it becomes a grid") ----
// Level 1, the CELLS: a rough Voronoi of heavily jittered cell seeds — narrow, wide, oblique, odd shapes — this is the grid everything
// else builds on. Level 2, the SLOTS: 4 sub-seeds around each cell seed, and a pixel picks among its OWN cell's 4 only, so the slots
// subdivide the odd cell without changing its outline. Level 3, the DETAIL: 4 per slot, the same way (islands, lakes, bumps).
// The terrain's own ownership is the same walk with a per-seed wobble added to the distances at every level, so coasts and
// contours wander across the exact borders. The shallow band and the beach come from a distance pass over the coast afterwards.
export function terrain(seed, w, h, kind, { cellW = 140, cellH = 70, jitter = 0.38 } = {}) {
  const W = w * cellW, H = h * cellH, N = W * H, s = hash(seed + '|' + kind), rnd = mulberry(s ^ 0x7f4a7c15), n1 = perlin(s), n2 = perlin(s ^ 0x9e3779b9);
  const w2 = w * 2, h2 = h * 2;
  const type = assignTypes(w2, h2, kind, rnd);                                                     // a nature per SLOT (on the 2w × 2h slot grid)
  const subIndex = (cell, sl) => (2 * Math.floor(cell / w) + (sl >> 1)) * w2 + 2 * (cell % w) + (sl & 1);
  const J = () => (rnd() - 0.5) * 2;
  const seeds = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seeds.push({ x: (i + 0.5 + J() * jitter) * cellW, y: (j + 0.5 + J() * jitter * 0.8) * cellH, c1: Math.round(J()), c2: Math.round(J()) });
  const subSeeds = [], detSeeds = [];                                                              // per cell: 4 slot seeds; per slot: 4 detail seeds
  for (let k = 0; k < w * h; k++) for (let sl = 0; sl < 4; sl++) { const sx = (sl & 1 ? 1 : -1), sy = (sl & 2 ? 1 : -1);
    const p = { x: seeds[k].x + (sx * 0.25 + J() * 0.14) * cellW, y: seeds[k].y + (sy * 0.25 + J() * 0.14) * cellH, c1: Math.round(J()), c2: Math.round(J()) }; subSeeds.push(p);
    for (let d = 0; d < 4; d++) detSeeds.push({ x: p.x + ((d & 1 ? 1 : -1) * 0.12 + J() * 0.07) * cellW, y: p.y + ((d & 2 ? 1 : -1) * 0.12 + J() * 0.07) * cellH, c1: Math.round(J()), c2: Math.round(J()) }); }
  const FLIP = { living: { island: 0.09, lake: 0.06, bump: 0.12 }, ocean: { island: 0.07, lake: 0.04, bump: 0.1 }, ice: { island: 0.05, lake: 0.05, bump: 0.1 }, rock: { island: 0, lake: 0, bump: 0.14, pit: 0.04 } }[kind];
  const dtype = []; for (let k = 0; k < w * h * 16; k++) { const cell = k >> 4, sl = (k >> 2) & 3, t = type[subIndex(cell, sl)], r = rnd(); let d = t;
    if (t === 'ocean') { if (r < FLIP.island) d = 'low'; }
    else if (t === 'chasm') { if (r < 0.1) d = 'mid'; }
    else if (r < FLIP.lake && t !== 'ice' && kind !== 'rock') d = 'ocean';
    else if (r < FLIP.lake + FLIP.bump) d = t === 'low' ? 'mid' : t === 'mid' ? 'high' : t === 'ice' ? 'mid' : 'mid';
    else if (FLIP.pit && r < FLIP.lake + FLIP.bump + FLIP.pit) d = 'chasm';
    dtype.push(d); }
  const cls = new Uint8Array(N), owner = new Int16Array(N), slot = new Uint8Array(N), sub = new Int16Array(N), det = new Int16Array(N), water = new Uint8Array(N);
  const wrapDx = dx => { dx = Math.abs(dx); return Math.min(dx, W - dx); };
  const dist = (p, x, y) => { const dx = wrapDx(x - p.x), dy = (y - p.y) * 2; return Math.sqrt(dx * dx + dy * dy); };
  const AMP = [cellH * 0.55, cellH * 0.3, cellH * 0.16];                                           // the wobble at each level
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, gi = Math.floor(x / cellW), gj = Math.floor(y / cellH);
    const w1 = fbm(n1, x / 150, y / 75), w2n = fbm(n2, x / 70, y / 35, 3), hill = fbm(n2, x / 60, y / 30, 3);
    const wob = (p, L) => (p.c1 * w1 + p.c2 * w2n) * AMP[L];
    // level 1: the cell (exact and noisy), over the 5 × 5 neighbourhood (the jitter is big)
    let cell = -1, bd = 1e18, cellN = -1, bn = 1e18;
    for (let dj = -2; dj <= 2; dj++) { const cj = gj + dj; if (cj < 0 || cj >= h) continue; for (let di = -2; di <= 2; di++) { const k = cj * w + ((gi + di + w * 2) % w), d = dist(seeds[k], x, y); if (d < bd) { bd = d; cell = k; } const dn = d + wob(seeds[k], 0); if (dn < bn) { bn = dn; cellN = k; } } }
    // level 2: the slot, among the cell's own 4
    let sl = 0, slN = 0; bd = 1e18; bn = 1e18;
    for (let q = 0; q < 4; q++) { const d = dist(subSeeds[cell * 4 + q], x, y); if (d < bd) { bd = d; sl = q; } }
    for (let q = 0; q < 4; q++) { const p = subSeeds[cellN * 4 + q], dn = dist(p, x, y) + wob(p, 1); if (dn < bn) { bn = dn; slN = q; } }
    // level 3: the detail, among the slot's own 4
    let dt = 0, dtN = 0; bd = 1e18; bn = 1e18;
    for (let q = 0; q < 4; q++) { const d = dist(detSeeds[(cell * 4 + sl) * 4 + q], x, y); if (d < bd) { bd = d; dt = q; } }
    for (let q = 0; q < 4; q++) { const p = detSeeds[(cellN * 4 + slN) * 4 + q], dn = dist(p, x, y) + wob(p, 2); if (dn < bn) { bn = dn; dtN = q; } }
    owner[i] = cell; slot[i] = sl; sub[i] = subIndex(cell, sl); det[i] = (cell * 4 + sl) * 4 + dt;
    const t = dtype[(cellN * 4 + slN) * 4 + dtN]; let c;
    if (t === 'ocean') { c = hill > 0.34 ? CLS.shallow : CLS.deep; water[i] = 1; }
    else if (t === 'chasm') c = CLS.chasm;
    else if (t === 'ice') c = CLS.ice;
    else { c = t === 'low' ? CLS.low : t === 'mid' ? CLS.mid : CLS.high; if (hill > 0.2 && c < CLS.high) c++; else if (hill < -0.22 && c > CLS.low) c--; }
    const lat = Math.abs(y / H * 2 - 1) + w2n * 0.08, cap = kind === 'ice' ? 0.72 : 0.9;           // the polar caps: a wobbly latitude band
    if (lat > cap && c !== CLS.chasm && kind !== 'rock') { c = CLS.ice; water[i] = 0; }
    cls[i] = c;
  }
  // the coast: distance to the other side (a chamfer pass, twice for the wrap)
  const coastDistance = () => {
    const dc = new Float32Array(N).fill(1e9); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, r = x + 1 < W ? i + 1 : i - x, d = y + 1 < H ? i + W : i; if (water[i] !== water[r] || water[i] !== water[d]) dc[i] = 0; }
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, l = x ? i - 1 : i + W - 1, u = y ? i - W : i; dc[i] = Math.min(dc[i], dc[l] + 1, dc[u] + 2); }
      for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x, r = x + 1 < W ? i + 1 : i - x, d = y + 1 < H ? i + W : i; dc[i] = Math.min(dc[i], dc[r] + 1, dc[d] + 2); }
    }
    return dc;
  };
  // ROUGH SHORELINES (his ask 2026-10-21): near the coast a fine noise bites into the land and pushes rocks and spits into the sea —
  // fjords, inlets, skerries — strongest at the line itself, fading over ROUGH.r
  const ROUGH = { r: cellH * 0.22, bite: 0.1 }, nR = perlin(s ^ 0x2545f491); let dc = coastDistance();
  for (let i = 0; i < N; i++) { if (dc[i] >= ROUGH.r || cls[i] === CLS.ice || cls[i] === CLS.chasm) continue; const x = i % W, y = (i / W) | 0;
    const v = fbm(nR, x / 11, y / 5.5, 3) + 0.5 * fbm(nR, x / 4, y / 2, 2), t = ROUGH.bite + 0.6 * dc[i] / ROUGH.r;
    if (water[i] && v > t) { water[i] = 0; cls[i] = CLS.low; } else if (!water[i] && v < -t) { water[i] = 1; cls[i] = CLS.deep; } }
  dc = coastDistance();
  const band = cellH * 0.2, beach = cellH * 0.1;
  for (let i = 0; i < N; i++) { if (water[i]) { if (dc[i] < band) cls[i] = CLS.shallow; } else if (dc[i] < beach && (cls[i] === CLS.mid || cls[i] === CLS.high)) cls[i] = CLS.low; }
  const land = new Float32Array(w * h), area = new Float32Array(w * h);                             // usable share of every CELL's area
  for (let i = 0; i < N; i++) { area[owner[i]]++; if (cls[i] >= CLS.low && cls[i] !== CLS.chasm) land[owner[i]]++; }
  for (let k = 0; k < w * h; k++) land[k] = area[k] ? land[k] / area[k] : 0;
  const slotType = Array.from({ length: w * h }, () => new Array(4)); for (let k = 0; k < type.length; k++) slotType[(Math.floor(k / w2) >> 1) * w + ((k % w2) >> 1)][((k % w2) & 1) + 2 * (Math.floor(k / w2) & 1)] = type[k];
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
