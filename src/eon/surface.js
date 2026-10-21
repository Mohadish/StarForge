// THE COLONY SURFACE RENDERER (2026-10-21, from cluster-mock.html into the game): the planet (terrain.js) under a settled colony —
// the ground with its per-district texture, crops on the food districts, the urban grid under the cities, mountain ridges on the high
// ground, forests on the empty land, and the cluster chips that fill a district as it is built. `state` = per DISTRICT (terrain's
// detail cells): built (kind index into DISTRICT_KINDS, or -1) and fill (0..1). Everything is cached on T per scale; the caller
// re-renders only when the state key changes (hover and such are drawn on top by the caller).
import { paint, DISTRICT_KINDS, PALETTE as TPAL, CLS } from './terrain.js';
import { makeChip, drawChip, layout, cropTile, urbanTile, surfaceTile, paler } from './clusters.js';

export const LOOK = { texAlpha: 0.3, chipScale: 0.36, forestShare: 0.55, lattice: 3.5 };
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function vnoise(seed) { const r = mulberry(seed), g = new Float32Array(64 * 64); for (let i = 0; i < g.length; i++) g[i] = r(); return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, s = (a, b) => g[((b & 63) * 64) + (a & 63)], u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (s(xi, yi) * (1 - u) + s(xi + 1, yi) * u) * (1 - v) + (s(xi, yi + 1) * (1 - u) + s(xi + 1, yi + 1) * u) * v; }; }
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
// the distance (px) from each pixel to the edge of its region, regions keyed by key(i)
export function edgeDistance(T, key) { const { W, H } = T, N = W * H, d = new Float32Array(N).fill(1e9);
  for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, r = x + 1 < W ? i + 1 : i - x, dn = y + 1 < H ? i + W : i; if (key(i) !== key(r)) { d[i] = 0; d[r] = 0; } if (key(i) !== key(dn)) { d[i] = 0; d[dn] = 0; } }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, l = x ? i - 1 : i, u = y ? i - W : i; d[i] = Math.min(d[i], d[l] + 1, d[u] + 2); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x, r = x + 1 < W ? i + 1 : i, dn = y + 1 < H ? i + W : i; d[i] = Math.min(d[i], d[r] + 1, d[dn] + 2); } return d; }
