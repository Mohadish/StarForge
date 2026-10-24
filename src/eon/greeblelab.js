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
  cv.getContext('2d').drawImage(S.img, p.x, p.y, p.w, p.h, 0, 0, cv.width, cv.height); return cv;
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
  const set = { panel, band, fitting, engine: engine.length ? engine : fitting, mount: mount.length ? mount : fitting, downQ: st.flipEngines ? 1 : 3 };   // nozzles point left on most sheets: a quarter turn back puts them down
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
    fit: () => pick(st.fitting), eng: () => pick(st.engine), mount: () => pick(st.mount), tile: () => pick(st.tile), panel: () => pick(st.panel), downQ: st.downQ,
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
  const depth = s => { const [a, b] = s.t === 'box' ? rot(s.x + s.w / 2, s.y + s.d / 2) : s.t === 'card' ? rot(s.c[0], s.c[1]) : rot(s.x, s.y); return a + b; }, band = s => Math.round(depth(s) * 2) / 2, zOf = s => s.t === 'card' ? s.c[2] - Math.abs(s.v[2]) - Math.abs(s.u[2]) : s.z;
  const order = B.slice().sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0) || (a.t === 'card' || b.t === 'card' ? depth(a) - depth(b) || zOf(a) - zOf(b) : band(a) - band(b) || a.z - b.z || depth(a) - depth(b)));   // a card goes by its own centre (a flange on the far side of a block before it, on the near side after)
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
      g.save(); g.setTransform(...curT(g, [ax / img.width, ay / img.width, bx / img.height, by / img.height, TL[0], TL[1]])); g.drawImage(shaded(img, k), 0, 0); g.restore();
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
function buildingRecipe(kind, f) {
  const { box, cyl, dome, core, v, R } = f;
  if (kind === 'generator') {
    box(0, 0, 0, 4, 4, 0.5); const r = v(1.1, 1.5), h = v(1.2, 2.2); cyl(2, 2, 0.5, r, h); cyl(2, 2, 0.5 + h, r * 1.12, 0.22); core(2, 2, 0.5 + h + 0.22 + r * 0.55, r * 0.62);
    for (const [x, y] of [[0.2, 0.2], [3.1, 0.2], [0.2, 3.1]]) if (R() < 0.85) box(x, y, 0.5, 0.7, 0.7, v(0.4, 0.9));
  } else if (kind === 'shield') {
    box(0.5, 0.5, 0, 3, 3, 0.45); const h = v(2.2, 3.2); cyl(2, 2, 0.45, 0.42, h); cyl(2, 2, 0.45 + h, v(1, 1.3), 0.16); core(2, 2, 0.45 + h + 0.5, 0.32);
    for (const [x, y] of [[0.7, 0.7], [2.8, 0.7], [0.7, 2.8]]) box(x, y, 0.45, 0.5, 0.5, v(0.5, 0.9));
    dome(2, 2, 0, 2.6, { last: true });
  } else if (kind === 'farm') {
    for (let i = 0; i < 3; i++) box(i * 1.35, 0, 0, 1.25, 4, 0.18 + i * 0.12, { roof: 'field' });
    dome(4.6, 1.1, 0, v(0.8, 1.1)); dome(4.7, 3.1, 0, v(0.6, 0.9)); cyl(5.4, 0.2, 0, 0.42, v(1.2, 1.8));
  } else if (kind === 'works') {
    const h1 = v(1, 1.8), h2 = v(0.6, 1.2); box(0, 0, 0, 2.6, 2.2, h1); box(2.8, 0.3, 0, 2, 1.8, h2); box(0.6, 2.5, 0, 3, 1.5, v(0.5, 0.9));
    const n = 2 + Math.floor(R() * 2); for (let i = 0; i < n; i++) cyl(0.5 + i * 0.75, 0.5, h1, 0.22, v(0.9, 1.6), { smoke: true });
    box(2.5, 1.0, h2 * 0.8, 0.5, 0.3, 0.25, { roof: null });
  } else if (kind === 'lab') {
    box(0, 0, 0, 3.4, 3.4, 0.7); dome(1.7, 1.7, 0.7, v(1.1, 1.45), { white: true });
    cyl(3.0, 0.4, 0.7, 0.14, v(1.6, 2.4), { cap: null }); cyl(3.0, 0.4, 0.7 + 2, 0.55, 0.08);
    if (R() < 0.7) box(-1.2, 1.0, 0, 1.0, 1.4, 0.5);
  } else { const n = 2 + Math.floor(R() * 2); for (let i = 0; i < n; i++) { const x = i * 1.6, h = v(1.6, 3.2); box(x, 0, 0, 1.4, 1.4, h, { windows: true }); box(x + 0.2, 0.2, h, 1.0, 1.0, v(0.4, 0.9), { windows: true }); } }
}
// the solids about their footprint's centre (so they turn in place)
function centre(B) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of B) { const r = s.t === 'box' ? 0 : (s.r || 0); const a = s.t === 'box' ? [s.x, s.y, s.x + s.w, s.y + s.d] : [s.x - r, s.y - r, s.x + r, s.y + r]; x0 = Math.min(x0, a[0]); y0 = Math.min(y0, a[1]); x1 = Math.max(x1, a[2]); y1 = Math.max(y1, a[3]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; for (const s of B) { s.x -= cx; s.y -= cy; } return B;
}
export function drawBuilding(kind, styleStock, { seed = 1, U = 34, tint = true, yaw = 0 } = {}) {
  const A = ARCHETYPES[kind] || ARCHETYPES.generator, f = builder(rnd(kind + ':' + seed + ':' + styleStock.style), stockSet(styleStock));
  buildingRecipe(kind, f);
  return renderSolids(centre(f.B), { U, yaw, glow: A.glow, glass: A.glow, wash: tint ? A.tint : null, washA: 0.55, seed });
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
    legs(f) { const s = f.v(0.75, 1.05), lh = f.v(0.7, 1.1), img = rotq(f.eng(), f.downQ); for (const [x, y] of [[-s, -s], [s, -s], [s, s], [-s, s]]) f.cross(x, y, lh / 2, lh, img, { byH: true, a: Math.PI / 4 }); f.box(-s * 1.15, -s * 1.15, lh, s * 2.3, s * 2.3, 0.2, { roof: f.tile(), strip: true }); return { z: lh + 0.2, r: s * 1.05 }; },
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
    swarm(f, x) { for (let k = 0; k < 3; k++) { const px = f.v(-x.r, x.r), py = f.v(-x.r, x.r), z = x.z + f.v(0.5, 1.3), a = f.R() * Math.PI; f.card([px, py, z], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], f.v(0.55, 0.8), f.fit()); f.light(px, py, z - 0.05, 0.07); } return x; },
    none(f, x) { return x; },
  },
};
// each technology leans to some parts (picked by the seed — the same technology comes out in many shapes)
const PLAN = {
  shield:   { base: ['drum', 'plinth', 'legs'], body: ['column', 'stack', 'cage'], top: ['emitter', 'emitter', 'dome'] },
  armor:    { base: ['plinth', 'drum', 'plinth'], body: ['H', 'tower', 'H2'], top: ['none', 'plates', 'antennae'] },
  reactor:  { base: ['drum', 'plinth', 'legs'], body: ['cage', 'column', 'stack'], top: ['core', 'emitter', 'core'] },
  drive:    { base: ['legs', 'nozzle', 'nozzle'], body: ['column', 'stack', 'H'], top: ['spire', 'core', 'none'] },
  thruster: { base: ['nozzle', 'legs'], body: ['stack', 'column', 'cage'], top: ['none', 'core', 'spire'] },
  computer: { base: ['plinth', 'drum'], body: ['tower', 'H2', 'H'], top: ['antennae', 'dish', 'spire'] },
  sensors:  { base: ['drum', 'legs', 'plinth'], body: ['column', 'cage', 'stack'], top: ['dish', 'dome', 'dish'] },
  drones:   { base: ['plinth', 'drum'], body: ['H', 'tower', 'stack'], top: ['swarm'] },
};
function deviceRecipe(fam, f, look) {
  const { box, cyl, dome, core, light, v, R } = f, D = DEVICES[fam] || {}, P = PLAN[fam];
  if (P) {
    const pick = l => l[Math.floor(R() * l.length)], b = pick(P.base), y = pick(P.body), t = pick(P.top);
    let x = PARTS.base[b](f); x = PARTS.body[y](f, x); PARTS.top[t](f, x);
    for (let k = 0; k < 3; k++) { const a = R() * Math.PI * 2; light(Math.cos(a) * 0.7, Math.sin(a) * 0.7, v(0.2, 0.6), 0.05); }   // a few lights of its level
    f.B.recipe = `${b} + ${y} + ${t}`;
  } else if (D.weapon) {                                                              // a weapon on its mount: barrels by its look (weaponart.js / traits.js) — its own greebles to come
    const L = look || {}, len = L.len || 1, th = L.thick || 1;
    cyl(0, 0, 0, 0.95, 0.3);
    if (fam === 'missile') {
      box(-0.8, -0.75, 0.3, 1.6, 1.5, 0.8, { strip: true, roof: null }); flanges(f, 1.6, 1.5, 0.7, 'x', 0.95); const n = L.tubes || 4, cols = n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) light(-0.55 + 1.1 * ((i % cols) + 0.5) / cols, -0.5 + 1.0 * (Math.floor(i / cols) + 0.5) / rows, 1.12, 0.09);
      if (L.trait === 'seeker') core(0.85, 0, 0.75, 0.16);
    } else {
      box(-0.7, -0.6, 0.3, 1.3, 1.2, 0.62, { strip: true, roof: f.tile() }); flanges(f, 1.3, 1.2, 0.62, 'x', 0.75);
      const n = L.barrels || 1, Lb = 1.2 * len, t = (fam === 'gun' ? 0.24 : 0.2) * th * (L.trait === 'ember' ? 1.25 : 1), ys = n === 1 ? [0] : n === 2 ? [-0.24, 0.24] : [-0.3, 0, 0.3], band = f.band();
      for (const y of ys) {
        box(0.5, y - t / 2, 0.5, Lb, t, t, { wall: band, roof: null });
        if (fam === 'beam') core(0.5 + Lb + 0.06, y, 0.5 + t / 2, 0.15 * th);
        else box(0.5 + Lb - 0.12, y - t * 0.8, 0.5 - t * 0.3, 0.22, t * 1.6, t * 1.6, { roof: null });   // the muzzle brake
        if (L.trait === 'disruptor' || L.trait === 'ember' || L.trait === 'rail') for (let k = 1; k <= 3; k++) light(0.5 + Lb * k / 4, y, 0.5 + t + 0.02, 0.05);
      }
    }
  } else if (D.farm) {                                                                // the crops' bed, a glasshouse, and the style's pieces stood up round it like stalks
    box(-1.25, -1.25, 0, 2.5, 2.5, 0.35, { roof: 'field', strip: false }); flanges(f, 2.5, 2.5, 0.25, 'x', 0.5);
    dome(0.3, 0.25, 0.35, v(0.7, 0.95), { color: '#b6f08a' });
    for (const [x, y] of [[-0.85, -0.85], [-0.9, 0.7], [0.8, -0.9]]) if (R() < 0.8) { const h = v(0.8, 1.3); f.cross(x, y, 0.35 + h / 2, h, rotq(f.fit(), 1), { byH: true, a: R() * Math.PI }); }
  }
}
export function drawDevice(fam, styleStock, { seed = 1, level = 3, yaw = 0, U = null, width = 250, look = null } = {}) {
  const f = builder(rnd(fam + ':' + seed + ':' + styleStock.style), stockSet(styleStock));
  deviceRecipe(fam, f, look);
  if (!U) U = Math.min(64, width / (2 * bounds(f.B).rho * Math.SQRT2 * C30));   // every device as wide as the frame (a long gun is not a speck)
  const glow = levelColor(level), farm = DEVICES[fam] && DEVICES[fam].farm;
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
