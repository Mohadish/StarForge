// THE GREEBLE LAB (his ask, 2026-10-24: "go through the images you already have and start creating little greeble assets — not for
// anything specific… and try a 3D isometric look for tech assets: generators, shields, farms, industries — flavour art"). Two halves:
// · THE STOCK — every style's parts (styles.js) cut from their sheets: the whole pieces (fittings, mounts, engines, turrets) trimmed to
//   their ink, PANELS and BANDS cut from the plating strip (solid, busy stretches); TILES are whole fittings layered (stockSet).
//   Chosen by two numbers read off the pixels: how solid (alpha coverage) and how busy (the spread of the grey). The catalog (rects in
//   sheet pixels) is the asset list; the art stays on its sheets.
// · THE ISOMETRIC LAB — the same stock dressing 3D blocks: walls in the style's plating, roofs in its top-down pieces (they were
//   drawn from above — on a roof they read right), cylinders wrapped in a band and capped with a mount ring, domes of glass, a glowing
//   core; shaded per face and washed in a colour. A building is a few blocks laid by a seeded recipe (generator, shield, farm, works,
//   lab, homes). A first try — to see whether the style survives the turn to isometric.
import { STYLES } from './styles.js';
import { levelColor, icon as ticon, ICON_COLOR } from './techicons.js';

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
  return { style: styleId, name: st.name, pieces: out };
}
// a piece on its own canvas (tinted later by the caller)
export function pieceCanvas(p, scale = 1) {
  const S = SHEETS.get(p.url); const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(p.w * scale)); cv.height = Math.max(1, Math.round(p.h * scale));
  cv.getContext('2d').drawImage(S.img, p.x, p.y, p.w, p.h, 0, 0, cv.width, cv.height); return p.tone ? toned(cv, p.tone) : cv;
}
// a grey piece in a colour (the 'color' blend: the art's light and dark stay, the colour is the tone's) — its alpha kept
export function toned(cv, tone, a = 0.62) {
  const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height; const g = o.getContext('2d');
  g.drawImage(cv, 0, 0); g.globalCompositeOperation = 'color'; g.globalAlpha = a; g.fillStyle = tone; g.fillRect(0, 0, o.width, o.height); g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.drawImage(cv, 0, 0); return o;
}
// MIXING STYLES (his idea, 2026-10-25: "mix two styles together… a random assignment of both ribbons and greebles… each style its own
// colour, a multi-tone"): both stocks as one, every piece keeping its own style's tone — no new art
export function mixStock(stocks, tones = []) {
  const pieces = stocks.flatMap((st, i) => st.pieces.map(p => ({ ...p, _cv: undefined, tone: tones[i] || null })));
  return { style: stocks.map(x => x.style).join('+'), name: stocks.map(x => x.name).join(' + '), pieces, mixed: stocks.length > 1 };
}

