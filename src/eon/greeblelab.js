// THE GREEBLE LAB (his ask, 2026-10-24: "go through the images you already have and start creating little greeble assets — not for
// anything specific… and try a 3D isometric look for tech assets: generators, shields, farms, industries — flavour art"). Two halves:
// · THE STOCK — every style's parts (styles.js) cut from their sheets: the whole pieces (fittings, mounts, engines, turrets) trimmed to
//   their ink, PANELS and BANDS cut from the plating strip (solid, busy stretches), and BITS — small solid, busy crops out of the pieces.
//   Chosen by two numbers read off the pixels: how solid (alpha coverage) and how busy (the spread of the grey). The catalog (rects in
//   sheet pixels) is the asset list; the art stays on its sheets.
// · THE ISOMETRIC LAB — the same stock dressing 3D blocks: walls in the style's plating, roofs in its top-down pieces (they were
//   drawn from above — on a roof they read right), cylinders wrapped in a band and capped with a mount ring, domes of glass, a glowing
//   core; shaded per face and washed in a colour. A building is a few blocks laid by a seeded recipe (generator, shield, farm, works,
//   lab, homes). A first try — to see whether the style survives the turn to isometric.
import { STYLES } from './styles.js';

const loadImg = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('no image ' + url)); i.src = url; });
const SHEETS = new Map();                       // url → { img, data (ImageData), w, h }
async function sheet(url) {
  if (SHEETS.has(url)) return SHEETS.get(url);
  const img = await loadImg(url), cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const s = { url, img, cv, data: g.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height }; SHEETS.set(url, s); return s;
}
// the ink's box inside a rect (alpha above 16)
function trim(S, x, y, w, h) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let yy = Math.max(0, y); yy < Math.min(S.h, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(S.w, x + w); xx++) if (S.data[(yy * S.w + xx) * 4 + 3] > 16) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// how solid and how busy a rect is: the share of opaque pixels, and the spread of the grey over them (0 … ~0.35)
function measure(S, x, y, w, h, step = 3) {
  let n = 0, op = 0, s = 0, s2 = 0;
  for (let yy = y; yy < y + h; yy += step) for (let xx = x; xx < x + w; xx += step) {
    if (xx < 0 || yy < 0 || xx >= S.w || yy >= S.h) { n++; continue; }
    const i = (yy * S.w + xx) * 4; n++; if (S.data[i + 3] < 200) continue; op++; const L = (S.data[i] * 0.3 + S.data[i + 1] * 0.59 + S.data[i + 2] * 0.11) / 255; s += L; s2 += L * L;
  }
  const m = op ? s / op : 0; return { cover: n ? op / n : 0, busy: op ? Math.sqrt(Math.max(0, s2 / op - m * m)) : 0 };
}
// the best non-overlapping rects of a list, by score, at most n
function pickApart(list, n) { const out = []; for (const r of list.sort((a, b) => b.score - a.score)) { if (out.length >= n) break; if (out.some(o => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h)) continue; out.push(r); } return out; }
// THE STOCK of one style: { pieces: [{ kind, url, x, y, w, h }] } — whole parts, panels and bands off the strip, bits out of the parts
export async function stockOf(styleId) {
  const st = STYLES[styleId]; if (!st) return null;
  const out = [], add = (kind, url, r) => { if (r && r.w > 6 && r.h > 6) out.push({ kind, style: styleId, url, x: r.x, y: r.y, w: r.w, h: r.h }); };
  const main = await sheet(st.sheet);
  const whole = [];
  if (st.deco) {
    const sh = await Promise.all(st.deco.sheets.map(sheet));
    for (const g of st.deco.greebles) { const S = sh[g[4] || 0], r = trim(S, g[0], g[1], g[2], g[3]); add('fitting', S.url, r); if (r) whole.push({ S, r }); }
    for (const m of st.deco.mounts) { const S = sh[0], r = trim(S, m[0], m[1], m[2], m[3]); add('mount', S.url, r); if (r) whole.push({ S, r }); }
  }
  for (const e of st.engines || []) { const r = trim(main, e.x, e.y, e.w, e.h); add('engine', main.url, r); if (r) whole.push({ S: main, r }); }
  if (st.turrets) { const T = await sheet(st.turrets.sheet); for (const c of st.turrets.cells) add('turret', T.url, trim(T, c[0], c[1], c[2], c[3])); }
  // the strip: square PANELS (a wall's worth) and wide BANDS (its middle, for wrapping a cylinder) — solid and busy stretches
  for (const R of st.ribbons || [st.ribbon]) {
    const h = R.h, panels = [], bands = [], bh = Math.round(h * 0.56), by = R.y + Math.round(h * 0.22);
    for (let x = R.x; x + h <= R.x + R.w; x += Math.round(h / 3)) { const m = measure(main, x, R.y, h, h); if (m.cover > 0.8) panels.push({ x, y: R.y, w: h, h, score: m.busy * m.cover }); }
    for (let x = R.x; x + 2 * bh <= R.x + R.w; x += Math.round(bh / 2)) { const m = measure(main, x, by, 2 * bh, bh); if (m.cover > 0.9) bands.push({ x, y: by, w: 2 * bh, h: bh, score: m.busy * m.cover }); }
    for (const r of pickApart(panels, 6)) add('panel', main.url, r);
    for (const r of pickApart(bands, 4)) add('band', main.url, r);
  }
  // BITS: small solid, busy crops out of the whole parts — little plates of detail, good for anything
  for (const { S, r } of whole) {
    const cand = [];
    for (const k of [0.42, 0.28]) { const s = Math.round(Math.min(r.w, r.h) * k); if (s < 24) continue; const step = Math.max(6, Math.round(s / 3));
      for (let y = r.y; y + s <= r.y + r.h; y += step) for (let x = r.x; x + s <= r.x + r.w; x += step) { const m = measure(S, x, y, s, s); if (m.cover > 0.96 && m.busy > 0.11) cand.push({ x, y, w: s, h: s, score: m.busy + k * 0.2 }); } }
    for (const b of pickApart(cand, 2)) add('bit', S.url, b);
  }
  return { style: styleId, name: st.name, pieces: out };
}
// a piece on its own canvas (tinted later by the caller)
export function pieceCanvas(p, scale = 1) {
  const S = SHEETS.get(p.url); const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(p.w * scale)); cv.height = Math.max(1, Math.round(p.h * scale));
  cv.getContext('2d').drawImage(S.img, p.x, p.y, p.w, p.h, 0, 0, cv.width, cv.height); return cv;
}

