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
// the stock of a style as the solids want it: roofs, walls, bands, rings, as canvases
function stockSet(styleStock) {
  if (styleStock._set) return styleStock._set;
  const by = k => styleStock.pieces.filter(p => p.kind === k), cvOf = p => p._cv || (p._cv = pieceCanvas(p));
  const roof = [...by('fitting'), ...by('bit')].map(cvOf), wall = [...by('panel'), ...by('bit')].map(cvOf), band = (by('band').length ? by('band') : by('panel')).map(cvOf), ring = (by('mount').length ? by('mount') : by('fitting')).map(cvOf), bit = by('bit').map(cvOf);
  return (styleStock._set = { roof, wall, band, ring, bit: bit.length ? bit : wall });
}
// a builder of solids, seeded, picking from the stock
function builder(R, st) {
  const pick = list => list.length ? list[Math.floor(R() * list.length)] : null, B = [];
  const f = {
    B, R, v: (a, b) => a + (b - a) * R(), pick, roof: () => pick(st.roof), wall: () => pick(st.wall), band: () => pick(st.band), ring: () => pick(st.ring), bit: () => pick(st.bit),
    box: (x, y, z, w, d, h, o = {}) => B.push({ t: 'box', x, y, z, w, d, h, roof: o.roof === undefined ? f.roof() : o.roof, wall: o.wall || f.wall(), ...o }),
    cyl: (x, y, z, r, h, o = {}) => B.push({ t: 'cyl', x, y, z, r, h, band: o.band || f.band(), cap: o.cap === undefined ? f.ring() : o.cap, ...o }),
    dome: (x, y, z, r, o = {}) => B.push({ t: 'dome', x, y, z, r, glass: true, ...o }),
    core: (x, y, z, r, o = {}) => B.push({ t: 'core', x, y, z, r, ...o }),
    light: (x, y, z, r = 0.08, o = {}) => B.push({ t: 'light', x, y, z, r, ...o }),
    halo: (x, y, z, r, o = {}) => B.push({ t: 'ring', x, y, z, r, ...o }),   // a glowing ring in the air (not the stock's ring)
  };
  return f;
}
// the frame that holds the object at every turn: its farthest reach from the centre and its height
function bounds(B) {
  let rho = 0.5, zt = 0.5;
  for (const s of B) {
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
  const depth = s => { const [a, b] = s.t === 'box' ? rot(s.x + s.w / 2, s.y + s.d / 2) : rot(s.x, s.y); return a + b; }, band = s => Math.round(depth(s) * 2) / 2;
  const order = B.slice().sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0) || band(a) - band(b) || a.z - b.z || depth(a) - depth(b));
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
function deviceRecipe(fam, f, look) {
  const { box, cyl, dome, core, light, halo, v, R } = f, D = DEVICES[fam] || {};
  if (fam === 'shield') {
    cyl(0, 0, 0, 1.25, 0.3, { r2: 1.05 });
    if (R() < 0.5) cyl(0, 0, 0.3, 0.42, 1.25, { glowRings: [0.35, 0.75], cap: null });
    else for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; cyl(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.3, 0.19, 1.25, { glowRings: [0.5], cap: null }); }
    cyl(0, 0, 1.55, v(0.95, 1.2), 0.13, { edgeGlow: true }); halo(0, 0, 1.9, v(1.35, 1.6)); core(0, 0, 2.05, 0.3);
    for (let k = 0; k < 6; k++) { const a = k * 1.047; light(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0.32, 0.06); }
  } else if (fam === 'armor') {
    const n = 3 + (R() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) { const s = 2.4 - i * 0.38; box(-s / 2, -s / 2, i * 0.27, s, s, 0.27, { strip: true, roof: i === n - 1 ? f.roof() : null }); }
    const t = (2.4 - (n - 1) * 0.38) / 2 - 0.16; for (const [x, y] of [[-t, -t], [t, -t], [t, t], [-t, t]]) light(x, y, n * 0.27 + 0.02, 0.05);
  } else if (fam === 'reactor') {
    box(-1.55, -1.55, 0, 3.1, 3.1, 0.22, { roof: null, strip: true });
    cyl(0, 0, 0.22, 0.78, 1.45, { glowRings: [0.22, 0.55, 0.88] });
    for (const [x, y] of [[1.12, 0], [-1.12, 0], [0, 1.12], [0, -1.12]]) { const h = v(0.6, 1.0); cyl(x, y, 0.22, 0.26, h); light(x, y, 0.22 + h + 0.05, 0.07); }
    core(0, 0, 0.22 + 1.45 + 0.42, 0.5);
  } else if (fam === 'drive') {
    box(-1.1, -0.9, 0, 2.2, 1.8, 0.45, { strip: true, roof: null });
    cyl(0, 0, 0.45, 0.95, 1.1, { r2: 0.5, glowRings: [0.12] }); core(0, 0, 1.62, 0.36);
    for (const [x, y, w, d] of [[-1.45, -0.08, 0.45, 0.16], [1.0, -0.08, 0.45, 0.16], [-0.08, -1.3, 0.16, 0.4], [-0.08, 0.9, 0.16, 0.4]]) box(x, y, 0.45, w, d, v(0.6, 0.9), { roof: null });
    for (const s of [-1, 1]) cyl(-0.75, s * 0.62, 0.45, 0.22, 0.55);
  } else if (fam === 'thruster') {
    box(-1.2, -1.2, 0, 2.4, 2.4, 0.25, { strip: true, roof: null });
    for (const [x, y] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) { const h = v(0.45, 0.7); cyl(x, y, 0.25, 0.42, h, { r2: 0.27, glowRings: [0.3] }); core(x, y, 0.25 + h + 0.08, 0.15); }
  } else if (fam === 'computer') {
    box(-0.85, -0.65, 0, 1.7, 1.3, 1.2, { windows: true, strip: true }); box(-0.6, -0.45, 1.2, 1.2, 0.9, 0.4, { windows: true });
    cyl(0.4, 0.25, 1.6, 0.06, 0.8, { cap: null }); light(0.4, 0.25, 2.45, 0.09); light(-0.3, -0.2, 1.62, 0.06);
  } else if (fam === 'sensors') {
    cyl(0, 0, 0, 0.95, 0.35, { r2: 0.8 }); cyl(0, 0, 0.35, 0.16, 1.1, { cap: null, glowRings: [0.5] });
    dome(0, 0, 1.45, 0.72, { color: '#bfe6ff' }); halo(0, 0, 1.75, 1.15); light(0, 0, 2.25, 0.08);
  } else if (fam === 'drones') {
    box(-1.25, -0.95, 0, 2.5, 1.9, 0.7, { strip: true });
    for (let k = 0; k < 3; k++) { const x = v(-0.9, 0.9), y = v(-0.7, 0.7), z = v(1.2, 2.0); box(x - 0.22, y - 0.22, z, 0.44, 0.44, 0.12, { roof: f.bit() }); light(x + 0.22, y, z + 0.06, 0.06); }
  } else if (D.weapon) {                                                              // a weapon on its mount: barrels by its look (weaponart.js / traits.js)
    const L = look || {}, len = L.len || 1, th = L.thick || 1;
    cyl(0, 0, 0, 0.95, 0.3);
    if (fam === 'missile') {
      box(-0.8, -0.75, 0.3, 1.6, 1.5, 0.8, { strip: true, roof: null }); const n = L.tubes || 4, cols = n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) light(-0.55 + 1.1 * ((i % cols) + 0.5) / cols, -0.5 + 1.0 * (Math.floor(i / cols) + 0.5) / rows, 1.12, 0.09);
      if (L.trait === 'seeker') core(0.85, 0, 0.75, 0.16);
    } else {
      box(-0.7, -0.6, 0.3, 1.3, 1.2, 0.62, { strip: true });
      const n = L.barrels || 1, Lb = 1.2 * len, t = (fam === 'gun' ? 0.24 : 0.2) * th * (L.trait === 'ember' ? 1.25 : 1), ys = n === 1 ? [0] : n === 2 ? [-0.24, 0.24] : [-0.3, 0, 0.3], band = f.band();
      for (const y of ys) {
        box(0.5, y - t / 2, 0.5, Lb, t, t, { wall: band, roof: null });
        if (fam === 'beam') core(0.5 + Lb + 0.06, y, 0.5 + t / 2, 0.15 * th);
        else box(0.5 + Lb - 0.12, y - t * 0.8, 0.5 - t * 0.3, 0.22, t * 1.6, t * 1.6, { roof: null });   // the muzzle brake
        if (L.trait === 'disruptor' || L.trait === 'ember' || L.trait === 'rail') for (let k = 1; k <= 3; k++) light(0.5 + Lb * k / 4, y, 0.5 + t + 0.02, 0.05);
      }
    }
  } else if (D.farm) {
    box(-1.25, -1.25, 0, 2.5, 2.5, 0.35, { roof: 'field' }); dome(0.3, 0.25, 0.35, 0.85, { color: '#b6f08a' }); cyl(-0.9, -0.9, 0.35, 0.22, 0.8); light(-0.9, -0.9, 1.2, 0.06);
  }
}
export function drawDevice(fam, styleStock, { seed = 1, level = 3, yaw = 0, U = null, width = 250, look = null } = {}) {
  const f = builder(rnd(fam + ':' + seed + ':' + styleStock.style), stockSet(styleStock));
  deviceRecipe(fam, f, look);
  if (!U) U = Math.min(64, width / (2 * bounds(f.B).rho * Math.SQRT2 * C30));   // every device as wide as the frame (a long gun is not a speck)
  const glow = levelColor(level), farm = DEVICES[fam] && DEVICES[fam].farm;
  return renderSolids(f.B, { U, yaw, glow, light: glow || '#ffffff', glass: farm ? '#b6f08a' : glow || '#e6f0ff', wash: glow && !farm ? glow : null, washA: 0.12, seed });
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