// ---- what depends on the planet alone (cached on T) ----
function prep(T) {
  if (T._prep) return T._prep;
  const { W, H } = T, det = T.detJ, nD = T.dtype.length, edD = edgeDistance(T, i => det[i]);
  const spots = new Map(), SP = LOOK.lattice;                               // the chip lattice per district
  for (let y = 0; y < H; y += SP / 2) for (let x = 0; x < W; x += SP) { const xx = x + ((Math.round(y / (SP / 2)) & 1) ? SP / 2 : 0); if (xx >= W) continue; const i = Math.floor(y) * W + Math.floor(xx), k = det[i]; if (!T.dArea[k] || edD[i] < 2) continue; if (!spots.has(k)) spots.set(k, []); spots.get(k).push([xx, y]); }
  const box = Array.from({ length: nD }, () => [W, H, -1, -1]), hist = new Uint16Array(nD * 7);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, k = det[i], b = box[k]; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; hist[k * 7 + T.cls[i]]++; }
  const band = new Int8Array(nD).fill(-1); for (let k = 0; k < nD; k++) { let c = -1, best = 0; for (let q = CLS.low; q <= CLS.ice; q++) if (hist[k * 7 + q] > best) { best = hist[k * 7 + q]; c = q; } band[k] = c; }
  const rnd = mulberry(5), angle = new Float32Array(nD); for (let k = 0; k < nD; k++) angle[k] = rnd() * 360;
  const forest = new Float32Array(nD); const fr = mulberry(11); for (let k = 0; k < nD; k++) { const f = T.feat[k]; forest[k] = f && f.nature !== 'ocean' && f.nature !== 'chasm' && f.nature !== 'ice' && (T.kind === 'living' || T.kind === 'ocean') && fr() < LOOK.forestShare ? 0.4 + fr() * 0.6 : 0; }
  const land = canvas(W, H), ld = land.getContext('2d').createImageData(W, H); for (let i = 0; i < W * H; i++) if (T.cls[i] > CLS.shallow && T.cls[i] !== CLS.chasm) ld.data[i * 4 + 3] = 255; land.getContext('2d').putImageData(ld, 0, 0);
  return (T._prep = { edD, spots, box, band, angle, forest, land, ground: {}, chips: new Map() });
}
// the ground at a scale: the painted bands + the per-district texture (rotated, extended, faded, cut by the land) — cached on T
function groundLayer(T, scale) {
  const P = prep(T); if (P.ground[scale]) return P.ground[scale];
  const { W, H } = T, det = T.detJ, g0 = canvas(W, H), img = g0.getContext('2d').createImageData(W, H); paint(T, img.data, { frames: false, slots: false }); g0.getContext('2d').putImageData(img, 0, 0);
  const out = canvas(W * scale, H * scale), g = out.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(g0, 0, 0, W * scale, H * scale);
  const pal = TPAL[T.kind], tiles = {}, tileOf = c => tiles[c] || (tiles[c] = surfaceTile(c + 3, scale, paler(pal[c], 0.3), paler(pal[c === CLS.high ? CLS.low : c === CLS.ice ? CLS.shallow : Math.min(CLS.high, c + 1)], 0.15)));
  const layer = canvas(W * scale, H * scale), lg = layer.getContext('2d'), PAD = 5;
  for (let k = 0; k < T.dtype.length; k++) { const c = P.band[k]; if (c < 0 || !T.dArea[k]) continue; const [x0, y0, x1, y1] = P.box[k], bw = x1 - x0 + 1 + 2 * PAD, bh = y1 - y0 + 1 + 2 * PAD; if (bw > W / 2) continue;
    const m = canvas(bw, bh), md = m.getContext('2d').createImageData(bw, bh); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (det[y * W + x] === k) md.data[((y - y0 + PAD) * bw + (x - x0 + PAD)) * 4 + 3] = 255; m.getContext('2d').putImageData(md, 0, 0);
    const t = canvas(bw * scale, bh * scale), tg = t.getContext('2d'), pat = tg.createPattern(tileOf(c), 'repeat'); pat.setTransform(new DOMMatrix().translate(T.feat[k].x * scale - (x0 - PAD) * scale, T.feat[k].y * scale - (y0 - PAD) * scale).rotate(P.angle[k])); tg.fillStyle = pat; tg.fillRect(0, 0, t.width, t.height);
    tg.globalCompositeOperation = 'destination-in'; tg.filter = `blur(${2.2 * scale}px)`; tg.imageSmoothingEnabled = true; tg.drawImage(m, 0, 0, t.width, t.height); lg.drawImage(t, (x0 - PAD) * scale, (y0 - PAD) * scale); }
  lg.globalCompositeOperation = 'destination-in'; lg.imageSmoothingEnabled = false; lg.drawImage(P.land, 0, 0, layer.width, layer.height);
  g.globalAlpha = LOOK.texAlpha; g.drawImage(layer, 0, 0); g.globalAlpha = 1;
  return (P.ground[scale] = out);
}
export const stateKey = state => { let s = ''; for (let k = 0; k < state.built.length; k++) if (state.built[k] >= 0) s += k + ':' + state.built[k] + ':' + Math.round(state.fill[k] * 20) + ','; return s; };
// ---- the whole picture for a state: ground, crops, urban grid, chips — a fresh canvas ----
export function renderColony(T, state, scale, { faction = '#9fe8c4' } = {}) {
  const P = prep(T), { W, H } = T, det = T.detJ, { built, fill } = state, foodId = DISTRICT_KINDS.indexOf('food'), out = canvas(W * scale, H * scale), g = out.getContext('2d');
  g.drawImage(groundLayer(T, scale), 0, 0);
  const edK = edgeDistance(T, i => built[det[i]]), nz = vnoise(1);
  // the crops: a soft mask (feather at the edge, holes while the district is young) over the food districts
  const mask = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, k = det[i]; if (built[k] !== foodId) continue; const holes = nz(x / 9, y / 4.5), keep = 0.5 * (1 - fill[k]); if (holes < keep) continue; mask.data[i * 4 + 3] = Math.round(255 * Math.min(1, edK[i] / 3) * Math.min(1, (holes - keep + 0.05) / 0.12)); }
  const mc = canvas(W, H); mc.getContext('2d').putImageData(mask, 0, 0);
  const fc = canvas(W * scale, H * scale), fg = fc.getContext('2d'); fg.fillStyle = fg.createPattern(cropTile(1, scale), 'repeat'); fg.fillRect(0, 0, fc.width, fc.height); fg.globalCompositeOperation = 'destination-in'; fg.imageSmoothingEnabled = true; fg.drawImage(mc, 0, 0, fc.width, fc.height); g.drawImage(fc, 0, 0);
  // the urban grid, sharp on the jagged outline, under the city / industry / science districts
  const um = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, k = det[i], b = built[k]; if (b < 0 || b === foodId) continue; um.data[i * 4 + 3] = Math.round(255 * 0.85 * Math.min(1, 0.35 + fill[k])); }
  const umc = canvas(W, H); umc.getContext('2d').putImageData(um, 0, 0);
  const uc = canvas(W * scale, H * scale), ug = uc.getContext('2d'); ug.fillStyle = ug.createPattern(urbanTile(2, scale), 'repeat'); ug.fillRect(0, 0, uc.width, uc.height); ug.globalCompositeOperation = 'destination-in'; ug.imageSmoothingEnabled = false; ug.drawImage(umc, 0, 0, uc.width, uc.height); g.drawImage(uc, 0, 0);
  // the chips: buildings in the built districts (by fill), ridges on the high ground, forests on the empty lowland
  const all = [], chip = (kind, variant, seed) => { const key = kind + variant + ':' + seed; let c = P.chips.get(key); if (!c) { c = makeChip(kind, variant, seed); P.chips.set(key, c); } return c; };
  for (const [k, spots] of P.spots) { const f = T.feat[k], b = built[k];
    if (b >= 0 && b !== foodId && fill[k] > 0) { const dk = DISTRICT_KINDS[b], cap = Math.max(3, Math.min(9, Math.round(spots.length / 3))); layout(spots, [f.x, f.y], fill[k], { cap, gap: 4.5 }).forEach((p, i) => all.push({ ...p, chip: chip(dk, p.variant, k * 7 + i), dk })); }
    if (f.nature === 'high') layout(spots, [f.x, f.y], 1, { cap: b >= 0 ? 2 : 4, gap: 6 }).forEach((p, i) => all.push({ ...p, chip: chip('ridge', p.variant, k * 5 + i), dk: 'ridge' }));
    else if (b < 0 && P.forest[k] > 0) layout(spots, [f.x, f.y], P.forest[k], { cap: 6, gap: 4 }).forEach((p, i) => all.push({ ...p, chip: chip('forest', p.variant, k * 3 + i), dk: 'forest' })); }
  all.sort((p, q) => p.y - q.y).forEach(p => drawChip(g, p.chip, p.x * scale, p.y * scale, scale * LOOK.chipScale, { tint: p.dk === 'housing' ? faction : null }));
  return out;
}
// ---- the model's surface → the districts' state: a cell's slot s (kind, built fraction b) lights up its 4 districts in overlapping
// stages (the first is done when the slot is 40 % built, the last starts at 60 %); a district that is not habitable stays empty ----
export function stateFromSurface(G, T, bOf) {
  const n = T.dtype.length, built = new Int8Array(n).fill(-1), fill = new Float32Array(n);
  G.cells.forEach((cell, c) => { for (let s = 0; s < 4; s++) { const kind = cell.slots[s]; if (!kind) continue; const b = bOf(cell, s), ki = DISTRICT_KINDS.indexOf(kind); if (ki < 0) continue;
    for (let d = 0; d < 4; d++) { const k = (c * 4 + s) * 4 + d; if (!T.habitable[k]) continue; const f = Math.max(0, Math.min(1, (b - d * 0.2) / 0.4)); if (f <= 0) continue; built[k] = ki; fill[k] = f; } } });
  return { built, fill };
}
