// THE PLANET'S SURFACE, CELLS FIRST (his direction 2026-10-21): the colony's w × h grid, every cell drawn as the Voronoi region of its
// jittered centre on a surface that WRAPS left to right (the strip is the sphere's belt), and the CELLS DEFINE THE TOPOGRAPHY.
// Three NESTED Voronoi levels: the CELLS (rough, oblique, odd — the grid everything builds on), the SLOTS (4 inside each cell) and
// the DETAIL (4 inside each slot = the DISTRICTS: the smallest cells, one district each, only on habitable ground). The finer seeds
// are found by clustering the parent's own pixels (k-means), so every region is split into 4 even, non-empty parts and the finer
// levels never straighten the cell outline. Each slot has a NATURE (ocean / low / mid / high / ice / chasm, clustered so oceans and
// ranges are coherent); each detail cell inherits it with a small chance to flip (islands, lakes, bumps, pits); the polar caps are
// detail cells too (a defined area). The terrain's own ownership is the same walk with a per-seed wobble at every level, so coasts
// and contours wander across the exact borders; a fine noise then roughens the shoreline; the shallow band and the beach come from
// a distance pass. A planet has a GROSS size (districts) and a NET size (habitable districts). Pure functions on arrays.
export const KINDS = ['living', 'ocean', 'ice', 'rock', 'irradiated'];       // irradiated (his idea): a world under a violent star — only shelter is livable
export const CLS = { deep: 0, shallow: 1, low: 2, mid: 3, high: 4, ice: 5, chasm: 6 };
export const CELL_TYPES = ['ocean', 'low', 'mid', 'high', 'ice', 'chasm'];
const SHARE = {                                                              // of the slots: water, highland (of the land), chasm
  living: { water: 0.42, high: 0.25, chasm: 0 },
  ocean:  { water: 0.78, high: 0.3, chasm: 0 },
  ice:    { water: 0.3, high: 0.2, chasm: 0 },                               // its seas are frozen hundreds of km deep: buildable (his call)
  rock:   { water: 0, high: 0.3, chasm: 0 },                                 // a dead world is all surface — only tiny pits are lost (his call)
  irradiated: { water: 0, high: 0.35, chasm: 0 },
};
const CAP = { living: 0.86, ocean: 0.88, ice: 0.7, rock: 2, irradiated: 2 };   // |latitude| of a detail seed beyond which it is polar ice (rock: never)
export const PALETTE = {                                                     // per class, [r,g,b]: deep, shallow, low, mid, high, ice, chasm
  living: [[24, 58, 104], [52, 118, 160], [92, 140, 72], [132, 138, 88], [182, 176, 150], [232, 240, 246], [30, 26, 24]],
  ocean:  [[16, 48, 96], [40, 110, 160], [100, 146, 90], [146, 144, 100], [196, 190, 170], [232, 240, 246], [30, 26, 24]],
  ice:    [[34, 52, 76], [70, 98, 124], [210, 220, 228], [176, 190, 202], [120, 130, 142], [244, 247, 250], [40, 46, 56]],
  rock:   [[52, 44, 40], [70, 60, 54], [120, 98, 72], [152, 130, 96], [192, 172, 138], [222, 208, 184], [26, 22, 20]],
  irradiated: [[40, 30, 34], [60, 44, 48], [128, 84, 76], [156, 108, 92], [188, 142, 118], [214, 180, 150], [22, 16, 18]],
};
export const USABLE = t => t !== 'ocean' && t !== 'chasm';
// HABITABLE (his rule 2026-10-21): what a district can stand on. Only water forbids, and only on living and ocean worlds; an ice
// world's frozen sea is ground; a dead world's few pits are the exception. Later: radiation and more.
export const habitable = (kind, t) => t !== 'chasm' && (t !== 'ocean' || kind === 'ice');
// THE GRADES (his table, 2026-10-21): what each district is good for, 0..1 per kind, from its features. COMFORT by latitude flips with
// the world: living / ocean peak at the equator, ice too (a narrow warm belt), rock peaks in the temperate bands (the equator burns),
// an irradiated world has no comfort at all — only SHELTER (a canyon, a basin ringed by mountains) counts there.
export const DISTRICT_KINDS = ['housing', 'food', 'industry', 'science'];
export const SPECIALS = ['none', 'crater', 'geyser', 'crystal', 'anomaly'];
const comfort = (kind, lat) => kind === 'irradiated' ? 0 : kind === 'ice' ? Math.max(0, 1 - lat * 2.2) : kind === 'rock' ? Math.max(0, 1 - Math.abs(lat - 0.55) * 2.2) : 1 - Math.pow(lat, 1.5);
const clamp01 = v => Math.max(0, Math.min(1, v));
export function gradeOf(kind, f) {                   // f = one district's features (see features())
  const c = comfort(kind, f.lat), coastal = f.coast >= 1 && f.coast <= 2 ? 1 : f.coast === 3 ? 0.5 : 0, shelter = f.canyon || f.basin ? 1 : 0, dry = kind === 'rock' || kind === 'irradiated';
  const big = f.landmass >= 12 ? 1 : f.landmass >= 6 ? 0.5 : 0, lowland = f.relief === 'low' ? 1 : f.relief === 'mid' ? 0.5 : 0, high = f.relief === 'high' ? 1 : 0, polar = f.relief === 'ice' && kind !== 'ice' ? 1 : 0;
  const frozenSea = kind === 'ice' && f.nature === 'ocean' ? 1 : 0, special = f.special ? 1 : 0;
  let housing, food, industry, science;
  if (kind === 'irradiated') { housing = shelter ? 0.6 + 0.2 * f.basin : 0.03; food = shelter ? 0.3 : 0.02; industry = 0.5 + 0.3 * high + 0.2 * (f.foothill ? 1 : 0); science = 0.45 + 0.5 * special + 0.2 * high; }
  else {
    housing = 0.12 + 0.35 * c + 0.25 * coastal + 0.15 * big + 0.1 * f.lake + (dry || kind === 'ice' ? 0.4 : 0.15) * shelter - 0.5 * polar - 0.3 * (f.island ? 1 : 0) - 0.25 * high;
    if (kind === 'ice' && f.canyon) housing -= 0.5;                          // a crevice on an ice world is deadly (his call)
    food = 0.08 + 0.4 * lowland + 0.3 * c + 0.2 * f.lake + (kind === 'ocean' ? 0.3 : 0.12) * coastal + (dry ? 0.25 : 0) * (f.canyon ? 1 : 0) - 0.5 * polar - 0.35 * high;
    industry = 0.18 + 0.4 * (f.foothill ? 1 : 0) + 0.5 * high + 0.15 * (f.coast === 1 ? 1 : 0) + 0.3 * frozenSea + (dry ? 0.15 : 0) - 0.2 * polar;
    science = 0.1 + 0.5 * (f.island ? 1 : 0) + 0.6 * special + 0.3 * polar + 0.2 * high + (kind === 'ice' && f.relief === 'ice' ? 0.2 : 0);
  }
  return { housing: clamp01(housing), food: clamp01(food), industry: clamp01(industry), science: clamp01(science) };
}
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
// ---- the slots' natures: clustered by growing from a few seeds through the (wrapping) slot grid ----
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
  if (kind === 'ice') for (let k = 0; k < n; k++) if (type[k] === 'low') type[k] = 'ice';
  return type;
}
// ---- the surface ----
export function terrain(seed, w, h, kind, { cellW = 140, cellH = 70, jitter = 0.38 } = {}) {
  const W = w * cellW, H = h * cellH, N = W * H, s = hash(seed + '|' + kind), rnd = mulberry(s ^ 0x7f4a7c15), n1 = perlin(s), n2 = perlin(s ^ 0x9e3779b9);
  const w2 = w * 2, h2 = h * 2, type = assignTypes(w2, h2, kind, rnd);                            // a nature per SLOT (on the 2w × 2h slot grid)
  const subIndex = (cell, sl) => (2 * Math.floor(cell / w) + (sl >> 1)) * w2 + 2 * (cell % w) + (sl & 1);
  const J = () => (rnd() - 0.5) * 2, coef = () => Math.round(J());
  const wrapDx = dx => { dx = Math.abs(dx); return Math.min(dx, W - dx); };
  const dist = (p, x, y) => { const dx = wrapDx(x - p.x), dy = (y - p.y) * 2; return Math.sqrt(dx * dx + dy * dy); };
  // the noise fields, once per pixel
  const f1 = new Float32Array(N), f2 = new Float32Array(N), hill = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; f1[i] = fbm(n1, x / 150, y / 75); f2[i] = fbm(n2, x / 70, y / 35, 3); hill[i] = fbm(n2, x / 60, y / 30, 3); }
  const AMP = [cellH * 0.55, cellH * 0.3, cellH * 0.16], wob = (p, L, i) => (p.c1 * f1[i] + p.c2 * f2[i]) * AMP[L];
  // k-means: K seeds inside a region (its pixel list), anchored for the wrap; every seed keeps members (an empty one is re-seeded)
  const kmeans = (members, K, anchor) => {
    const rel = x => { let d = x - anchor.x; if (d > W / 2) d -= W; if (d < -W / 2) d += W; return d; };
    let pts = []; for (let q = 0; q < K; q++) { const m = members[Math.floor(rnd() * members.length)]; pts.push({ x: anchor.x + rel(m % W), y: Math.floor(m / W) }); }
    for (let it = 0; it < 5; it++) {
      const sx = new Float64Array(K), sy = new Float64Array(K), cnt = new Float64Array(K);
      for (const m of members) { const x = m % W, y = Math.floor(m / W); let b = 0, bd = 1e18; for (let q = 0; q < K; q++) { const dx = rel(x) - rel(pts[q].x), dy = (y - pts[q].y) * 2, d = dx * dx + dy * dy; if (d < bd) { bd = d; b = q; } } sx[b] += rel(x); sy[b] += y; cnt[b]++; }
      for (let q = 0; q < K; q++) { if (cnt[q]) { pts[q].x = anchor.x + sx[q] / cnt[q]; pts[q].y = sy[q] / cnt[q]; } else { const m = members[Math.floor(rnd() * members.length)]; pts[q].x = anchor.x + rel(m % W); pts[q].y = Math.floor(m / W); } }
    }
    return pts.map(p => ({ x: ((p.x % W) + W) % W, y: p.y, c1: coef(), c2: coef() }));
  };
  const membersOf = (ownerArr, count) => { const n = new Int32Array(count + 1); for (let i = 0; i < N; i++) n[ownerArr[i] + 1]++; for (let k = 0; k < count; k++) n[k + 1] += n[k]; const at = n.slice(0, count), list = new Int32Array(N); for (let i = 0; i < N; i++) list[at[ownerArr[i]]++] = i; return k => list.subarray(n[k], n[k + 1]); };
  // LEVEL 1 — the cells: heavily jittered seeds; exact and noisy owner per pixel (5 × 5 neighbourhood, wrapping)
  const seeds = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seeds.push({ x: (i + 0.5 + J() * jitter) * cellW, y: (j + 0.5 + J() * jitter * 0.8) * cellH, c1: coef(), c2: coef() });
  const owner = new Int16Array(N), ownerN = new Int16Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, gi = Math.floor(x / cellW), gj = Math.floor(y / cellH); let cell = -1, bd = 1e18, cellN = -1, bn = 1e18;
    for (let dj = -2; dj <= 2; dj++) { const cj = gj + dj; if (cj < 0 || cj >= h) continue; for (let di = -2; di <= 2; di++) { const k = cj * w + ((gi + di + w * 2) % w), d = dist(seeds[k], x, y); if (d < bd) { bd = d; cell = k; } const dn = d + wob(seeds[k], 0, i); if (dn < bn) { bn = dn; cellN = k; } } }
    owner[i] = cell; ownerN[i] = cellN; }
  // LEVEL 2 — the slots: 4 seeds clustered inside each cell's own pixels; a pixel picks among its own cell's 4 (exact) / its noisy cell's 4
  const cellMembers = membersOf(owner, w * h), subSeeds = [];
  for (let k = 0; k < w * h; k++) subSeeds.push(...kmeans(cellMembers(k), 4, seeds[k]));
  const slot = new Uint8Array(N), slotN = new Uint8Array(N), sub = new Int16Array(N), subN = new Int16Array(N);
  for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; let b = 0, bd = 1e18, bN = 0, bn = 1e18;
    for (let q = 0; q < 4; q++) { const d = dist(subSeeds[owner[i] * 4 + q], x, y); if (d < bd) { bd = d; b = q; } const p = subSeeds[ownerN[i] * 4 + q], dn = dist(p, x, y) + wob(p, 1, i); if (dn < bn) { bn = dn; bN = q; } }
    slot[i] = b; sub[i] = subIndex(owner[i], b); slotN[i] = bN; subN[i] = ownerN[i] * 4 + bN; }
  // LEVEL 3 — the detail = the districts: 4 seeds clustered inside each slot's own pixels
  const exactSlotKey = new Int32Array(N); for (let i = 0; i < N; i++) exactSlotKey[i] = owner[i] * 4 + slot[i];
  const slotPixels = membersOf(exactSlotKey, w * h * 4), detSeeds = [];
  for (let k = 0; k < w * h * 4; k++) { const m = slotPixels(k); if (m.length) detSeeds.push(...kmeans(m, 4, subSeeds[k])); else for (let q = 0; q < 4; q++) detSeeds.push({ x: subSeeds[k].x, y: subSeeds[k].y, c1: 0, c2: 0 }); }
  const det = new Int16Array(N), detN = new Int16Array(N);
  for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, k = exactSlotKey[i], kN = subN[i]; let b = 0, bd = 1e18, bN = 0, bn = 1e18;
    for (let q = 0; q < 4; q++) { const d = dist(detSeeds[k * 4 + q], x, y); if (d < bd) { bd = d; b = q; } const p = detSeeds[kN * 4 + q], dn = dist(p, x, y) + wob(p, 2, i); if (dn < bn) { bn = dn; bN = q; } }
    det[i] = k * 4 + b; detN[i] = kN * 4 + bN; }
  // the natures of the districts: the slot's, with a small seeded chance to flip; the polar caps are districts whose seed lies beyond CAP
  const FLIP = { living: { island: 0.09, lake: 0.06, bump: 0.12 }, ocean: { island: 0.07, lake: 0.04, bump: 0.1 }, ice: { island: 0.05, lake: 0.05, bump: 0.1, pit: 0.02 }, rock: { island: 0, lake: 0, bump: 0.14, pit: 0.03 }, irradiated: { island: 0, lake: 0, bump: 0.16, pit: 0.04 } }[kind];
  const dtype = []; for (let k = 0; k < w * h * 16; k++) { const cell = k >> 4, sl = (k >> 2) & 3, t = type[subIndex(cell, sl)], r = rnd(); let d = t;
    if (t === 'ocean') { if (r < FLIP.island) d = 'low'; }
    else if (t === 'chasm') { if (r < 0.1) d = 'mid'; }
    else if (r < FLIP.lake && t !== 'ice' && kind !== 'rock' && kind !== 'irradiated') d = 'ocean';
    else if (r < FLIP.lake + FLIP.bump) d = t === 'low' ? 'mid' : t === 'mid' ? 'high' : 'mid';
    else if (FLIP.pit && r < FLIP.lake + FLIP.bump + FLIP.pit) d = 'chasm';               // a dead or ice world's few lost spots
    if (kind === 'ice' && d === 'chasm' && t === 'ocean') d = t;
    const lat = Math.abs(detSeeds[k].y / H * 2 - 1) + J() * 0.04; if (lat > CAP[kind] && d !== 'chasm') d = 'ice';   // the cap: a defined area of districts
    dtype.push(d); }
  // the classes per pixel from the noisy district
  const cls = new Uint8Array(N), water = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const t = dtype[detN[i]], hv = hill[i]; let c;
    if (t === 'ocean') { c = hv > 0.34 ? CLS.shallow : CLS.deep; water[i] = 1; }
    else if (t === 'chasm') c = CLS.chasm;
    else if (t === 'ice') c = CLS.ice;
    else { c = t === 'low' ? CLS.low : t === 'mid' ? CLS.mid : CLS.high; if (hv > 0.2 && c < CLS.high) c++; else if (hv < -0.22 && c > CLS.low) c--; }
    cls[i] = c; }
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
  // per CELL: the usable share of its area (the 4-slot model still reads it); per SLOT: its nature; per DISTRICT: area + habitable
  const land = new Float32Array(w * h), area = new Float32Array(w * h);
  for (let i = 0; i < N; i++) { area[owner[i]]++; if (cls[i] >= CLS.low && cls[i] !== CLS.chasm) land[owner[i]]++; }
  for (let k = 0; k < w * h; k++) land[k] = area[k] ? land[k] / area[k] : 0;
  const slotType = Array.from({ length: w * h }, () => new Array(4)); for (let k = 0; k < type.length; k++) slotType[(Math.floor(k / w2) >> 1) * w + ((k % w2) >> 1)][((k % w2) & 1) + 2 * (Math.floor(k / w2) & 1)] = type[k];
  const dArea = new Uint32Array(dtype.length); for (let i = 0; i < N; i++) dArea[det[i]]++;
  const hab = new Uint8Array(dtype.length); for (let k = 0; k < dtype.length; k++) hab[k] = dArea[k] && habitable(kind, dtype[k]) ? 1 : 0;
  let gross = 0, net = 0; for (let k = 0; k < hab.length; k++) { if (dArea[k]) gross++; net += hab[k]; }
  const T = { w, h, W, H, cellW, cellH, kind, type, slotType, dtype, habitable: hab, dArea, cls, owner, slot, sub, det, seeds, subSeeds, detSeeds, land, gross, net, hill };
  features(T, rnd); return T;
}
// ---- the districts' FEATURES and GRADES: the graph of districts from the pixels, then coast distance, landmasses, shelter, specials ----
function features(T, rnd) {
  const { W, H, det, dtype, kind, dArea } = T, n = dtype.length, nb = Array.from({ length: n }, () => new Set()), cx = new Float64Array(n), cy = new Float64Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, d = det[i], r = det[x + 1 < W ? i + 1 : i - x], dn = det[y + 1 < H ? i + W : i]; cx[d] += x; cy[d] += y; if (r !== d) { nb[d].add(r); nb[r].add(d); } if (dn !== d) { nb[d].add(dn); nb[dn].add(d); } }
  const adj = nb.map(s => [...s]), water = k => dtype[k] === 'ocean' && kind !== 'ice', land = k => dArea[k] > 0 && !water(k) && dtype[k] !== 'chasm';
  const comp = (ok) => { const id = new Int32Array(n).fill(-1), size = []; for (let s = 0; s < n; s++) { if (id[s] >= 0 || !ok(s) || !dArea[s]) continue; const c = size.length, st = [s]; id[s] = c; let m = 0; while (st.length) { const k = st.pop(); m++; for (const q of adj[k]) if (id[q] < 0 && ok(q) && dArea[q]) { id[q] = c; st.push(q); } } size.push(m); } return { id, size }; };
  const wc = comp(water), lc = comp(land);
  const coast = new Int16Array(n).fill(99); { const q = []; for (let k = 0; k < n; k++) if (water(k) && dArea[k]) { coast[k] = 0; q.push(k); } for (let h = 0; h < q.length; h++) { const k = q[h]; for (const m of adj[k]) if (coast[m] > coast[k] + 1) { coast[m] = coast[k] + 1; q.push(m); } } }
  const f = [];
  for (let k = 0; k < n; k++) {
    const t = dtype[k], highNb = adj[k].filter(q => dtype[q] === 'high').length, lake = adj[k].some(q => water(q) && wc.size[wc.id[q]] <= 4) ? 1 : 0;
    f.push({ nature: t, relief: t === 'ocean' ? 'water' : t, lat: dArea[k] ? Math.abs(cy[k] / dArea[k] / H * 2 - 1) : 1, coast: coast[k], lake, landmass: land(k) ? lc.size[lc.id[k]] : 0, island: land(k) && lc.size[lc.id[k]] <= 6 ? 1 : 0,
      foothill: land(k) && t !== 'high' && highNb > 0 ? 1 : 0, basin: land(k) && t !== 'high' && highNb >= 3 ? 1 : 0, canyon: 0, special: 0, x: dArea[k] ? cx[k] / dArea[k] : 0, y: dArea[k] ? cy[k] / dArea[k] : 0 });
  }
  // CANYONS on dry worlds: 1–2 chains of districts walking through lowland (a crevice: shelter, shade, moisture)
  if (kind === 'rock' || kind === 'irradiated') for (let c = 0, want = 1 + Math.floor(rnd() * 2); c < want; c++) { let k = Math.floor(rnd() * n), tries = 0; while ((!land(k) || dtype[k] === 'high') && tries++ < 50) k = Math.floor(rnd() * n); if (!land(k)) continue;
    for (let step = 0, len = 3 + Math.floor(rnd() * 4); step < len; step++) { f[k].canyon = 1; const next = adj[k].filter(q => land(q) && !f[q].canyon && dtype[q] !== 'high'); if (!next.length) break; k = next[Math.floor(rnd() * next.length)]; } }
  // SPECIALS: a few rare landmarks (science pulls toward them): craters on dead and ice worlds, geysers on living and ice, crystals on rock, an anomaly anywhere
  const pool = { living: [2, 4], ocean: [4], ice: [1, 2, 4], rock: [1, 3, 4], irradiated: [1, 3, 4, 4] }[kind], want = 1 + Math.floor(rnd() * 3);
  for (let s = 0, tries = 0; s < want && tries < 200; tries++) { const k = Math.floor(rnd() * n); if (!land(k) || f[k].special) continue; f[k].special = pool[Math.floor(rnd() * pool.length)]; s++; }
  T.feat = f; T.adj = adj; T.grade = f.map(ff => gradeOf(kind, ff));
}
// ---- paint into an RGBA buffer: the classes with RELIEF (his ask 2026-10-21: "more gradient between the transitions"): on land the
// band's colour slides toward the next band by the hill noise, and a hillshade from the noise's slope (light from the upper left)
// gives the ground its topography; the water gets a gentle depth gradient; a darker coast; optional cell frames and slot lines ----
export function paint(T, rgba, { frames = true, slots = true, relief = true } = {}) {
  const { W, H, cls, owner, sub, hill } = T, pal = PALETTE[T.kind];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, c = cls[i]; let [r, g, b] = pal[c];
    const right = x + 1 < W ? i + 1 : y * W, down = y + 1 < H ? i + W : i;                               // the right edge continues at the left (wrap)
    const water = c <= CLS.shallow, wR = cls[right] <= CLS.shallow, wD = cls[down] <= CLS.shallow;
    if (relief && hill) {
      const hv = hill[i], left = x ? i - 1 : i + W - 1, up = y ? i - W : i;
      if (c >= CLS.low && c <= CLS.high) {                                                           // the band slides toward its neighbour band by the hill
        const nb = hv > 0 ? Math.min(CLS.high, c + 1) : Math.max(CLS.low, c - 1), f = Math.min(1, Math.abs(hv) * 1.6) * 0.55, q = pal[nb];
        r += (q[0] - r) * f; g += (q[1] - g) * f; b += (q[2] - b) * f;
        const sh = 1 + Math.max(-0.2, Math.min(0.2, -((hill[right] - hill[left]) + (hill[down] - hill[up])) * 5));   // hillshade
        r *= sh; g *= sh; b *= sh;
      } else if (water) { const sh = 1 + hv * 0.18; r *= sh; g *= sh; b *= sh; }
      else if (c === CLS.ice) { const sh = 1 + Math.max(-0.12, Math.min(0.12, -((hill[right] - hill[left]) + (hill[down] - hill[up])) * 3)); r *= sh; g *= sh; b *= sh; }
    }
    if (water !== wR || water !== wD) { r *= 0.55; g *= 0.6; b *= 0.65; }
    else if (!relief && (c !== cls[right] || c !== cls[down])) { r *= 0.88; g *= 0.88; b *= 0.88; }
    if (frames && (owner[i] !== owner[right] || owner[i] !== owner[down])) { r = r * 0.35 + 20; g = g * 0.35 + 24; b = b * 0.35 + 30; }
    else if (slots && (sub[i] !== sub[right] || sub[i] !== sub[down])) { r = r * 0.8 + 30; g = g * 0.8 + 32; b = b * 0.8 + 36; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