// ---------------------------------------------------------------- THE ISOMETRIC LAB
// world: x to the lower right, y to the lower left, z up; one unit = U px across. iso() → screen px
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
function rnd(seed) { let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } let s = h >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const ARCHETYPES = {
  generator: { name: 'Generator', tint: '#ffcf5a', glow: '#ffd84f' },
  shield:    { name: 'Shield emitter', tint: '#b98cff', glow: '#cf89ff' },
  farm:      { name: 'Farm', tint: '#86d46a', glow: '#b6f08a' },
  works:     { name: 'Industry', tint: '#ff9f4a', glow: '#ffb347' },
  lab:       { name: 'Research lab', tint: '#5fa8ff', glow: '#7fd8ff' },
  homes:     { name: 'Homes', tint: '#f5a3c7', glow: '#ffe6a8' },
};
// THE RECIPES: a building as a list of solids, seeded — box { x y z w d h roof wall }, cyl { x y z r h }, dome { x y z r glass }, core { x y z r }
function recipe(kind, R, stock) {
  const pick = list => list.length ? list[Math.floor(R() * list.length)] : null, B = [], fit = () => pick(stock.roof), wall = () => pick(stock.wall), band = () => pick(stock.band), ring = () => pick(stock.ring);
  const box = (x, y, z, w, d, h, o = {}) => B.push({ t: 'box', x, y, z, w, d, h, roof: o.roof === undefined ? fit() : o.roof, wall: o.wall || wall(), ...o });
  const cyl = (x, y, z, r, h, o = {}) => B.push({ t: 'cyl', x, y, z, r, h, band: o.band || band(), cap: o.cap === undefined ? ring() : o.cap, ...o });
  const v = (a, b) => a + (b - a) * R();
  if (kind === 'generator') {
    box(0, 0, 0, 4, 4, 0.5);
    const r = v(1.1, 1.5), h = v(1.2, 2.2); cyl(2, 2, 0.5, r, h); cyl(2, 2, 0.5 + h, r * 1.12, 0.22);
    B.push({ t: 'core', x: 2, y: 2, z: 0.5 + h + 0.22 + r * 0.55, r: r * 0.62 });
    for (const [x, y] of [[0.2, 0.2], [3.1, 0.2], [0.2, 3.1]]) if (R() < 0.85) box(x, y, 0.5, 0.7, 0.7, v(0.4, 0.9));
  } else if (kind === 'shield') {
    box(0.5, 0.5, 0, 3, 3, 0.45); const h = v(2.2, 3.2); cyl(2, 2, 0.45, 0.42, h); cyl(2, 2, 0.45 + h, v(1, 1.3), 0.16);
    B.push({ t: 'core', x: 2, y: 2, z: 0.45 + h + 0.5, r: 0.32 });
    for (const [x, y] of [[0.7, 0.7], [2.8, 0.7], [0.7, 2.8]]) box(x, y, 0.45, 0.5, 0.5, v(0.5, 0.9));
    B.push({ t: 'dome', x: 2, y: 2, z: 0, r: 2.6, glass: true, last: true });
  } else if (kind === 'farm') {
    for (let i = 0; i < 3; i++) box(i * 1.35, 0, 0, 1.25, 4, 0.18 + i * 0.12, { roof: 'field', wall: wall() });
    B.push({ t: 'dome', x: 4.6, y: 1.1, z: 0, r: v(0.8, 1.1), glass: true }); B.push({ t: 'dome', x: 4.7, y: 3.1, z: 0, r: v(0.6, 0.9), glass: true });
    cyl(5.4, 0.2, 0, 0.42, v(1.2, 1.8));
  } else if (kind === 'works') {
    const h1 = v(1, 1.8), h2 = v(0.6, 1.2); box(0, 0, 0, 2.6, 2.2, h1); box(2.8, 0.3, 0, 2, 1.8, h2); box(0.6, 2.5, 0, 3, 1.5, v(0.5, 0.9));
    const n = 2 + Math.floor(R() * 2); for (let i = 0; i < n; i++) cyl(0.5 + i * 0.75, 0.5, h1, 0.22, v(0.9, 1.6), { smoke: true });
    box(2.5, 1.0, h2 * 0.8, 0.5, 0.3, 0.25, { roof: null });   // a pipe bridge
  } else if (kind === 'lab') {
    box(0, 0, 0, 3.4, 3.4, 0.7); B.push({ t: 'dome', x: 1.7, y: 1.7, z: 0.7, r: v(1.1, 1.45), glass: true, white: true });
    cyl(3.0, 0.4, 0.7, 0.14, v(1.6, 2.4), { cap: null }); cyl(3.0, 0.4, 0.7 + 2, 0.55, 0.08);
    if (R() < 0.7) box(-1.2, 1.0, 0, 1.0, 1.4, 0.5);
  } else {   // homes: towers with set-backs, lit windows
    const n = 2 + Math.floor(R() * 2); for (let i = 0; i < n; i++) { const x = i * 1.6, h = v(1.6, 3.2); box(x, 0, 0, 1.4, 1.4, h, { windows: true }); box(x + 0.2, 0.2, h, 1.0, 1.0, v(0.4, 0.9), { windows: true }); }
  }
  return B;
}
// draw a source image onto the parallelogram P0 + s·U + t·V (s, t in 0…1), clipped, then shaded
function face(g, src, P0, U, V, shade, sx = 0, sy = 0, sw = null, sh = null, base = '#2a3142') {
  g.save(); g.beginPath(); g.moveTo(P0[0], P0[1]); g.lineTo(P0[0] + U[0], P0[1] + U[1]); g.lineTo(P0[0] + U[0] + V[0], P0[1] + U[1] + V[1]); g.lineTo(P0[0] + V[0], P0[1] + V[1]); g.closePath();
  g.fillStyle = base; g.fill(); g.clip();
  if (src) { const w = sw ?? src.width, h = sh ?? src.height; g.setTransform(...curT(g, [U[0] / w, U[1] / w, V[0] / h, V[1] / h, P0[0], P0[1]])); g.drawImage(src, sx, sy, w, h, 0, 0, w, h); }
  g.restore(); g.save(); g.beginPath(); g.moveTo(P0[0], P0[1]); g.lineTo(P0[0] + U[0], P0[1] + U[1]); g.lineTo(P0[0] + U[0] + V[0], P0[1] + U[1] + V[1]); g.lineTo(P0[0] + V[0], P0[1] + V[1]); g.closePath();
  if (shade) { g.fillStyle = `rgba(0,0,0,${shade})`; g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1; g.stroke(); g.restore();
}
const curT = (g, m) => { const t = g.getTransform(); return [t.a * m[0] + t.c * m[1], t.b * m[0] + t.d * m[1], t.a * m[2] + t.c * m[3], t.b * m[2] + t.d * m[3], t.a * m[4] + t.c * m[5] + t.e, t.b * m[4] + t.d * m[5] + t.f]; };
// a field: tiny tiled rows (his colony rule: fields are a tiny tiled texture)
let FIELD = null;
function fieldTex() { if (FIELD) return FIELD; const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.fillStyle = '#4b5a2e'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#6f8a3a' : '#5a7230'; g.fillRect(0, i * 4, 64, 3); for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(190,230,120,.35)'; g.fillRect((k * 7 + i * 3) % 64, i * 4, 2, 2); } } FIELD = cv; return cv; }
// the building, drawn grey on its own canvas, then washed in its colour
export function drawBuilding(kind, styleStock, { seed = 1, U = 34, tint = true } = {}) {
  const R = rnd(kind + ':' + seed + ':' + styleStock.style), A = ARCHETYPES[kind] || ARCHETYPES.generator;
  const by = k => styleStock.pieces.filter(p => p.kind === k), cvOf = p => p ? (p._cv || (p._cv = pieceCanvas(p))) : null;
  const roofs = [...by('fitting'), ...by('bit')], walls = [...by('panel'), ...by('bit')], bands = by('band').length ? by('band') : by('panel'), rings = by('mount').length ? by('mount') : by('fitting');
  const stock = { roof: roofs.map(cvOf), wall: walls.map(cvOf), band: bands.map(cvOf), ring: rings.map(cvOf) };
  const B = recipe(kind, R, stock);
  // the frame: fit every solid's corners
  const Z = U * 0.95, iso0 = (x, y, z) => [(x - y) * C30 * U, (x + y) * S30 * U - z * Z];
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity; const grow = (x, y, z) => { const [a, b] = iso0(x, y, z); mnx = Math.min(mnx, a); mxx = Math.max(mxx, a); mny = Math.min(mny, b); mxy = Math.max(mxy, b); };
  for (const s of B) { const r = s.r || 0, x0 = s.t === 'box' ? s.x : s.x - r, y0 = s.t === 'box' ? s.y : s.y - r, x1 = s.t === 'box' ? s.x + s.w : s.x + r, y1 = s.t === 'box' ? s.y + s.d : s.y + r, z1 = s.z + (s.h || 0) + (s.t === 'dome' || s.t === 'core' ? r : 0) + (s.smoke ? 1.2 : 0);
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [s.z, z1]) grow(x, y, z); }
  const pad = 14, W = Math.ceil(mxx - mnx + 2 * pad), H = Math.ceil(mxy - mny + 2 * pad), ox = pad - mnx, oy = pad - mny;
  const iso = (x, y, z) => { const [a, b] = iso0(x, y, z); return [a + ox, b + oy]; }, sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  // the ground's shadow
  g.fillStyle = 'rgba(0,0,0,.35)'; for (const s of B) if (!s.z && s.t !== 'dome') { g.beginPath(); if (s.t === 'box') { const a = iso(s.x - 0.15, s.y + 0.1, 0), b = iso(s.x + s.w + 0.25, s.y + 0.1, 0), c = iso(s.x + s.w + 0.25, s.y + s.d + 0.35, 0), d = iso(s.x - 0.15, s.y + s.d + 0.35, 0); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); } else { const [cx, cy] = iso(s.x + 0.15, s.y + 0.2, 0); g.ellipse(cx, cy, s.r * C30 * U * 1.5, s.r * S30 * U * 1.5, 0, 0, 7); } g.fill(); }
  // back to front: by the depth of the footprint's centre (what stands ON a block shares its centre, so it comes after it, by height)
  const depth = s => s.t === 'box' ? s.x + s.w / 2 + s.y + s.d / 2 : s.x + s.y, band = s => Math.round(depth(s) * 2) / 2;
  const order = B.slice().sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0) || band(a) - band(b) || a.z - b.z || depth(a) - depth(b));
  for (const s of order) {
    if (s.t === 'box') {
      const z1 = s.z + s.h, T0 = iso(s.x, s.y, z1), Tx = iso(s.x + s.w, s.y, z1), Ty = iso(s.x, s.y + s.d, z1);
      const wall = s.wall, fx = iso(s.x + s.w, s.y, z1), fy = iso(s.x, s.y + s.d, z1);
      face(g, wall, fy, sub(iso(s.x + s.w, s.y + s.d, z1), fy), sub(iso(s.x, s.y + s.d, s.z), fy), 0.18);          // the lower-left wall (the light side)
      face(g, wall, fx, sub(iso(s.x + s.w, s.y + s.d, z1), fx), sub(iso(s.x + s.w, s.y, s.z), fx), 0.42);          // the lower-right wall
      if (s.windows) for (const [P, Q, D] of [[fy, iso(s.x + s.w, s.y + s.d, z1), iso(s.x, s.y + s.d, s.z)], [fx, iso(s.x + s.w, s.y + s.d, z1), iso(s.x + s.w, s.y, s.z)]]) {   // lit windows
        const u = sub(Q, P), v = sub(D, P), nu = Math.max(2, Math.round(Math.hypot(...u) / 9)), nv = Math.max(1, Math.round(Math.hypot(...v) / 12));
        for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) if (R() < 0.55) { const a = (i + 0.35) / nu, b = (j + 0.4) / nv; g.fillStyle = R() < 0.2 ? 'rgba(255,240,190,.95)' : 'rgba(255,214,140,.7)'; g.fillRect(P[0] + u[0] * a + v[0] * b - 1.5, P[1] + u[1] * a + v[1] * b - 1, 3, 2); }
      }
      if (s.roof === 'field') face(g, fieldTex(), T0, sub(Tx, T0), sub(Ty, T0), 0, 0, 0, 64, 64 * s.d / s.w, '#4b5a2e');
      else { face(g, s.wall, T0, sub(Tx, T0), sub(Ty, T0), 0.05, 0, 0, null, null, '#3a4256');
        if (s.roof) { const k = 0.82, w = s.w * k, d = s.d * k, ar = s.roof.width / s.roof.height, ww = Math.min(w, d * ar), dd = ww / ar, x0 = s.x + (s.w - ww) / 2, y0 = s.y + (s.d - dd) / 2, P0 = iso(x0, y0, z1);   // a top-down piece laid on the roof, kept to its own shape
          g.save(); g.setTransform(...curT(g, [(iso(x0 + ww, y0, z1)[0] - P0[0]) / s.roof.width, (iso(x0 + ww, y0, z1)[1] - P0[1]) / s.roof.width, (iso(x0, y0 + dd, z1)[0] - P0[0]) / s.roof.height, (iso(x0, y0 + dd, z1)[1] - P0[1]) / s.roof.height, P0[0], P0[1]])); g.drawImage(s.roof, 0, 0); g.restore(); } }
    } else if (s.t === 'cyl') {
      const [cx, cyb] = iso(s.x, s.y, s.z), cyt = iso(s.x, s.y, s.z + s.h)[1], rx = s.r * Math.SQRT2 * C30 * U, ry = s.r * Math.SQRT2 * S30 * U, src = s.band, n = Math.max(8, Math.ceil(rx * 2));
      for (let i = 0; i < n; i++) {                                                     // the wall, column by column: the band wrapped round, shaded by its turn from the light
        const a0 = -1 + 2 * i / n, a1 = -1 + 2 * (i + 1) / n, xa = cx + a0 * rx, xb = cx + a1 * rx, am = (a0 + a1) / 2, yb = ry * Math.sqrt(Math.max(0, 1 - am * am));
        if (src) { const u = (Math.asin(Math.max(-1, Math.min(1, am))) / Math.PI + 0.5) * src.width; g.drawImage(src, Math.min(src.width - 1, u), 0, 1, src.height, xa, cyt + yb, xb - xa + 0.6, cyb - cyt); }
        else { g.fillStyle = '#3a4256'; g.fillRect(xa, cyt + yb, xb - xa + 0.6, cyb - cyt); }
        g.fillStyle = `rgba(0,0,0,${(0.12 + 0.45 * (am + 1) / 2).toFixed(3)})`; g.fillRect(xa, cyt + yb, xb - xa + 0.6, cyb - cyt);
      }
      g.save(); g.beginPath(); g.ellipse(cx, cyt, rx, ry, 0, 0, 7); g.fillStyle = '#3a4256'; g.fill(); g.clip();          // the cap: a mount ring laid flat
      if (s.cap) { const P0 = iso(s.x - s.r, s.y - s.r, s.z + s.h); g.setTransform(...curT(g, [(iso(s.x + s.r, s.y - s.r, s.z + s.h)[0] - P0[0]) / s.cap.width, (iso(s.x + s.r, s.y - s.r, s.z + s.h)[1] - P0[1]) / s.cap.width, (iso(s.x - s.r, s.y + s.r, s.z + s.h)[0] - P0[0]) / s.cap.height, (iso(s.x - s.r, s.y + s.r, s.z + s.h)[1] - P0[1]) / s.cap.height, P0[0], P0[1]])); g.drawImage(s.cap, 0, 0); }
      g.restore(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.ellipse(cx, cyt, rx, ry, 0, 0, 7); g.stroke();
      if (s.smoke) for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(200,205,215,${0.22 - k * 0.05})`; g.beginPath(); g.arc(cx + k * 5, cyt - 8 - k * 9, 5 + k * 3, 0, 7); g.fill(); }
    } else if (s.t === 'dome') {
      const [cx, cy] = iso(s.x, s.y, s.z), rx = s.r * Math.SQRT2 * C30 * U, ry = s.r * Math.SQRT2 * S30 * U, rz = s.r * Z, gl = s.white ? '230,244,255' : (A.glow.match(/\w\w/g) || []).map(h => parseInt(h, 16)).join(',');
      g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); g.ellipse(cx, cy, rx, rz, 0, Math.PI, 0, false); g.closePath();
      const gr = g.createRadialGradient(cx - rx * 0.35, cy - rz * 0.55, rx * 0.05, cx, cy - rz * 0.3, rx * 1.1); gr.addColorStop(0, `rgba(255,255,255,${s.last ? 0.22 : 0.55})`); gr.addColorStop(0.35, `rgba(${gl},${s.last ? 0.12 : 0.28})`); gr.addColorStop(1, `rgba(${gl},${s.last ? 0.2 : 0.45})`);
      g.fillStyle = gr; g.fill(); g.strokeStyle = `rgba(${gl},${s.last ? 0.55 : 0.8})`; g.lineWidth = 1.2; g.stroke();
      if (!s.last) { g.clip(); g.strokeStyle = 'rgba(255,255,255,.18)'; for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(cx, cy - rz * k / 4, rx * Math.sqrt(1 - (k / 4) ** 2), ry * Math.sqrt(1 - (k / 4) ** 2), 0, 0, 7); g.stroke(); } }   // the glass's ribs
      g.restore();
    } else if (s.t === 'core') {
      const [cx, cy] = iso(s.x, s.y, s.z), r = s.r * U * 0.95, gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2), c = (A.glow.match(/\w\w/g) || []).map(h => parseInt(h, 16)).join(',');
      gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.3, `rgba(${c},.95)`); gr.addColorStop(0.55, `rgba(${c},.35)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r * 2.2, 0, 7); g.fill();
    }
  }
  if (!tint) return cv;
  // the wash: the building's colour over its greys (the glows and the glass keep theirs — they were coloured already)
  const out = document.createElement('canvas'); out.width = W; out.height = H; const o = out.getContext('2d');
  o.drawImage(cv, 0, 0); o.globalCompositeOperation = 'color'; o.globalAlpha = 0.55; o.fillStyle = A.tint; o.fillRect(0, 0, W, H); o.globalAlpha = 1; o.globalCompositeOperation = 'destination-in'; o.drawImage(cv, 0, 0); o.globalCompositeOperation = 'source-over';
  return out;
}
export const styleIds = () => Object.keys(STYLES).filter(id => STYLES[id].deco);