// ---------------------------------------------------------------- THE ISOMETRIC LAB
// world: x and y on the ground, z up; one unit = U px across; the view turns about the object's centre by `yaw` (a turntable). Every
// solid is drawn from the stock: walls in the plating, roofs in the top-down pieces, cylinders wrapped in a band and capped with a ring
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
function rnd(seed) { let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } let s = h >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rgb = hex => (String(hex).match(/[0-9a-f]{2}/gi) || ['ff', 'ff', 'ff']).slice(0, 3).map(h => parseInt(h, 16)).join(',');
const curT = (g, m) => { const t = g.getTransform(); return [t.a * m[0] + t.c * m[1], t.b * m[0] + t.d * m[1], t.a * m[2] + t.c * m[3], t.b * m[2] + t.d * m[3], t.a * m[4] + t.c * m[5] + t.e, t.b * m[4] + t.d * m[5] + t.f]; };
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
// draw a source image onto the parallelogram P0 + s·U + t·V, clipped, then shaded
function face(g, src, P0, U, V, shade, sx = 0, sy = 0, sw = null, sh = null, base = '#2a3142') {
  const path = () => { g.beginPath(); g.moveTo(P0[0], P0[1]); g.lineTo(P0[0] + U[0], P0[1] + U[1]); g.lineTo(P0[0] + U[0] + V[0], P0[1] + U[1] + V[1]); g.lineTo(P0[0] + V[0], P0[1] + V[1]); g.closePath(); };
  g.save(); path(); g.fillStyle = base; g.fill(); g.clip();
  if (src) { const w = sw ?? src.width, h = sh ?? src.height; g.setTransform(...curT(g, [U[0] / w, U[1] / w, V[0] / h, V[1] / h, P0[0], P0[1]])); g.drawImage(src, sx, sy, w, h, 0, 0, w, h); }
  g.restore(); g.save(); path(); if (shade > 0) { g.fillStyle = `rgba(0,0,0,${shade.toFixed(3)})`; g.fill(); } else if (shade < 0) { g.fillStyle = `rgba(255,255,255,${(-shade).toFixed(3)})`; g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1; g.stroke(); g.restore();
}
// a field: tiny tiled rows (his colony rule: fields are a tiny tiled texture)
let FIELD = null;
function fieldTex() { if (FIELD) return FIELD; const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.fillStyle = '#4b5a2e'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#6f8a3a' : '#5a7230'; g.fillRect(0, i * 4, 64, 3); for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(190,230,120,.35)'; g.fillRect((k * 7 + i * 3) % 64, i * 4, 2, 2); } } FIELD = cv; return cv; }
// a piece turned by quarter turns (clockwise), kept — a horizontal greeble stood up is a pillar; an engine turned exhaust-down, a foot
const ROT = new WeakMap();
function rotq(img, q) {
  q = ((q % 4) + 4) % 4; if (!img || !q) return img; let m = ROT.get(img); if (!m) ROT.set(img, (m = {})); if (m[q]) return m[q];
  const cv = document.createElement('canvas'), w = img.width, h = img.height; cv.width = q % 2 ? h : w; cv.height = q % 2 ? w : h;
  const g = cv.getContext('2d'); g.translate(cv.width / 2, cv.height / 2); g.rotate(q * Math.PI / 2); g.drawImage(img, -w / 2, -h / 2); return (m[q] = cv);
}
// a piece darkened by k (its alpha kept), kept by tenths — a card's shade
const SHD = new WeakMap();
function shaded(img, k) {
  const b = Math.max(0, Math.min(9, Math.round(k * 10))); if (!b) return img; let m = SHD.get(img); if (!m) SHD.set(img, (m = {})); if (m[b]) return m[b];
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(0,0,0,${b / 10})`; g.fillRect(0, 0, cv.width, cv.height); return (m[b] = cv);
}
// TILES (his ask: "layers of the fittings, oriented around, rectangular elements — busy textures to cover surfaces"): a strip panel
// underneath, whole fittings stamped over it at every quarter turn, each with a shadow, until it is busy
function makeTiles(set, R, n) {
  const out = [], pick = l => l[Math.floor(R() * l.length)];
  if (!set.fitting.length) return set.panel.slice();
  for (let i = 0; i < n; i++) {
    const W = 256, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const bg = pick(set.panel.length ? set.panel : set.band); if (bg) g.drawImage(bg, 0, 0, W, H); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, W, H);
    const k = 7 + Math.floor(R() * 5);
    for (let j = 0; j < k; j++) {
      const im = rotq(pick(set.fitting), Math.floor(R() * 4)), long = (0.38 + R() * 0.4) * W, sc = long / Math.max(im.width, im.height), w = im.width * sc, h = im.height * sc;
      g.save(); g.shadowColor = 'rgba(0,0,0,.75)'; g.shadowBlur = 7; g.shadowOffsetY = 3; g.drawImage(im, R() * W - w / 2, R() * H - h / 2, w, h); g.restore();
    }
    out.push(cv);
  }
  return out;
}
// the stock of a style as the solids want it: strip PANELS and BANDS (the textures), the whole FITTINGS (the cards), ENGINES (feet),
// MOUNTS (discs) and the TILES
function stockSet(styleStock) {
  if (styleStock._set) return styleStock._set;
  const by = k => styleStock.pieces.filter(p => p.kind === k), cvOf = p => p._cv || (p._cv = pieceCanvas(p)), st = STYLES[styleStock.style] || {};
  const panel = by('panel').map(cvOf), band = (by('band').length ? by('band') : by('panel')).map(cvOf), fitting = by('fitting').map(cvOf), engine = by('engine').map(cvOf), mount = by('mount').map(cvOf);
  const set = { panel, band, fitting, engine: engine.length ? engine : fitting, mount: mount.length ? mount : fitting };
  set.engDown = by('engine').length ? by('engine').map(p => rotq(cvOf(p), (STYLES[p.style] || st).flipEngines ? 1 : 3)) : fitting;   // nozzles point left on most sheets: a quarter turn back puts them down — each by its own style (a mix has two)
  set.tile = makeTiles(set, rnd('tiles:' + styleStock.style), 8);
  Object.assign(set, { roof: fitting, wall: [...panel, ...set.tile], ring: set.mount, bit: set.tile });   // the buildings' names for them
  return (styleStock._set = set);
}
export const tilesOf = styleStock => stockSet(styleStock).tile;
const unit = v => { const l = Math.hypot(...v) || 1; return v.map(k => k / l); };
// a builder of solids, seeded, picking from the stock
function builder(R, st) {
  const pick = list => list && list.length ? list[Math.floor(R() * list.length)] : null, B = [];
  const f = {
    B, R, st, v: (a, b) => a + (b - a) * R(), pick, roof: () => pick(st.roof), wall: () => pick(st.wall), band: () => pick(st.band), ring: () => pick(st.ring), bit: () => pick(st.bit),
    fit: () => pick(st.fitting), eng: () => pick(st.engine), engDown: () => pick(st.engDown), mount: () => pick(st.mount), tile: () => pick(st.tile), panel: () => pick(st.panel),
    box: (x, y, z, w, d, h, o = {}) => B.push({ t: 'box', x, y, z, w, d, h, roof: o.roof === undefined ? f.roof() : o.roof, wall: o.wall || f.wall(), ...o }),
    cyl: (x, y, z, r, h, o = {}) => B.push({ t: 'cyl', x, y, z, r, h, band: o.band || f.band(), cap: o.cap === undefined ? f.ring() : o.cap, ...o }),
    dome: (x, y, z, r, o = {}) => B.push({ t: 'dome', x, y, z, r, glass: true, ...o }),
    core: (x, y, z, r, o = {}) => B.push({ t: 'core', x, y, z, r, ...o }),
    light: (x, y, z, r = 0.08, o = {}) => B.push({ t: 'light', x, y, z, r, ...o }),
    halo: (x, y, z, r, o = {}) => B.push({ t: 'ring', x, y, z, r, ...o }),   // a glowing ring in the air (not the stock's ring)
    // a CARD: a flat greeble in space, its alpha its outline — centre c, the image's width along uDir, its height along vDir (its top);
    // size: the width (the height follows the picture), { byH } the height, or [width, height] (a greeble may stretch a little)
    card: (c, uDir, vDir, size, img, o = {}) => {
      if (!img) return; const ar = img.width / img.height, [W, H] = Array.isArray(size) ? size : o.byH ? [size * ar, size] : [size, size / ar];
      const u = unit(uDir).map(k => k * W / 2), v = unit(vDir).map(k => k * H / 2); B.push({ t: 'card', c, u, v, img, ...o });
    },
    // two cards crossed (an X from above): it reads from every side
    cross: (x, y, zc, size, img, o = {}) => { const a = o.a ?? 0; f.card([x, y, zc], [Math.cos(a), Math.sin(a), 0], [0, 0, 1], size, img, o); f.card([x, y, zc], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1], size, img, o); },
    // a disc: a ring piece laid flat (its hole shows through)
    disc: (x, y, z, r, img) => f.card([x, y, z], [1, 0, 0], [0, 1, 0], [2 * r, 2 * r], img),
  };
  return f;
}
// the frame that holds the object at every turn: its farthest reach from the centre and its height
function bounds(B) {
  let rho = 0.5, zt = 0.5;
  for (const s of B) {
    if (s.t === 'card') { for (const a of [-1, 1]) for (const b of [-1, 1]) { const x = s.c[0] + a * s.u[0] + b * s.v[0], y = s.c[1] + a * s.u[1] + b * s.v[1], z = s.c[2] + a * s.u[2] + b * s.v[2]; rho = Math.max(rho, Math.hypot(x, y)); zt = Math.max(zt, z); } continue; }
    const pts = s.t === 'box' ? [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.d], [s.x, s.y + s.d]] : [[s.x, s.y]], r = s.t === 'box' ? 0 : Math.max(s.r || 0, s.r2 || 0) * (s.t === 'core' ? 1.8 : 1);
    for (const [x, y] of pts) rho = Math.max(rho, Math.hypot(x, y) + r);
    zt = Math.max(zt, s.z + (s.h || 0) + (s.t === 'dome' ? s.r : s.t === 'core' || s.t === 'light' ? (s.r || 0) * 2 : 0) + (s.smoke ? 1.2 : 0));
  }
  return { rho, zt };
}
// THE DRAW ORDER (his catch, 2026-10-25: boxes on boxes fought over which was in front, domes vanished as it turned): every solid in its
// box (axis-aligned in the object's own frame). Of two that a plane of x, y or z keeps apart, the one on the camera's side of that plane
// can never be hidden by the other — it goes after; two that truly overlap fall back on their centres' depth. Only the pairs that
// overlap ON SCREEN are ordered, and a topological sort lays them out (a cycle, from the fallback, is broken by depth)
function boxOf(s) {
  if (s.t === 'box') return [s.x, s.x + s.w, s.y, s.y + s.d, s.z, s.z + s.h];
  if (s.t === 'card') { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const a of [-1, 1]) for (const b of [-1, 1]) { const x = s.c[0] + a * s.u[0] + b * s.v[0], y = s.c[1] + a * s.u[1] + b * s.v[1], z = s.c[2] + a * s.u[2] + b * s.v[2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, x1, y0, y1, z0, z1]; }
  const r = Math.max(s.r || 0, s.r2 || 0);
  if (s.t === 'cyl') return [s.x - r, s.x + r, s.y - r, s.y + r, s.z, s.z + s.h];
  if (s.t === 'dome') return [s.x - r, s.x + r, s.y - r, s.y + r, s.z, s.z + r];
  if (s.t === 'ring') return [s.x - r, s.x + r, s.y - r, s.y + r, s.z, s.z];
  return [s.x - r, s.x + r, s.y - r, s.y + r, s.z - r, s.z + r];   // a core, a light
}
function drawOrder(B, pr, c, s0) {
  const vx = c + s0, vy = c - s0, vz = 1.05, e = 1e-4;                                   // towards the camera, in the object's own frame
  const it = B.map((s, i) => {
    const b = boxOf(s); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const x of [b[0], b[1]]) for (const y of [b[2], b[3]]) for (const z of [b[4], b[5]]) { const [px, py] = pr(x, y, z); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    return { s, i, b, sb: [x0, x1, y0, y1], d: ((b[0] + b[1]) * vx + (b[2] + b[3]) * vy + (b[4] + b[5]) * vz) / 2, out: [], deg: 0, last: !!s.last };
  });
  const first = (A, Q) => {                                                              // true: A is drawn before Q
    const a = A.b, b = Q.b;
    if (Math.abs(vx) > 1e-6) { if (a[1] <= b[0] + e) return vx > 0; if (b[1] <= a[0] + e) return vx < 0; }
    if (Math.abs(vy) > 1e-6) { if (a[3] <= b[2] + e) return vy > 0; if (b[3] <= a[2] + e) return vy < 0; }
    if (a[5] <= b[4] + e) return true; if (b[5] <= a[4] + e) return false;
    return A.d < Q.d || (A.d === Q.d && A.i < Q.i);
  };
  const live = it.filter(x => !x.last), late = it.filter(x => x.last).sort((a, b) => a.d - b.d);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const A = live[i], Q = live[j]; if (A.sb[1] < Q.sb[0] || Q.sb[1] < A.sb[0] || A.sb[3] < Q.sb[2] || Q.sb[3] < A.sb[2]) continue;   // apart on screen: no order needed
    if (first(A, Q)) { A.out.push(Q); Q.deg++; } else { Q.out.push(A); A.deg++; }
  }
  const out = [], left = new Set(live);
  while (left.size) {
    let pick = null; for (const x of left) if (x.deg === 0 && (!pick || x.d < pick.d)) pick = x;
    if (!pick) for (const x of left) if (!pick || x.deg < pick.deg || (x.deg === pick.deg && x.d < pick.d)) pick = x;   // a cycle: the least held, the farthest
    left.delete(pick); out.push(pick.s); for (const q of pick.out) q.deg--;
  }
  return [...out, ...late.map(x => x.s)];
}
// THE RENDERER: solids → a canvas. o: { U px a unit, yaw (rad), glow (the level's colour, null = black with white outlines), glass,
// wash + washA (a colour over the greys), light (lit windows' colour), seed }
export function renderSolids(B, o = {}) {
  const U = o.U || 34, Z = U * 0.95, yaw = o.yaw || 0, c = Math.cos(yaw), s0 = Math.sin(yaw), R = rnd('w' + (o.seed || 1));
  const rot = (x, y) => [x * c - y * s0, x * s0 + y * c];
  const { rho, zt } = bounds(B), hw = rho * Math.SQRT2 * C30 * U, hh = rho * Math.SQRT2 * S30 * U, pad = 18;
  const W = Math.ceil(2 * hw + 2 * pad), H = Math.ceil(2 * hh + zt * Z + 2 * pad), ox = W / 2, oy = pad + zt * Z + hh;
  const pr = (x, y, z) => { const [a, b] = rot(x, y); return [ox + (a - b) * C30 * U, oy + (a + b) * S30 * U - z * Z]; };
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const black = o.glow === null, gc = black ? '#ffffff' : (o.glow || '#7fd8ff'), grgb = rgb(gc);
  // a glowing stroke in the level's colour (black: a white halo with a black core — the last level's look)
  const glowStroke = (draw, w = 2) => { g.save(); g.shadowColor = gc; g.shadowBlur = 8; g.strokeStyle = gc; g.lineWidth = w + (black ? 2 : 0); draw(); g.stroke(); if (black) { g.shadowBlur = 0; g.strokeStyle = '#000'; g.lineWidth = w; draw(); g.stroke(); } g.restore(); };
  // the shadow on the ground
  { const gr = g.createRadialGradient(ox, oy, 0, ox, oy, hw); gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(ox, oy); g.scale(1, hh / hw); g.translate(-ox, -oy); g.fillStyle = gr; g.beginPath(); g.arc(ox, oy, hw, 0, 7); g.fill(); g.restore(); }
  // back to front: the footprint centre's depth (what stands ON a block shares its centre — after it, by height)
  const order = drawOrder(B, pr, c, s0);
  for (const s of order) { try { drawSolid(s); } catch (e) { console.warn('greeble lab: a part could not be drawn and was left out', s.t, e.message); } }   // one broken part never takes the whole piece down
  function drawSolid(s) {
    if (s.t === 'box') {
      const cs = [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.d], [s.x, s.y + s.d]], z1 = s.z + s.h, rm = rot(s.x + s.w / 2, s.y + s.d / 2);
      for (let i = 0; i < 4; i++) {                                                  // the walls that face us, lit from the screen's left
        const A = cs[i], Bq = cs[(i + 1) % 4], ra = rot(...A), rb = rot(...Bq); let nx = rb[1] - ra[1], ny = -(rb[0] - ra[0]);
        if (nx * ((ra[0] + rb[0]) / 2 - rm[0]) + ny * ((ra[1] + rb[1]) / 2 - rm[1]) < 0) { nx = -nx; ny = -ny; } const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        if (nx + ny <= 0.02) continue;
        const lit = (ny - nx) / Math.SQRT2, P0 = pr(A[0], A[1], z1), Pb = pr(Bq[0], Bq[1], z1), Pd = pr(A[0], A[1], s.z);
        face(g, s.wall, P0, sub(Pb, P0), sub(Pd, P0), 0.3 - 0.2 * lit);
        if (s.windows) { const u = sub(Pb, P0), v = sub(Pd, P0), nu = Math.max(2, Math.round(Math.hypot(...u) / 9)), nv = Math.max(1, Math.round(Math.hypot(...v) / 12));
          for (let ii = 0; ii < nu; ii++) for (let j = 0; j < nv; j++) if (R() < 0.55) { const a = (ii + 0.35) / nu, b = (j + 0.4) / nv; g.fillStyle = o.light ? `rgba(${rgb(o.light)},${R() < 0.25 ? 1 : 0.7})` : (R() < 0.2 ? 'rgba(255,240,190,.95)' : 'rgba(255,214,140,.7)'); g.fillRect(P0[0] + u[0] * a + v[0] * b - 1.5, P0[1] + u[1] * a + v[1] * b - 1, 3, 2); } }
        if (s.strip) { const zs = s.z + s.h * 0.72, p = pr(A[0], A[1], zs), q = pr(Bq[0], Bq[1], zs); glowStroke(() => { g.beginPath(); g.moveTo(...p); g.lineTo(...q); }, 1.6); }
      }
      const T0 = pr(cs[0][0], cs[0][1], z1), Tx = pr(cs[1][0], cs[1][1], z1), Ty = pr(cs[3][0], cs[3][1], z1);
      if (s.roof === 'field') face(g, fieldTex(), T0, sub(Tx, T0), sub(Ty, T0), 0, 0, 0, 64, 64 * s.d / s.w, '#4b5a2e');
      else { face(g, s.wall, T0, sub(Tx, T0), sub(Ty, T0), -0.04, 0, 0, null, null, '#3a4256');
        if (s.roof) { const k = 0.84, ar = s.roof.width / s.roof.height, ww = Math.min(s.w * k, s.d * k * ar), dd = ww / ar, x0 = s.x + (s.w - ww) / 2, y0 = s.y + (s.d - dd) / 2, P0 = pr(x0, y0, z1), Px = pr(x0 + ww, y0, z1), Py = pr(x0, y0 + dd, z1);   // a top-down piece on the roof, kept to its own shape
          g.save(); g.setTransform(...curT(g, [(Px[0] - P0[0]) / s.roof.width, (Px[1] - P0[1]) / s.roof.width, (Py[0] - P0[0]) / s.roof.height, (Py[1] - P0[1]) / s.roof.height, P0[0], P0[1]])); g.drawImage(s.roof, 0, 0); g.restore(); } }
    } else if (s.t === 'cyl') {
      const segs = s.r2 != null && Math.abs(s.r2 - s.r) > 0.01 ? 8 : 1, rTop = s.r2 ?? s.r, src = s.band, off = yaw / (2 * Math.PI);
      for (let k = 0; k < segs; k++) {                                               // the wall, column by column: the band wrapped round (a taper in slices)
        const z0 = s.z + s.h * k / segs, z1 = s.z + s.h * (k + 1) / segs, r = s.r + (rTop - s.r) * (k + 0.5) / segs, [cx, cyb] = pr(s.x, s.y, z0), cyt = pr(s.x, s.y, z1)[1];
        const rx = r * Math.SQRT2 * C30 * U, ry = r * Math.SQRT2 * S30 * U, n = Math.max(8, Math.ceil(rx * 2));
        for (let i = 0; i < n; i++) {
          const a0 = -1 + 2 * i / n, a1 = -1 + 2 * (i + 1) / n, xa = cx + a0 * rx, xb = cx + a1 * rx, am = (a0 + a1) / 2, yb = ry * Math.sqrt(Math.max(0, 1 - am * am));
          if (src) { const u = ((((Math.asin(Math.max(-1, Math.min(1, am))) / Math.PI + 0.5) * 0.5 + off) % 1) + 1) % 1 * src.width; g.drawImage(src, Math.min(src.width - 1, u), src.height * k / segs, 1, src.height / segs, xa, cyt + yb, xb - xa + 0.6, cyb - cyt + 0.6); }
          else { g.fillStyle = '#3a4256'; g.fillRect(xa, cyt + yb, xb - xa + 0.6, cyb - cyt); }
          g.fillStyle = `rgba(0,0,0,${(0.1 + 0.45 * (am + 1) / 2).toFixed(3)})`; g.fillRect(xa, cyt + yb, xb - xa + 0.6, cyb - cyt + 0.6);
        }
      }
      for (const f of s.glowRings || []) { const r = s.r + (rTop - s.r) * f, [cx, cy] = pr(s.x, s.y, s.z + s.h * f); glowStroke(() => { g.beginPath(); g.ellipse(cx, cy, r * Math.SQRT2 * C30 * U, r * Math.SQRT2 * S30 * U, 0, 0, Math.PI); }, 1.8); }
      const [cx, cyt] = pr(s.x, s.y, s.z + s.h), rx = rTop * Math.SQRT2 * C30 * U, ry = rTop * Math.SQRT2 * S30 * U;
      g.save(); g.beginPath(); g.ellipse(cx, cyt, rx, ry, 0, 0, 7); g.fillStyle = '#3a4256'; g.fill(); g.clip();          // the cap: a ring laid flat (it turns with the rest)
      if (s.cap) { const zt2 = s.z + s.h, P0 = pr(s.x - rTop, s.y - rTop, zt2), Px = pr(s.x + rTop, s.y - rTop, zt2), Py = pr(s.x - rTop, s.y + rTop, zt2); g.setTransform(...curT(g, [(Px[0] - P0[0]) / s.cap.width, (Px[1] - P0[1]) / s.cap.width, (Py[0] - P0[0]) / s.cap.height, (Py[1] - P0[1]) / s.cap.height, P0[0], P0[1]])); g.drawImage(s.cap, 0, 0); }
      g.restore(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.beginPath(); g.ellipse(cx, cyt, rx, ry, 0, 0, 7); g.stroke();
      if (s.edgeGlow) glowStroke(() => { g.beginPath(); g.ellipse(cx, cyt, rx, ry, 0, 0, 7); }, 1.8);
      if (s.smoke) for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(200,205,215,${0.22 - k * 0.05})`; g.beginPath(); g.arc(cx + k * 5, cyt - 8 - k * 9, 5 + k * 3, 0, 7); g.fill(); }
    } else if (s.t === 'dome') {
      const [cx, cy] = pr(s.x, s.y, s.z), rx = s.r * Math.SQRT2 * C30 * U, ry = s.r * Math.SQRT2 * S30 * U, rz = s.r * Z, gl = s.white ? '230,244,255' : rgb(s.color || o.glass || gc), faint = s.last;
      g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); g.ellipse(cx, cy, rx, rz, 0, Math.PI, 0, false); g.closePath();
      const gr = g.createRadialGradient(cx - rx * 0.35, cy - rz * 0.55, rx * 0.05, cx, cy - rz * 0.3, rx * 1.1); gr.addColorStop(0, `rgba(255,255,255,${faint ? 0.22 : 0.55})`); gr.addColorStop(0.35, `rgba(${gl},${faint ? 0.12 : 0.28})`); gr.addColorStop(1, `rgba(${gl},${faint ? 0.2 : 0.45})`);
      g.fillStyle = gr; g.fill(); g.strokeStyle = `rgba(${gl},${faint ? 0.55 : 0.8})`; g.lineWidth = 1.2; g.stroke();
      if (!faint) { g.clip(); g.strokeStyle = 'rgba(255,255,255,.18)'; for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(cx, cy - rz * k / 4, rx * Math.sqrt(1 - (k / 4) ** 2), ry * Math.sqrt(1 - (k / 4) ** 2), 0, 0, 7); g.stroke(); } }
      g.restore();
    } else if (s.t === 'core' || s.t === 'light') {
      const [cx, cy] = pr(s.x, s.y, s.z), r = Math.max(2, s.r * U * (s.t === 'core' ? 0.95 : 0.7)), c2 = s.color ? rgb(s.color) : grgb;
      if (black && !s.color) { const gr = g.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 2.4); gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r * 2.4, 0, 7); g.fill(); g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); g.beginPath(); g.arc(cx, cy, r + 3, 0, 7); g.stroke(); }
      else { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.3, `rgba(${c2},.95)`); gr.addColorStop(0.55, `rgba(${c2},.35)`); gr.addColorStop(1, `rgba(${c2},0)`); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r * 2.2, 0, 7); g.fill(); }
    } else if (s.t === 'card') {                                                     // a flat greeble in space: its picture laid on the parallelogram, its outline its alpha
      const { c: C, u, v, img } = s, P = (k1, k2) => pr(C[0] + k1 * u[0] + k2 * v[0], C[1] + k1 * u[1] + k2 * v[1], C[2] + k1 * u[2] + k2 * v[2]);
      const TL = P(-1, 1), TR = P(1, 1), BL = P(-1, -1), ax = TR[0] - TL[0], ay = TR[1] - TL[1], bx = BL[0] - TL[0], by = BL[1] - TL[1];
      if (Math.abs(ax * by - ay * bx) < 6) return;                                   // edge-on: nothing to see
      let n = unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]), [na, nb] = rot(n[0], n[1]), nz = n[2];
      if (na + nb + nz * 1.4 < 0) { na = -na; nb = -nb; nz = -nz; }                 // two-sided: the side we see
      const lit = (nb - na) / Math.SQRT2 * 0.8 + nz * 0.6, k = Math.max(0, Math.min(0.62, 0.3 - 0.26 * lit + (s.dim || 0)));
      const [sx, sy, sw, sh] = s.src || [0, 0, img.width, img.height];
      g.save(); g.setTransform(...curT(g, [ax / sw, ay / sw, bx / sh, by / sh, TL[0], TL[1]])); g.drawImage(shaded(img, k), sx, sy, sw, sh, 0, 0, sw, sh); g.restore();
    } else if (s.t === 'ring') {
      const [cx, cy] = pr(s.x, s.y, s.z), rx = s.r * Math.SQRT2 * C30 * U, ry = s.r * Math.SQRT2 * S30 * U;
      glowStroke(() => { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); }, 2.2);
    }
  }
  if (!o.wash || !(o.washA > 0)) return cv;
  // the wash: a colour over the greys (in the 'color' blend, so the light and dark of the art stay)
  const out = document.createElement('canvas'); out.width = W; out.height = H; const q = out.getContext('2d');
  q.drawImage(cv, 0, 0); q.globalCompositeOperation = 'color'; q.globalAlpha = o.washA; q.fillStyle = o.wash; q.fillRect(0, 0, W, H); q.globalAlpha = 1; q.globalCompositeOperation = 'destination-in'; q.drawImage(cv, 0, 0); q.globalCompositeOperation = 'source-over';
  return out;
}

// THE BUILDINGS (the first try): a colony's structures, washed in their kind's colour
export const ARCHETYPES = {
  generator: { name: 'Generator', tint: '#ffcf5a', glow: '#ffd84f' },
  shield:    { name: 'Shield emitter', tint: '#b98cff', glow: '#cf89ff' },
  farm:      { name: 'Farm', tint: '#86d46a', glow: '#b6f08a' },
  works:     { name: 'Industry', tint: '#ff9f4a', glow: '#ffb347' },
  lab:       { name: 'Research lab', tint: '#5fa8ff', glow: '#7fd8ff' },
  homes:     { name: 'Homes', tint: '#f5a3c7', glow: '#ffe6a8' },
};
// THE BUILDINGS out of the same parts as the devices (his call, 2026-10-25): plinths with greeble flanges, cages, columns with fins and
// plates, engines standing on corners, towers with set-backs, tiles on the roofs — laid out over a bigger footprint
function shift(s, dx, dy) { if (s.t === 'card') s.c = [s.c[0] + dx, s.c[1] + dy, s.c[2]]; else { s.x += dx; s.y += dy; } }
function buildingRecipe(kind, f) {
  const { box, cyl, dome, light, v, R } = f;
  const at = (dx, dy, fn) => { const n0 = f.B.length, r = fn(); for (let i = n0; i < f.B.length; i++) shift(f.B[i], dx, dy); return r; };
  const plinth = (w, d, h) => { box(-w / 2, -d / 2, 0, w, d, h, { roof: f.tile(), strip: true }); flanges(f, w, d, h * 0.6, w >= d ? 'x' : 'y', h * v(1.5, 2.2)); return { z: h, r: Math.min(w, d) / 2 }; };
  if (kind === 'generator') {
    const P = plinth(v(3.8, 4.6), v(3.6, 4.4), v(0.35, 0.5));
    const x = PARTS.body[f.pick(['cage', 'column', 'stack'])](f, { z: P.z, r: 1.5 }); PARTS.top.core(f, x);
    const img = f.engDown(); for (const [px, py] of [[-1.45, -1.45], [1.45, 1.45]]) f.cross(px, py, P.z + 0.6, 1.2, img, { byH: true, a: Math.PI / 4 });   // engines standing on two corners
    for (const [px, py] of [[1.45, -1.45], [-1.45, 1.45]]) at(px, py, () => { const r = 0.35, h = v(0.7, 1.1); cyl(0, 0, P.z, r, h, { glowRings: [0.5] }); fins(f, P.z + h / 2, r, h * 0.9, 5, 'plates'); light(0, 0, P.z + h + 0.05, 0.08); });   // capacitors
  } else if (kind === 'shield') {
    const P = plinth(v(3.2, 3.8), v(3.2, 3.8), 0.4), h = v(2.0, 2.8), r = 0.45; cyl(0, 0, P.z, r, h, { glowRings: [0.3, 0.7] }); fins(f, P.z + h * 0.45, r, h * 0.8, 4, 'radial');
    PARTS.top.emitter(f, { z: P.z + h, r: 0.9 });
    for (const [px, py] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2]]) at(px, py, () => PARTS.top.antennae(f, { z: P.z, r: 0.3 }));
    dome(0, 0, 0, v(2.4, 2.8), { last: true });
  } else if (kind === 'farm') {
    const bw = v(0.95, 1.1), L = v(3.0, 3.6); for (let i = 0; i < 3; i++) at((i - 1) * (bw + 0.32), 0, () => { const h = 0.18 + i * 0.1; box(-bw / 2, -L / 2, 0, bw, L, h, { roof: 'field' }); flanges(f, bw, L, h * 0.6, 'y', h * 2.2); });
    at(3.45, -1.05, () => dome(0, 0, 0, v(0.75, 0.95))); at(3.35, 1.25, () => dome(0, 0, 0, v(0.55, 0.75)));   // the glasshouses, clear of the fields (they popped in and out where they touched)
    at(-3.0, 1.3, () => { const h = v(1.3, 1.9); cyl(0, 0, 0, 0.45, h); fins(f, h / 2, 0.45, h * 0.95, 6, 'plates'); light(0, 0, h + 0.05, 0.07); });   // the silo
  } else if (kind === 'works') {
    at(-1.1, 0, () => { const x = PARTS.body.H(f, { z: 0, r: 1.2 }, 1, 'x'); const n = 2 + Math.floor(R() * 2); for (let i = 0; i < n; i++) at(-0.6 + i * 0.6, 0, () => { const h = v(1.0, 1.6); cyl(0, 0, x.z, 0.2, h, { smoke: true }); fins(f, x.z + h * 0.4, 0.2, h * 0.5, 4, 'radial'); }); });
    at(1.7, 0.6, () => PARTS.body.tower(f, { z: 0, r: 0.8 }));
    box(0.05, -0.15, 0.6, 0.9, 0.3, 0.25, { roof: null, strip: true });   // a pipe bridge
  } else if (kind === 'lab') {
    const P = plinth(v(3.2, 3.8), v(3.2, 3.8), 0.5); dome(0, 0, P.z, v(1.1, 1.4), { white: true });
    at(1.3, -1.2, () => PARTS.top.dish(f, { z: P.z, r: 0.6 })); at(-1.3, 1.1, () => PARTS.top.antennae(f, { z: P.z, r: 0.35 }));
  } else {                                                                                // homes: towers with set-backs, flanges, lit windows, spires
    const n = 2 + Math.floor(R() * 2);
    for (let i = 0; i < n; i++) at((i - (n - 1) / 2) * 1.9, (i % 2) * 0.6, () => {
      let z = 0, w = v(1.2, 1.5), d = w * v(0.8, 1.0); const k = 2 + Math.floor(R() * 2);
      for (let j = 0; j < k; j++) { const h = v(0.8, 1.4); box(-w / 2, -d / 2, z, w, d, h, { windows: true, roof: f.tile() }); flanges(f, w, d, z + h / 2, j % 2 ? 'y' : 'x', h * 1.2); z += h; w *= 0.78; d *= 0.78; }
      if (R() < 0.7) PARTS.top.spire(f, { z, r: w / 2 });
    });
  }
}
// the solids about their footprint's centre (so they turn in place)
function centre(B) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of B) { const b = boxOf(s); x0 = Math.min(x0, b[0]); x1 = Math.max(x1, b[1]); y0 = Math.min(y0, b[2]); y1 = Math.max(y1, b[3]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; for (const s of B) shift(s, -cx, -cy); return B;
}
export function drawBuilding(kind, styleStock, { seed = 1, U = 34, tint = true, yaw = 0 } = {}) {
  const A = ARCHETYPES[kind] || ARCHETYPES.generator, f = builder(rnd(kind + ':' + seed + ':' + styleStock.style), stockSet(styleStock));
  buildingRecipe(kind, f);
  return renderSolids(centre(f.B), { U, yaw, glow: A.glow, glass: A.glow, wash: tint ? A.tint : null, washA: styleStock.mixed ? 0.18 : 0.55, seed });   // a mix keeps its two tones under a lighter wash
}

// THE DEVICES (his ask, 2026-10-24: "look at this piece of hardware I've just designed — it represents this advancement… in a cool,
// flavour-meaningful way"): a technology as a piece of HARDWARE, built from the style's stock — a shield generator, armour plating, a
// reactor, a star drive, thrusters, a weapons computer, sensors, a drone bay, the weapons on their mounts (barrels by their look:
// long for reach, many for rate, thick for damage), the farms' adaptations. Its LEVEL is a colour (techicons.js LEVEL_COLORS: red …
// violet, then black with white outlines) on every light, glow and strip; the technology's ICON can sit over it (iconBadge). It turns.
export const DEVICES = {
  shield:   { name: 'Shield generator', icon: 'shield' },
  armor:    { name: 'Armour plating', icon: 'armor' },
  reactor:  { name: 'Reactor', icon: 'power' },
  drive:    { name: 'Star drive', icon: 'reach' },
  thruster: { name: 'Thrusters', icon: 'speed' },
  computer: { name: 'Weapons computer', icon: 'computing' },
  sensors:  { name: 'Sensors', icon: 'sensors' },
  drones:   { name: 'Drone bay', icon: 'evasion' },
  drone:    { name: 'Drone', icon: 'evasion', craft: true },
  works:    { name: 'Factory (manufacturing)', icon: 'factory' },
  mining:   { name: 'Mining rig', icon: 'mining' },
  labor:    { name: 'Efficient works (labour)', icon: 'labor' },
  farms:    { name: 'Farms', icon: 'food', farm: true },
  beam:     { name: 'Energy weapon', icon: 'damage', weapon: true },
  gun:      { name: 'Kinetic gun', icon: 'pierce', weapon: true },
  missile:  { name: 'Missile pod', icon: 'damage', weapon: true },
  farms_cold: { name: 'Frost-hardy crops', icon: 'cold', farm: true },
  farms_hot:  { name: 'Heat-proof crops', icon: 'heat', farm: true },
  farms_rad:  { name: 'Shielded farms', icon: 'radiation', farm: true },
};
// THE PARTS (the grammar): a BASE, a BODY on it, a TOP on that — each picked by the technology's leanings, each sized off the one below.
// ctx = { z: the height reached, r: the room on top }. Flanges, fins, plates, pillars and discs are CARDS of the style's whole greebles
// FLANGES (his "H with two crossbars"): a greeble standing on each long side of a block, past both its ends
function flanges(f, w, d, zc, along, hh) {
  const img = f.fit(); if (!img) return; const L = (along === 'x' ? w : d) * f.v(1.18, 1.42), off = (along === 'x' ? d : w) / 2 + 0.03, H = Math.max(hh, 0.25);
  for (const k of [-1, 1]) along === 'x' ? f.card([0, k * off, Math.max(zc, H / 2)], [1, 0, 0], [0, 0, 1], [L, H], img) : f.card([k * off, 0, Math.max(zc, H / 2)], [0, 1, 0], [0, 0, 1], [L, H], img);
}
// A MISSILE'S TIP (his ask: "the tips of the missiles protruding from the front"): the front of a missile seen from the side — a stub of
// body in the style's own band, an ogive nose, a ring of the level's colour behind it; laid on two crossed cards so it reads from all round
const TIPS = new Map();
function tipTex(band, col) {
  const key = (band ? band.width + 'x' + band.height + ':' + (band._id || (band._id = Math.random().toString(36).slice(2))) : 'none') + '|' + (col || 'w');
  if (TIPS.has(key)) return TIPS.get(key);
  const W = 128, H = 44, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'), y0 = 7, y1 = 37;
  g.save(); g.beginPath(); g.rect(0, y0, 66, y1 - y0); g.clip(); if (band) g.drawImage(band, 0, 0, band.width * 0.5, band.height, 0, y0, 66, y1 - y0); else { g.fillStyle = '#6b7488'; g.fillRect(0, y0, 66, y1 - y0); } g.restore();
  const sh = g.createLinearGradient(0, y0, 0, y1); sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = sh; g.fillRect(0, y0, 66, y1 - y0);
  g.beginPath(); g.moveTo(66, y0); g.bezierCurveTo(98, y0, 118, 16, 126, 22); g.bezierCurveTo(118, 28, 98, y1, 66, y1); g.closePath();
  const ng = g.createLinearGradient(0, y0, 0, y1); ng.addColorStop(0, '#eef3fb'); ng.addColorStop(0.4, '#a9b3c6'); ng.addColorStop(1, '#3a4256'); g.fillStyle = ng; g.fill(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = col || '#ffffff'; g.fillRect(56, y0, 7, y1 - y0); g.strokeStyle = 'rgba(0,0,0,.5)'; g.strokeRect(0.5, y0, 65, y1 - y0);
  TIPS.set(key, cv); return cv;
}
// A DRONE (his ask: "create the drone itself out of the greebles"): a greeble laid flat for its body, a ring at each corner for its
// rotors, a light underneath
function drone(f, x, y, z, s) {
  const a = f.R() * Math.PI, ca = Math.cos(a), sa = Math.sin(a), ring = f.mount(); f.card([x, y, z], [ca, sa, 0], [-sa, ca, 0], s, f.fit());
  for (const [p, q] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) f.card([x + (ca * p - sa * q) * s * 0.42, y + (sa * p + ca * q) * s * 0.42, z + 0.05], [1, 0, 0], [0, 1, 0], [s * 0.42, s * 0.42], ring);
  f.light(x, y, z - 0.07, 0.06);
}
// FINS (radial, standing out of a cylinder) or PLATES (overlapping round it)
function fins(f, zc, r, h, n, mode) {
  const img = mode === 'radial' ? rotq(f.fit(), 1) : f.fit(), a0 = f.R() * Math.PI; if (!img) return;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * 2 * Math.PI / n, ca = Math.cos(a), sa = Math.sin(a);
    if (mode === 'radial') { const w = h * img.width / img.height; f.card([ca * (r + w * 0.38), sa * (r + w * 0.38), zc], [ca, sa, 0], [0, 0, 1], [w, h], img); }
    else { const w = 2 * Math.PI * r / n * 1.18; f.card([ca * (r + 0.03), sa * (r + 0.03), zc], [-sa, ca, 0], [0, 0, 1], [w, h], img); }
  }
}
const PARTS = {
  base: {
    plinth(f) { const w = f.v(2.0, 2.7), d = f.v(1.5, 2.3), h = f.v(0.22, 0.38); f.box(-w / 2, -d / 2, 0, w, d, h, { roof: f.tile(), strip: true }); flanges(f, w, d, h * 0.6, w >= d ? 'x' : 'y', h * f.v(1.4, 2.2)); return { z: h, r: Math.min(w, d) / 2 }; },
    drum(f) { const r = f.v(1.0, 1.35), h = f.v(0.28, 0.45); f.cyl(0, 0, 0, r, h, { r2: r * 0.88, cap: null }); fins(f, h * 0.55, r * 0.9, h * 1.5, 6 + Math.floor(f.R() * 3), 'radial'); f.disc(0, 0, h + 0.01, r * 0.92, f.mount()); return { z: h, r: r * 0.85 }; },
    pylons(f) { const s = f.v(0.8, 1.1), ph = f.v(0.22, 0.32), lh = f.v(0.8, 1.25), img = f.engDown(); f.box(-s * 1.22, -s * 1.22, 0, s * 2.44, s * 2.44, ph, { roof: f.tile(), strip: true }); for (const [x, y] of [[-s, -s], [s, -s], [s, s], [-s, s]]) f.cross(x, y, ph + lh / 2, lh, img, { byH: true, a: Math.PI / 4 }); return { z: ph, r: s * 0.72 }; },   // four engines standing on the corners, exhaust down on the plinth; the body rises between them
    nozzle(f) { const r = f.v(0.9, 1.15), h = f.v(0.6, 0.9); f.cyl(0, 0, 0, r, h, { r2: r * 0.6, glowRings: [0.15], cap: null }); fins(f, h / 2, r * 0.8, h * 1.25, 4, 'radial'); return { z: h, r: r * 0.6 }; },
  },
  body: {
    column(f, x) { const r = Math.max(0.35, x.r * f.v(0.45, 0.7)), h = f.v(1.0, 1.7); f.cyl(0, 0, x.z, r, h, { glowRings: [0.2 + 0.6 * f.R()] }); fins(f, x.z + h / 2, r, h * f.v(0.8, 1.05), 3 + Math.floor(f.R() * 4), f.R() < 0.55 ? 'radial' : 'plates'); return { z: x.z + h, r: r * 1.1 }; },
    stack(f, x) { let z = x.z; const r = x.r * f.v(0.7, 0.95), n = 2 + Math.floor(f.R() * 3); for (let i = 0; i < n; i++) { const h = f.v(0.3, 0.6), rr = r * f.v(0.7, 1.0); f.cyl(0, 0, z, rr, h, { cap: null, glowRings: f.R() < 0.4 ? [0.5] : [] }); f.disc(0, 0, z + h + 0.01, rr * f.v(1.1, 1.35), f.mount()); z += h + 0.04; } return { z, r: r * 0.8 }; },
    cage(f, x) { const R0 = Math.max(0.5, x.r * 0.75), h = f.v(1.1, 1.7), n = 4 + Math.floor(f.R() * 3), img = rotq(f.fit(), 1); for (let i = 0; i < n; i++) { const a = i * 2 * Math.PI / n; f.card([Math.cos(a) * R0, Math.sin(a) * R0, x.z + h / 2], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1], h, img, { byH: true }); } f.core(0, 0, x.z + h / 2, Math.min(0.55, R0 * 0.6)); f.disc(0, 0, x.z + h + 0.02, R0 * 1.25, f.mount()); return { z: x.z + h + 0.02, r: R0 }; },
    // his H with two crossbars: two solid blocks in the strip's texture with a gap (a light in it), the greeble flanges on both long sides
    H(f, x, k = 1, along = null) {
      const w = Math.max(1.2, x.r * 2 * k * f.v(0.95, 1.2)), d = w * f.v(0.5, 0.75), h = f.v(0.6, 1.1) * k, gap = w * f.v(0.14, 0.26), bw = (w - gap) / 2, ax = along || (f.R() < 0.5 ? 'x' : 'y');
      if (ax === 'x') { for (const x0 of [-w / 2, gap / 2]) f.box(x0, -d / 2, x.z, bw, d, h, { roof: f.tile(), wall: f.panel(), strip: f.R() < 0.5 }); }
      else { for (const y0 of [-w / 2, gap / 2]) f.box(-d / 2, y0, x.z, d, bw, h, { roof: f.tile(), wall: f.panel(), strip: f.R() < 0.5 }); }
      flanges(f, ax === 'x' ? w : d, ax === 'x' ? d : w, x.z + h / 2, ax, h * f.v(1.25, 1.6));
      f.core(0, 0, x.z + h / 2, Math.min(0.3, gap * 0.6));
      return { z: x.z + h, r: Math.min(w, d) / 2, ax };
    },
    H2(f, x) { const a = PARTS.body.H(f, x, 1); return PARTS.body.H(f, a, 0.75, a.ax === 'x' ? 'y' : 'x'); },
    tower(f, x) { let z = x.z, w = Math.max(1.0, x.r * 1.7), d = w * f.v(0.7, 1.0); const n = 2 + Math.floor(f.R() * 2); for (let i = 0; i < n; i++) { const h = f.v(0.5, 0.9); f.box(-w / 2, -d / 2, z, w, d, h, { roof: f.tile(), strip: f.R() < 0.6 }); flanges(f, w, d, z + h / 2, i % 2 ? 'y' : 'x', h * 1.3); z += h; w *= 0.76; d *= 0.76; } return { z, r: w / 2 }; },
  },
  top: {
    emitter(f, x) { f.cyl(0, 0, x.z, Math.max(0.14, x.r * 0.25), 0.35, { cap: null }); const z = x.z + 0.35, r = x.r * f.v(1.1, 1.5); f.disc(0, 0, z, r, f.mount()); f.halo(0, 0, z + 0.25, r * f.v(1.1, 1.3)); f.core(0, 0, z + 0.35, 0.28); return { z: z + 0.6, r: x.r }; },
    core(f, x) { f.core(0, 0, x.z + 0.4, Math.min(0.6, x.r * 0.7)); return x; },
    dome(f, x) { f.dome(0, 0, x.z, Math.max(0.4, x.r * 0.95)); return x; },
    spire(f, x) { const h = f.v(1.0, 1.6); f.cross(0, 0, x.z + h / 2, h, rotq(f.fit(), 1), { byH: true, a: f.R() * Math.PI }); f.light(0, 0, x.z + h + 0.05, 0.08); return { z: x.z + h, r: x.r }; },
    dish(f, x) { f.cyl(0, 0, x.z, 0.08, 0.45, { cap: null }); const r = Math.max(0.5, x.r * f.v(0.9, 1.3)), t = f.v(0.5, 0.9), a = f.R() * Math.PI * 2; f.card([0, 0, x.z + 0.6], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a) * Math.cos(t), Math.cos(a) * Math.cos(t), Math.sin(t)], [2 * r, 2 * r], f.mount()); f.light(0, 0, x.z + 0.65, 0.08); return x; },
    antennae(f, x) { const n = 2 + Math.floor(f.R() * 2); for (let i = 0; i < n; i++) { const h = f.v(0.7, 1.3), px = f.v(-x.r * 0.6, x.r * 0.6), py = f.v(-x.r * 0.6, x.r * 0.6); f.cross(px, py, x.z + h / 2, h, rotq(f.fit(), 1), { byH: true, a: f.R() * Math.PI }); f.light(px, py, x.z + h + 0.03, 0.06); } return x; },
    plates(f, x) { let z = x.z; for (let i = 0; i < 3; i++) { const s = x.r * 2 * (1.15 - i * 0.22), a = f.R() * Math.PI; f.card([0, 0, z + 0.03], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], s, f.fit()); z += 0.12; } return { z, r: x.r }; },
    swarm(f, x) { for (let k = 0; k < 3; k++) drone(f, f.v(-x.r, x.r), f.v(-x.r, x.r), x.z + f.v(0.6, 1.4), f.v(0.75, 1.05)); return x; },
    chimneys(f, x) { const n = 2 + Math.floor(f.R() * 2); for (let i = 0; i < n; i++) { const px = (i - (n - 1) / 2) * Math.max(0.35, x.r * 0.55), h = f.v(0.8, 1.4); f.cyl(px, 0, x.z, 0.17, h, { smoke: true }); fins(f, x.z + h * 0.35, 0.17, h * 0.45, 4, 'radial'); } return x; },
    none(f, x) { return x; },
  },
};
// THE WEAPONS (his ask, 2026-10-24: "the greeble that goes around the gun, and then the barrels — a greeble layout around the barrels or
// the missiles"): a mount; a housing (a block, a drum in plates, or the H); the barrels by the weapon's look (traits.js: long, many,
// thick) wrapped in greeble cards — SLEEVES along both sides overhanging above and below, a COLLAR of a ring standing across them at
// the root (and part-way), a ring at a beam's muzzle — and the trait's own touches (a Disruptor's coil rings, an Ember's vents, a Rail's
// glowing gap, a Long's scope); a missile is a pod with its tubes as rings on its face
function weaponRecipe(fam, f, L) {
  L = L || {}; const { box, cyl, core, light, v, R } = f, len = L.len || 1, th = L.thick || 1;
  const mr = v(0.8, 1.0), mh = v(0.22, 0.32); cyl(0, 0, 0, mr, mh, { r2: mr * 0.92, cap: null }); fins(f, mh * 0.55, mr * 0.88, mh * 1.4, 6 + Math.floor(R() * 3), 'radial'); f.disc(0, 0, mh + 0.01, mr * 0.95, f.mount());
  const z = mh;
  if (fam === 'missile') {
    let z0 = z; const neck = R() < 0.5, kind = Math.floor(R() * 3), w = v(1.15, 1.5), d = v(1.1, 1.45) * (L.trait === 'salvo' ? 1.3 : 1), h = v(0.7, 0.95), ring = f.mount(), tip = tipTex(f.band(), f.glow);
    if (neck) { cyl(0, 0, z, 0.32, 0.28, { cap: null, glowRings: [0.5] }); z0 = z + 0.28; }
    const pods = kind === 1 ? [{ y: -(d * 0.26 + 0.07), d: d * 0.48, z: z0, h, w }, { y: d * 0.26 + 0.07, d: d * 0.48, z: z0, h, w }]   // twin: two pods with a gap and a bridge
      : kind === 2 ? [{ y: 0, d, z: z0, h: h * 0.58, w }, { y: 0, d: d * 0.78, z: z0 + h * 0.58, h: h * 0.46, w: w * 0.82, x: -w * 0.1 }]   // stacked: a smaller pod on a bigger one
      : [{ y: 0, d, z: z0, h, w }];
    const total = L.tubes || 4; let left = total;
    pods.forEach((p, pi) => {
      const px = p.x || 0, front = px + p.w / 2, n = pi === pods.length - 1 ? left : Math.max(1, Math.round(total * p.d * p.h / pods.reduce((a, q) => a + q.d * q.h, 0))); left -= n;
      box(px - p.w / 2, p.y - p.d / 2, p.z, p.w, p.d, p.h, { roof: f.tile(), wall: f.panel() || f.wall(), strip: R() < 0.5 });
      if (kind !== 1) flanges(f, p.w, p.d, p.z + p.h / 2, 'x', p.h * v(1.15, 1.4));
      else f.card([px, p.y + Math.sign(p.y) * (p.d / 2 + 0.03), p.z + p.h / 2], [1, 0, 0], [0, 0, 1], [p.w * v(1.15, 1.35), p.h * 1.3], f.fit());   // the twins' outer flanges
      f.card([px + 0.06, p.y, p.z + p.h + 0.03], [1, 0, 0], [0, -1, 0], [p.w * 1.05, p.d * 1.04], f.fit());   // the hood: a greeble over the top, past the front
      const cols = n <= 2 ? n : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols), cw = p.d * 0.82 / cols, rh = p.h * 0.8 / rows, rr = Math.min(cw, rh) * 0.42;
      for (let i = 0; i < n; i++) {
        const yy = p.y - p.d * 0.41 + cw * ((i % cols) + 0.5), zz = p.z + p.h * 0.1 + rh * (Math.floor(i / cols) + 0.5), pro = rr * (L.trait === 'bunker' ? 3.2 : 2.6);
        f.card([front + 0.03, yy, zz], [0, 1, 0], [0, 0, 1], [rr * 2.2, rr * 2.2], ring);                                   // the tube's mouth
        f.card([front + pro / 2, yy, zz], [1, 0, 0], [0, 0, 1], [pro, rr * 1.15], tip); f.card([front + pro / 2, yy, zz], [1, 0, 0], [0, 1, 0], [pro, rr * 1.15], tip);   // the warhead, out of it
      }
    });
    if (kind === 1) box(-w * 0.35, -0.08, z0 + h * 0.3, w * 0.6, 0.16, h * 0.4, { roof: null, strip: true });   // the bridge between the twins
    if (L.trait === 'seeker') core(w / 2 + 0.12, 0, z0 + h + 0.2, 0.18);
    f.B.recipe = `mount${neck ? ' + neck' : ''} + ${['a pod', 'twin pods', 'stacked pods'][kind]}, ${total} missiles${L.trait ? ' · ' + L.trait : ''}`; return;
  }
  const hw = v(1.0, 1.35), hd = v(0.85, 1.1), hh = v(0.45, 0.65), kind = Math.floor(R() * 3);
  if (kind === 0) { box(-hw / 2, -hd / 2, z, hw, hd, hh, { roof: f.tile(), wall: f.panel() || f.wall(), strip: true }); flanges(f, hw, hd, z + hh / 2, 'x', hh * v(1.3, 1.7)); }
  else if (kind === 1) { const r = Math.max(hw, hd) / 2 * 0.85; cyl(0, 0, z, r, hh); fins(f, z + hh / 2, r, hh * 1.25, 6 + Math.floor(R() * 3), 'plates'); }
  else PARTS.body.H(f, { z, r: Math.max(hw, hd) / 2 * 0.85 }, 0.8, 'x');
  const bz = z + hh * 0.55, x0 = 0.42, n = L.barrels || 1, Lb = v(1.3, 1.7) * len, t = (fam === 'gun' ? 0.3 : 0.26) * th * (L.trait === 'ember' ? 1.25 : 1), gap = t * 1.35;
  const ys = n === 1 ? [0] : n === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap], band = f.band(), spanY = ys[ys.length - 1] - ys[0] + t, ring = f.mount(), tip = x0 + Lb;
  if (L.trait === 'rail') { for (const k of [-1, 1]) box(x0, k * t * 0.6 - t * 0.25, bz - t / 2, Lb, t * 0.5, t, { wall: band, roof: null }); for (let k = 1; k <= 5; k++) light(x0 + Lb * k / 6, 0, bz, 0.05); }   // two rails, the charge glowing in the gap
  else for (const y of ys) box(x0, y - t / 2, bz - t / 2, Lb, t, t, { wall: band, roof: null });
  const sLen = Lb * v(0.55, 0.8), sH = Math.max(t * 3.2, spanY * 1.45), sl = f.fit();                  // the SLEEVES: the greeble round the gun
  for (const k of [-1, 1]) f.card([x0 + sLen / 2, k * (spanY / 2 + 0.03), bz], [1, 0, 0], [0, 0, 1], [sLen, sH], sl);
  const cs = Math.max(spanY, t) * 2.3;                                                                // the COLLARS: rings standing across the barrels
  f.card([x0 + 0.05, 0, bz], [0, 1, 0], [0, 0, 1], [cs, cs], ring); if (R() < 0.6) f.card([x0 + sLen + 0.05, 0, bz], [0, 1, 0], [0, 0, 1], [cs * 0.8, cs * 0.8], ring);
  if (L.trait === 'disruptor') for (let k = 1; k <= 3; k++) { const xx = x0 + sLen + (Lb - sLen) * k / 4; f.card([xx, 0, bz], [0, 1, 0], [0, 0, 1], [cs * 0.7, cs * 0.7], ring); light(xx, 0, bz + cs * 0.3, 0.05); }   // the coils
  if (L.trait === 'ember') for (let k = 0; k < 4; k++) { const xx = x0 + sLen + (Lb - sLen) * (k + 0.5) / 4.5; f.card([xx, 0, bz + t / 2 + 0.11], [1, 0, 0], [0, 0, 1], [0.16, 0.22], rotq(f.fit(), 1)); light(xx, 0, bz + t / 2 + 0.03, 0.05, { color: '#ff7a29' }); }   // the vents
  if (L.trait === 'long') { box(-0.15, -0.12, z + hh, 0.55, 0.24, 0.18, { roof: null, strip: true }); light(0.42, 0, z + hh + 0.09, 0.05); }   // the scope
  for (const y of (L.trait === 'rail' ? [0] : ys)) {
    if (fam === 'beam') { f.card([tip, y, bz], [0, 1, 0], [0, 0, 1], [t * 2.4, t * 2.4], ring); core(tip + 0.05, y, bz, 0.12 * th); }   // the emitter in its ring
    else { const k = L.trait === 'penetrator' ? 2.1 : 1.6; box(tip - 0.16, y - t * k / 2, bz - t * k / 2, 0.24, t * k, t * k, { roof: null }); }   // the muzzle brake (a penetrator's a heavy one)
  }
  if (L.trait === 'auto') f.card([tip - 0.3, 0, bz], [0, 1, 0], [0, 0, 1], [cs * 0.9, cs * 0.9], ring);   // the rotary's front ring
  f.B.recipe = `mount + ${['block', 'drum', 'H'][kind]} + ${n > 1 ? n + ' barrels' : 'a barrel'}${L.trait ? ' · ' + L.trait : ''}`;
}
// ARMOUR (his design, 2026-10-25, second pass: "curvy like a waterfall, angled… no round base… way thicker… the layers offset inside"):
// a plate that bends over like a waterfall's lip — a quarter-pipe profile (the curve runs down, not round) extruded across its width; its
// THICKNESS shows at both ends and at the top and bottom lips. The layers under it are set back INSIDE (a smaller radius, a gap behind
// the one above) and reach further at the top, the bottom and the sides, so every rim shows and none lies on another. The outer plate in
// tiles, the inner ones the greebles; the segments overlap a hair (no seams)
function plate(f, R, t, a0, a1, W, xc, zc, img, edge) {
  if (!img || !edge) return; const n = Math.max(6, Math.round((a1 - a0) / 0.09)), P = (r, a) => [xc + r * Math.sin(a), zc + r * Math.cos(a)], k = 1.05;
  for (let i = 0; i < n; i++) {
    const b0 = a0 + (a1 - a0) * i / n, b1 = a0 + (a1 - a0) * (i + 1) / n, o0 = P(R, b0), o1 = P(R, b1), q0 = P(R - t, b0), q1 = P(R - t, b1);
    f.B.push({ t: 'card', c: [(o0[0] + o1[0]) / 2, 0, (o0[1] + o1[1]) / 2], u: [0, W / 2, 0], v: [(o0[0] - o1[0]) / 2 * k, 0, (o0[1] - o1[1]) / 2 * k], img, src: [0, img.height * i / n, img.width, img.height / n] });   // the face, its picture running down the curve
    for (const side of [-1, 1]) f.B.push({ t: 'card', c: [(o0[0] + o1[0] + q0[0] + q1[0]) / 4, side * W / 2, (o0[1] + o1[1] + q0[1] + q1[1]) / 4], u: [(o1[0] - o0[0]) / 2 * k, 0, (o1[1] - o0[1]) / 2 * k], v: [(o0[0] - q0[0]) / 2, 0, (o0[1] - q0[1]) / 2], img: edge, src: [edge.width * i / n, 0, edge.width / n, edge.height * 0.35], dim: 0.12 });   // its thickness at the two ends
  }
  for (const a of [a0, a1]) { const o = P(R, a), q = P(R - t, a); f.B.push({ t: 'card', c: [(o[0] + q[0]) / 2, 0, (o[1] + q[1]) / 2], u: [0, W / 2, 0], v: [(o[0] - q[0]) / 2, 0, (o[1] - q[1]) / 2], img: edge, src: [0, 0, edge.width, edge.height * 0.35] }); }   // the lips
}
function armorRecipe(f) {
  const { light, v, R } = f, n = 3 + (R() < 0.45 ? 1 : 0), R0 = v(1.5, 1.9), t = v(0.2, 0.28), gap = v(0.12, 0.18), W0 = v(1.8, 2.3), a0 = v(0.02, 0.18), a1 = v(1.3, 1.5), edge = f.band();   // bent over hard: from lying back to falling straight down
  const L = Array.from({ length: n }, (_, k) => ({ R: R0 - k * (t + gap), a0: a0 - k * 0.16, a1: a1 + k * 0.14, W: W0 + k * 0.34 }));
  const xc = -R0 * 0.55; let low = Infinity; for (const l of L) for (const a of [l.a0, l.a1]) low = Math.min(low, l.R * Math.cos(a), (l.R - t) * Math.cos(a)); const zc = 0.06 - low;   // standing on the ground, on its lowest lip
  for (let k = n - 1; k >= 0; k--) plate(f, L[k].R, t, L[k].a0, L[k].a1, L[k].W, xc, zc, k === 0 ? f.tile() : f.fit(), edge);
  for (const a of [a0 + 0.2, a1 - 0.2]) for (const y of [-W0 * 0.38, W0 * 0.38]) light(xc + (R0 + 0.02) * Math.sin(a), y, zc + (R0 + 0.02) * Math.cos(a), 0.05);   // the bolts, in the level's colour
  f.B.recipe = `${n} plates, bent like a waterfall`;
}
// A DRONE CRAFT (his ask: "create the drone itself out of the greebles"): a slab body in the strip's texture with greeble flanges and a
// greeble on its back, cross-bars out to ring rotors glowing underneath — a STANDARD one, a HEAVY gunship (bigger, a gun slung under),
// a LEAN scout (long, two rotors, a tail fin), or a SWARM of the small ones
function droneRecipe(f, L) {
  L = L || {}; const { box, core, light, v } = f, t = L.trait || 'standard';
  if (t === 'swarm') { for (const [x, y, z] of [[0, 0, 1.3], [-1.0, -0.7, 0.9], [0.9, 0.75, 1.05], [-0.7, 1.0, 1.5], [1.0, -0.9, 1.6]]) drone(f, x, y, z, v(0.7, 0.95)); f.B.recipe = 'a swarm of small drones'; return; }
  const k = t === 'heavy' ? 1.35 : t === 'lean' ? 0.85 : 1, z = 1.0, w = 1.4 * k * (t === 'lean' ? 1.45 : 1), d = 0.9 * k * (t === 'lean' ? 0.6 : 1), h = 0.3 * k;
  box(-w / 2, -d / 2, z, w, d, h, { roof: f.tile(), wall: f.panel() || f.wall(), strip: true });
  flanges(f, w, d, z + h / 2, 'x', h * 1.7);
  f.card([0, 0, z + h + 0.03], [1, 0, 0], [0, -1, 0], [w * 0.8, d * 0.9], f.fit());                                  // a greeble on its back
  const ring = f.mount(), rx = w * 0.55, ry = t === 'lean' ? 0 : d * 0.95, rs = (t === 'heavy' ? 0.95 : 0.75) * k;
  const spots = t === 'lean' ? [[rx * 0.9, 0], [-rx * 0.9, 0]] : [[rx, ry], [rx, -ry], [-rx, ry], [-rx, -ry]];
  if (t !== 'lean') for (const x of [rx, -rx]) box(x - 0.06, -ry, z + h * 0.35, 0.12, 2 * ry, 0.1, { roof: null });   // the cross-bars out to the rotors
  for (const [x, y] of spots) { f.disc(x, y, z + h * 0.55, rs / 2, ring); light(x, y, z + h * 0.3, 0.07); }
  core(w / 2 + 0.05, 0, z + h * 0.5, 0.1);                                                                              // its eye
  if (t === 'heavy') { box(0, -0.1, z - 0.22, w * 0.75, 0.2, 0.2, { wall: f.band(), roof: null }); light(w * 0.75 + 0.05, 0, z - 0.12, 0.06); }   // the gun slung under
  if (t === 'lean') { const img = rotq(f.fit(), 1); f.card([-w / 2 - 0.05, 0, z + h + 0.35], [1, 0, 0], [0, 0, 1], 0.8, img, { byH: true }); }   // the tail fin
  f.B.recipe = `${t} drone`;
}
// each technology leans to some parts (picked by the seed — the same technology comes out in many shapes)
const PLAN = {
  shield:   { base: ['drum', 'plinth', 'pylons'], body: ['column', 'stack', 'cage'], top: ['emitter', 'emitter', 'dome'] },
  // the works (the old armour's look was a factory — his call): blocks with flanges, chimneys; a rig of engines and a cage; a busy hall
  works:    { base: ['plinth', 'plinth', 'drum'], body: ['H', 'tower', 'H2'], top: ['chimneys', 'chimneys', 'antennae'] },
  mining:   { base: ['pylons', 'plinth'], body: ['cage', 'tower'], top: ['spire', 'chimneys'] },
  labor:    { base: ['plinth', 'drum'], body: ['H2', 'tower', 'H'], top: ['chimneys', 'plates', 'antennae'] },
  reactor:  { base: ['drum', 'plinth', 'pylons'], body: ['cage', 'column', 'stack'], top: ['core', 'emitter', 'core'] },
  drive:    { base: ['pylons', 'nozzle', 'nozzle'], body: ['column', 'stack', 'H'], top: ['spire', 'core', 'none'] },
  thruster: { base: ['nozzle', 'pylons'], body: ['stack', 'column', 'cage'], top: ['none', 'core', 'spire'] },
  computer: { base: ['plinth', 'drum'], body: ['tower', 'H2', 'H'], top: ['antennae', 'dish', 'spire'] },
  sensors:  { base: ['drum', 'pylons', 'plinth'], body: ['column', 'cage', 'stack'], top: ['dish', 'dome', 'dish'] },
  drones:   { base: ['plinth', 'drum'], body: ['H', 'tower', 'stack'], top: ['swarm'] },
};
function deviceRecipe(fam, f, look) {
  const { box, cyl, dome, core, light, v, R } = f, D = DEVICES[fam] || {}, P = PLAN[fam];
  if (fam === 'armor') { armorRecipe(f); return; }
  if (D.farm) { buildingRecipe('farm', f); centre(f.B); f.B.recipe = 'fields, glasshouses, a silo'; return; }   // the building's farm (his call: "way, way nicer")
  if (P) {
    const pick = l => l[Math.floor(R() * l.length)], b = pick(P.base), y = pick(P.body), t = pick(P.top);
    let x = PARTS.base[b](f); x = PARTS.body[y](f, x); PARTS.top[t](f, x);
    for (let k = 0; k < 3; k++) { const a = R() * Math.PI * 2; light(Math.cos(a) * 0.7, Math.sin(a) * 0.7, v(0.2, 0.6), 0.05); }   // a few lights of its level
    f.B.recipe = `${b} + ${y} + ${t}`;
  } else if (D.craft) { droneRecipe(f, look);
  } else if (D.weapon) { weaponRecipe(fam, f, look);
  } else if (D.farm) {                                                                // the crops' bed, a glasshouse, and the style's pieces stood up round it like stalks
    box(-1.25, -1.25, 0, 2.5, 2.5, 0.35, { roof: 'field', strip: false }); flanges(f, 2.5, 2.5, 0.25, 'x', 0.5);
    dome(0.3, 0.25, 0.35, v(0.7, 0.95), { color: '#b6f08a' });
    for (const [x, y] of [[-0.85, -0.85], [-0.9, 0.7], [0.8, -0.9]]) if (R() < 0.8) { const h = v(0.8, 1.3); f.cross(x, y, 0.35 + h / 2, h, rotq(f.fit(), 1), { byH: true, a: R() * Math.PI }); }
  }
}
export function drawDevice(fam, styleStock, { seed = 1, level = 3, yaw = 0, U = null, width = 250, look = null } = {}) {
  const f = builder(rnd(fam + ':' + seed + ':' + styleStock.style), stockSet(styleStock)); f.glow = levelColor(level);
  deviceRecipe(fam, f, look);
  if (!U) U = Math.min(64, width / (2 * bounds(f.B).rho * Math.SQRT2 * C30));   // every device as wide as the frame (a long gun is not a speck)
  const glow = levelColor(level), farm = DEVICES[fam] && DEVICES[fam].farm;
  if (DEVICES[fam] && DEVICES[fam].weapon) yaw -= 0.6;
  if (fam === 'armor') yaw -= 0.5;   // armour from the side at three quarters: the bend of its profile and the layers stepping back under it   // a weapon from three quarters: its side, the greebles round the barrels
  const cv = renderSolids(f.B, { U, yaw, glow, light: glow || '#ffffff', glass: farm ? '#b6f08a' : glow || '#e6f0ff', wash: glow && !farm ? glow : null, washA: 0.12, seed });
  cv.recipe = f.B.recipe || ''; return cv;   // which parts it was built of (the grammar)
}
// the technology's ICON over the hardware (his example: the ice icon over the frost-hardy farm) — top right, on a dark coin
const ICON_IMG = new Map();
export async function iconBadge(cv, name, color = null) {
  const key = name + '|' + (color || ''); let img = ICON_IMG.get(key);
  if (!img) { const svg = ticon(name, { size: 64, color: color || ICON_COLOR[name] || '#fff' }); if (!svg) return cv; img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))); ICON_IMG.set(key, img); }
  const g = cv.getContext('2d'), r = Math.max(14, Math.min(26, cv.width * 0.075)), x = cv.width - r - 8, y = r + 8;
  g.save(); g.fillStyle = 'rgba(6,10,20,.85)'; g.strokeStyle = color || ICON_COLOR[name] || '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); g.drawImage(img, x - r * 0.68, y - r * 0.68, r * 1.36, r * 1.36); g.restore();
  return cv;
}

export const styleIds = () => Object.keys(STYLES).filter(id => STYLES[id].deco);
