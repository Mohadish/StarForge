// PAINT — a hull gets its skin from a parts sheet. A RIBBON of hull plating runs along the outline on
// the inside; then along the outline inset one ring; then again — onion rings — until the shape is
// full. A spine ribbon runs nose to tail on top. GREEBLES (small decorations from the style's own
// sheet) are scattered over the plating, some straddling the outline to break it. Engines sit on the
// stern, more of them the bigger the ship, glowing. Then COLOUR: a two-colour WASH that follows the
// rings — one colour at the outline, the other at the core, so it is symmetric by construction — laid
// only on the brighter greys (the deep shadows stay dark) and kept off the engine cones; and LIGHTS:
// the plating's brightest specks, painted again as a coloured bloom. HARD POINTS: the guns sit where
// the game puts them (hull.js hardPoints), each on a turret MOUNT from the style's decoration set — one
// mount per weapon kind, sized like the engines and the gun's own size; the turret itself is drawn by
// the page on top (icons for now, art later), pivoting on the mount's centre. The player draws the
// outline; all of this is automatic, and the ring count IS the ship's size.
// RING WIDTHS: thin at the outline, swelling toward the middle (`ribbon` at the outline, `centre` × the
// hull's half width at the core, rising as depth^power); inner rings may be drawn fatter than their
// band (`innerFat`), the outer ring and the spine are not.
// HOW THE RIBBON IS LAID: as PLANKS — straight pieces of the strip, long where the line runs straight
// and short where it bends, with a little overlap (more where the line bends). The strip is read from
// the NOSE outward along both sides, so a symmetric hull gets a mirrored skin; every ring starts the
// strip somewhere else. Pure canvas work: no DOM beyond the canvases it is handed.
import { bboxOf, areaOf, edgeAt, hardPoints } from './hull.js';

export const PAINT = { ribbon: 0.9, centre: 0.75, spineW: 0.6, innerFat: 1.25, power: 1.5, pitch: 1, grid: 2, step: 3, plank: 2.2, turn: 0.35, overlap: 0.12, shift: 0.37,
  engineSize: 1, engineN: 0, glow: true, greebles: true, greebleN: 0, greebleSize: 1, seed: 0, innerOnTop: true, spine: true, engines: true, outline: false, base: 'ribbon', maxRings: 40,
  wash: 0, washA: '#7fb2e5', washB: '#e5b07f', lights: 0, lightColor: '#9fd8ff', guns: [], mounts: true, mountSize: 1 };
// guns: [{ kind, n, size }] the weapons aboard (kind as in modules.js KINDS; size = the gun's volume ratio, 1 = standard) ·
// mounts: draw a turret mount under every hard point · mountSize: × the mount's natural size (80 % of the engine's)
const MOUNT_OF = { weapon_energy: 0, weapon_kinetic: 1, weapon_missile: 2, hangar: 0 };   // which of the style's three mounts each kind sits on
// hardpoints (option): the hard points GIVEN, in hull squares [{ kind, x, y, size }] — the battle's own, so the mounts sit
// exactly under its turrets; when given, `guns` is ignored and nothing is moved (only the width cap applies)

// THE LOCKED RECIPE (his settings, 2026-10-07): the painter page and the battle both dress a hull from these, by its volume
export const RECIPE = { ribPct: 47, ribRange: [0.4, 1.6], engine: 1.32, centre: 0.67, spine: 0.61, fat: 1.75, greeble: 1.6, mount: 1, turret: 1 };
export const autoRibbonPct = v => Math.max(0, RECIPE.ribPct - 3 * Math.max(0, v - 100) / 500);   // the outer ribbon: 47 % of its range on the smallest hull, 3 % less per 500 of volume
export const autoEngines = v => Math.max(1, Math.round(v / 280));                                   // one engine per ~280 of volume
export const pct = (p, [lo, hi]) => lo + Math.max(0, Math.min(100, p)) / 100 * (hi - lo);
export const recipeFor = v => ({ ribbon: pct(autoRibbonPct(v), RECIPE.ribRange), centre: RECIPE.centre, spineW: RECIPE.spine, innerFat: RECIPE.fat, engineSize: RECIPE.engine, engineN: autoEngines(v), greebleSize: RECIPE.greeble, mountSize: RECIPE.mount });
// ribbon: the OUTER ring's width in hull squares · centre: the core ring's width as a share of the hull's half width ·
// spineW: the spine ribbon's width, same share · innerFat: inner rings are drawn this much fatter than their band ·
// power: how the width rises with depth · pitch: the next ring sits this far in (× the ring's width); 1 = edge to edge ·
// grid: px per distance cell · step: px between samples · plank: longest plank (× ring width) · turn: a plank ends when
// the line has turned this much (rad) · overlap: planks overrun their ends by this (× ring width) · shift: where ring k
// starts reading the strip, k × this × strip width · engineSize: × the engine's natural size (30 % of the half width,
// never under 60 % of the outer ribbon) · engineN: how many engines are wanted (0 = by ring count) · glow: engine
// light · greebles / greebleN / greebleSize / seed: decorations on, how many (0 = by area), × their natural size (the
// engine's), another scatter · base: what lies under the plating: 'none' | 'ribbon' | 'tone' · wash: 0–1 how strong
// the two-colour wash is, washA at the outline → washB at the core · lights: 0–1 how bright the bloom on the
// plating's brightest specks is, in lightColor

// Euclidean distance transform (Felzenszwalb & Huttenlocher) of a 0/1 mask: for every inside cell, how far
// to the nearest outside cell, in cells. INF is a big FINITE number on purpose: INF − INF must be 0, not NaN.
function edt(mask, W, H) {
  const INF = 1e10, N = Math.max(W, H), f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1), out = new Float64Array(W * H);
  const dt1 = n => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = mask[y * W + x] ? INF : 0; dt1(H); for (let y = 0; y < H; y++) out[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = out[y * W + x]; dt1(W); for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(d[x]); }
  return out;
}
// marching squares: the closed curves where the distance field equals `level`, as polylines in cell coordinates
function contours(dist, W, H, level) {
  const segs = [], t = (va, vb) => va === vb ? 0.5 : (level - va) / (vb - va);
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const a = dist[y * W + x], b = dist[y * W + x + 1], c = dist[(y + 1) * W + x + 1], d = dist[(y + 1) * W + x];
    const code = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
    if (code === 0 || code === 15) continue;
    const T = [x + t(a, b), y], R = [x + 1, y + t(b, c)], Bt = [x + t(d, c), y + 1], L = [x, y + t(a, d)];
    switch (code) {
      case 1: segs.push([L, Bt]); break; case 2: segs.push([Bt, R]); break; case 3: segs.push([L, R]); break; case 4: segs.push([T, R]); break;
      case 5: segs.push([T, L], [Bt, R]); break; case 6: segs.push([T, Bt]); break; case 7: segs.push([T, L]); break; case 8: segs.push([T, L]); break;
      case 9: segs.push([T, Bt]); break; case 10: segs.push([T, R], [Bt, L]); break; case 11: segs.push([T, R]); break; case 12: segs.push([L, R]); break;
      case 13: segs.push([Bt, R]); break; case 14: segs.push([L, Bt]); break;
    }
  }
  const key = p => (Math.round(p[0] * 64) + ',' + Math.round(p[1] * 64)), at = new Map();
  segs.forEach((s, i) => { for (const p of s) { const k = key(p); if (!at.has(k)) at.set(k, []); at.get(k).push(i); } });
  const used = new Uint8Array(segs.length), loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1; const loop = [segs[i][0], segs[i][1]]; let end = segs[i][1];
    for (let guard = 0; guard < segs.length; guard++) {
      const next = (at.get(key(end)) || []).find(j => !used[j]); if (next === undefined) break;
      used[next] = 1; const s = segs[next], p = key(s[0]) === key(end) ? s[1] : s[0]; loop.push(p); end = p;
      if (key(end) === key(loop[0])) break;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}
// a polyline sampled every `step` px: position, tangent, arc length (closed: the last leg returns to the start)
function sample(pts, step, closed) {
  const out = []; let acc = 0, u = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); if (len < 1e-6) continue;
    const tx = dx / len, ty = dy / len; let s = acc;
    while (s < len) { out.push({ x: a[0] + tx * s, y: a[1] + ty * s, tx, ty, s: u + s }); s += step; }
    acc = s - len; u += len;
  }
  out.total = u;
  return out;
}
// a closed loop re-rooted at its nose (the frontmost point) and cut into its two sides, each running nose → tail
function halves(loop) {
  let ni = 0; for (let i = 1; i < loop.length; i++) if (loop[i][0] > loop[ni][0]) ni = i;
  const rooted = [...loop.slice(ni), ...loop.slice(0, ni)], S = sample(rooted, 1, true), half = S.total / 2;
  const a = S.filter(p => p.s <= half).map(p => [p.x, p.y]);                        // nose → tail, one way round
  const b = S.filter(p => p.s >= half).map(p => [p.x, p.y]).reverse();              // the rest, read backwards: nose → tail the other way round
  b.unshift([S[0].x, S[0].y]);
  return [a, b].filter(h => h.length >= 2);
}
// cut a sampled open polyline into PLANKS: straight runs that end when the line has turned `turn` or run `maxLen`
function planks(S, maxLen, turn) {
  const out = []; let i = 0;
  while (i < S.length - 1) {
    let j = i, bent = 0;
    while (j + 1 < S.length && S[j + 1].s - S[i].s <= maxLen) {
      const a = Math.atan2(S[j].ty, S[j].tx), b = Math.atan2(S[j + 1].ty, S[j + 1].tx); let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
      if (bent + d > turn && j > i) break; bent += d; j++;
    }
    if (j === i) j = i + 1;
    out.push({ i, j }); i = j;
  }
  return out;
}
// a little seeded die, so the same hull gets the same greebles every time it is painted
const die = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hashOf = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const hex = h => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
// the sheet's LIGHTS: its brightest specks (the top few per cent by luminance) kept, everything else cleared, in a
// colour — a second sheet painted the same way becomes the bloom. Cached per sheet and colour.
const lightsCache = new WeakMap();
function lightsSheet(img, color) {
  let m = lightsCache.get(img); if (!m) { m = new Map(); lightsCache.set(img, m); }
  if (m.has(color)) return m.get(color);
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height, c = new OffscreenCanvas(W, H), g = c.getContext('2d');
  g.drawImage(img, 0, 0); const id = g.getImageData(0, 0, W, H), d = id.data;
  if (!m.has('_T')) {                                                               // the threshold: the 96th percentile of luminance over the inked pixels
    const hist = new Uint32Array(256); let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++; n++; }
    let acc = 0, T = 255; for (let L = 255; L >= 0; L--) { acc += hist[L]; if (acc >= n * 0.04) { T = L; break; } }
    m.set('_T', Math.max(150, Math.min(240, T)));
  }
  const T = m.get('_T'), [r, gg, b] = hex(color);
  for (let i = 0; i < d.length; i += 4) {
    const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], a = d[i + 3] > 40 && L > T ? Math.min(1, (L - T) / (255 - T) * 1.6) : 0;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = Math.round(a * 255);
  }
  g.putImageData(id, 0, 0); m.set(color, c); return c;
}

// paint one hull. `poly` in hull squares (nose = +x, the spine is y = 0); the canvas is filled.
// `decoImg` (optional) is the style's decoration sheet, already loaded — or the list of its sheets (`style.deco.sheets`
// order; a missing one is null and its greebles are skipped). Returns what it did.
export function paintHull(cv, poly, img, style, opt = {}, decoImg = null) {
  const o = { ...PAINT, ...opt }, g0 = cv.getContext('2d'), W = cv.width, H = cv.height;
  g0.clearRect(0, 0, W, H); if (o.background) { g0.fillStyle = o.background; g0.fillRect(0, 0, W, H); }
  const b = bboxOf(poly), margin = 0.16;
  const S = o.px || Math.min(W * (1 - 2 * margin) / (b.maxx - b.minx), H * (1 - 2 * margin) / (b.maxy - b.miny));   // px per square
  const wc = o.center || [(b.minx + b.maxx) / 2, (b.miny + b.maxy) / 2];           // the world point that sits at the canvas centre (fixed while an outline is being edited)
  const ox = W / 2 - wc[0] * S, oy = H / 2 - wc[1] * S;
  const P = poly.map(([x, y]) => [ox + x * S, oy + y * S]);
  const path = new Path2D(); P.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y)); path.closePath();
  const R = style.ribbon, pitch = o.pitch, raggedness = o.edge ?? style.edge ?? 0, area = areaOf(poly);
  // the distance field: how far every point inside is from the outline (even-odd, so a shape drawn through its own spine has a hole)
  const G = o.grid, Wg = Math.ceil(W / G) + 2, Hg = Math.ceil(H / G) + 2;
  const mc = new OffscreenCanvas(Wg, Hg), mg = mc.getContext('2d'); mg.setTransform(1 / G, 0, 0, 1 / G, 1, 1); mg.fillStyle = '#fff'; mg.fill(path, 'evenodd');
  const md = mg.getImageData(0, 0, Wg, Hg).data, mask = new Uint8Array(Wg * Hg); let maxD = 0;
  for (let i = 0; i < Wg * Hg; i++) mask[i] = md[i * 4 + 3] > 127 ? 1 : 0;
  const dist = edt(mask, Wg, Hg); for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];
  const dAt = (x, y) => { const cx = Math.round(x / G) + 1, cy = Math.round(y / G) + 1; return cx < 0 || cy < 0 || cx >= Wg || cy >= Hg ? 0 : dist[cy * Wg + cx]; };
  const toPx = p => [(p[0] - 1) * G, (p[1] - 1) * G];
  const outward = (x, y, tx, ty) => { const nx = -ty, ny = tx, far = dAt(x + nx * G * 2, y + ny * G * 2), near = dAt(x - nx * G * 2, y - ny * G * 2); return far < near ? [nx, ny] : [-nx, -ny]; };
  // the ring widths: thin at the outline, swelling toward the core
  const deep = maxD * G, wEdge = o.ribbon * S, wCore = Math.max(wEdge, o.centre * deep), wSpine = Math.max(wEdge, o.spineW * deep);
  const widthAt = d => wEdge + (wCore - wEdge) * Math.pow(Math.max(0, Math.min(1, d / deep)), o.power);
  const rings = [];                                                                 // { w, draw, level (cells), shift }
  for (let d = 0, k = 0; k < o.maxRings; k++) {
    const w = widthAt(d); if (d + w * 0.3 >= deep) break;
    rings.push({ w, draw: k === 0 ? w : w * o.innerFat, level: Math.max(0.5, d + w / 2 - (k === 0 ? raggedness * w : 0)) / G, shift: k * o.shift * R.w });
    d += w * pitch;
  }
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const symY = poly.every(([x, y]) => poly.some(([x2, y2]) => Math.abs(x2 - x) < 1e-6 && Math.abs(y2 + y) < 1e-6));   // mirrored across the spine: engines and greebles must be too
  const engineH = Math.max(0.6 * wEdge, 0.3 * deep) * o.engineSize;              // an engine's natural size: it grows with the hull, never under the small-hull minimum

  // ---- the ENGINE plan: ON the stern line, along its mostly-vertical face; symmetric pairs of one type, a lone centre
  // engine of another; as many as the size asks for; banking up in rows when the stern is short ----
  const rearX = y => { let best = Infinity; for (let i = 0; i < P.length; i++) { const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length]; if ((ay <= y) !== (by <= y)) { const x = ax + (y - ay) * (bx - ax) / (by - ay); if (x < best) best = x; } } return best; };
  const E = (() => {
    if (!o.engines || !style.engines?.length) return null;
    const h = wEdge, N = 48, dy = (y1 - y0) / N;
    const face = []; for (let i = 0; i <= N; i++) { const y = y0 + dy * i, x = rearX(y), x2 = rearX(y + dy * 0.5); face.push({ y, x, ok: isFinite(x) && isFinite(x2) && Math.abs(x2 - x) <= dy * 0.5 * 1.3 }); }
    let run = null, cur = null; for (const f of face) { if (f.ok) { if (!cur) cur = { y0: f.y, y1: f.y }; cur.y1 = f.y; if (!run || cur.y1 - cur.y0 > run.y1 - run.y0) run = cur; } else cur = null; }
    if (!run) { const back = P.reduce((a, p) => p[0] < a[0] ? p : a); run = { y0: back[1] - h * 0.5, y1: back[1] + h * 0.5 }; }
    if (symY) { const half = Math.min(oy - run.y0, run.y1 - oy); if (half > 0) run = { y0: oy - half, y1: oy + half }; else run = { y0: oy - h * 0.5, y1: oy + h * 0.5 }; }
    const want = o.engineN || (rings.length <= 2 ? 1 : rings.length <= 6 ? 2 : rings.length <= 9 ? 3 : 4), span = run.y1 - run.y0, pitchE = 0.85;
    let eh = engineH, perRow = Math.max(1, Math.floor(span / (eh * pitchE))), rows = Math.ceil(want / perRow);
    if (rows > 3) { rows = 3; perRow = Math.ceil(want / 3); eh = Math.min(eh, span / (perRow * pitchE)); }
    const n = Math.min(want, perRow * rows), counts = []; for (let r = 0, left = n; r < rows; r++) { const c = Math.ceil(left / (rows - r)); counts.push(c); left -= c; }
    const types = style.engines.length, spots = []; let front = x0;                 // back row first, so the front row overlaps it
    for (let r = rows - 1; r >= 0; r--) {
      const c = counts[r]; if (!c) continue;
      for (let i = 0; i < c; i++) {
        const pair = Math.min(i, c - 1 - i), sp = style.engines[(style.freeEngines ? i + r : pair + r) % types], w = eh * sp.w / sp.h;
        const y = run.y0 + span * (i + 0.5) / c, xr = rearX(y), x = (isFinite(xr) ? xr : x0) + w * 0.35 + r * w * 0.45;
        spots.push({ x, y, w, sp, flip: !style.freeEngines && i > c - 1 - i }); front = Math.max(front, x + w / 2);
      }
    }
    return { eh, rows, n, spots, front };
  })();
  // ---- the HARD POINTS: where the guns sit, by the game's own rule (hull.js), each on a turret MOUNT from the style's
  // decoration set — one mount per weapon kind, sized like the engines × the gun's size; slid onto the plating when the
  // rule lands one off a lopsided hull, and never on the engines ----
  const hps = [], given = !!(o.hardpoints && o.hardpoints.length);
  if (o.mounts && (given || o.guns?.length)) {
    const mountH = engineH * 0.8 * o.mountSize, hull = { poly, box: b, bw: b.maxx - b.minx, bh: b.maxy - b.miny, klass: 'starship' };
    const guns = (o.guns || []).filter(g => g && g.n > 0).map((g, i) => ({ modId: 'g' + i, kind: g.kind, n: Math.round(g.n), size: g.size || 1 }));
    const room = Math.max(1, mountH / S * 1.25 / 0.9), engFront = E ? E.front : x0;    // the spacing rule is in squares: a big mount asks for more
    for (const p of given ? o.hardpoints : hardPoints(hull, guns, room)) {
      const size = p.size || 1, r0 = mountH * Math.sqrt(size) / 2; let x = ox + p.x * S, y = oy + p.y * S;
      if (!given && x - r0 < engFront) x = engFront + r0;
      const e = edgeAt(poly, (x - ox) / S), r = Math.min(r0, (e ? (e.max - e.min) / 2 * S : deep) * 0.42);   // never wider than the hull is there (a needle's guns stay guns)
      if (!given) for (let t = 0; t < 12 && dAt(x, y) * G < r * 0.7 && Math.abs(y - oy) > 1; t++) y += (oy - y) * 0.25;
      hps.push({ kind: p.kind, x, y, r, size, mount: MOUNT_OF[p.kind] ?? 0 });
    }
  }

  // ---- one PASS of the skin onto a context with a given sheet (the real sheets, or their lights) ----
  let greebles = 0, greebleSpots = []; const engines = E ? E.n : 0, rowsUsed = E ? E.rows : 0, cones = [], nozzles = [];
  const pass = (g, sheet, decoSheet, first) => {
    // a straight piece of strip: texture from uTex over `lenTex` px of strip, laid along the local x axis (already
    // translated, rotated and — on the side where the line runs the other way — mirrored by the caller), centred,
    // `hh` tall; the strip is read back and forth (ping-pong) so it never seams
    const strip = (uTex, lenTex, w, hh) => {
      const period = 2 * R.w, k = w / lenTex; let u = ((uTex % period) + period) % period, left = lenTex, x = -w / 2;
      while (left > 1e-6) {
        const fwd = u < R.w, pos = fwd ? u : period - u, room = fwd ? R.w - u : u - R.w, take = Math.min(left, room > 0 ? room : left);
        if (fwd) g.drawImage(sheet, R.x + pos, R.y, take, R.h, x, -hh / 2, take * k, hh);
        else { g.save(); g.translate(x + take * k, 0); g.scale(-1, 1); g.drawImage(sheet, R.x + pos - take, R.y, take, R.h, 0, -hh / 2, take * k, hh); g.restore(); }
        u = (u + take) % period; left -= take; x += take * k;
      }
    };
    // the ribbon along one open run of points, nose first, as planks `hh` tall; `shift` = where this ring starts
    // reading the strip. Each plank reaches a little past both its ends, and more where the line bends there.
    const lay = (pts, shift, hh, upFixed = null) => {
      const Sm = sample(pts, o.step, false); if (Sm.length < 2) return;
      const texScale = R.h / hh, ov = o.overlap * hh;
      const C = planks(Sm, o.plank * hh, o.turn).map(({ i, j }) => { const a = Sm[i], c = Sm[j], dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy) || 1e-6; return { a, c, len, tx: dx / len, ty: dy / len }; });
      const bend = (p, q) => { if (!p || !q) return 0; let d = Math.abs(Math.atan2(q.ty, q.tx) - Math.atan2(p.ty, p.tx)); if (d > Math.PI) d = 2 * Math.PI - d; return Math.min(d, 1.2); };
      C.forEach((c, n) => {
        if (c.len < 0.5) return;
        const e0 = ov + (hh / 2) * Math.tan(bend(C[n - 1], c) / 2), e1 = ov + (hh / 2) * Math.tan(bend(c, C[n + 1]) / 2);
        const w = c.len + e0 + e1, mx = (c.a.x + c.c.x) / 2 + c.tx * (e1 - e0) / 2, my = (c.a.y + c.c.y) / 2 + c.ty * (e1 - e0) / 2;
        const up = upFixed || outward(mx, my, c.tx, c.ty), rx = -up[1], ry = up[0], dir = (c.tx * rx + c.ty * ry) >= 0 ? 1 : -1;   // the strip's top faces out; where the line runs against the frame, the plank is mirrored, not re-read
        g.save(); g.translate(mx, my); g.rotate(Math.atan2(ry, rx)); g.scale(dir, 1); strip(shift + (c.a.s - e0) * texScale, w * texScale, w, hh); g.restore();
      });
    };
    const clipped = fn => { g.save(); g.clip(path, 'evenodd'); fn(); g.restore(); };
    // what lies UNDER the plating, where it has holes: nothing (true alpha), more plating (straight courses of the
    // strip, each read from somewhere else), or the hull's own tone
    if (o.base === 'tone' && first) clipped(() => {
      if (!style._base) { const c1 = new OffscreenCanvas(1, 1), c1g = c1.getContext('2d'); c1g.drawImage(img, R.x, R.y, R.w, R.h, 0, 0, 1, 1); const p = c1g.getImageData(0, 0, 1, 1).data; style._base = `rgb(${Math.round(p[0] * 0.45)},${Math.round(p[1] * 0.45)},${Math.round(p[2] * 0.45)})`; }
      g.fillStyle = o.baseColor || style._base; g.fill(path, 'evenodd');
    });
    else if (o.base === 'ribbon') clipped(() => {
      const hh = Math.max(wEdge, Math.min(wCore, wEdge * 2));
      for (let k = 0, y = y0 + hh * 0.4; y < y1 + hh; y += hh * 0.85, k++) lay([[x1 + hh, y], [x0 - hh, y]], (rings.length + 2 + k) * o.shift * R.w, hh, [0, -1]);
    });
    // the rings. The OUTER one is not clipped: the strip's own ragged edge IS the ship's outline; the inner ones are
    const order = [...rings.keys()]; if (!o.innerOnTop) order.reverse();
    const ring = k => { const r = rings[k]; for (const loop of contours(dist, Wg, Hg, r.level)) for (const side of halves(loop.map(toPx))) lay(side, r.shift, r.draw); };
    for (const k of order) { if (k === 0) ring(0); else clipped(() => ring(k)); }
    if (o.spine) clipped(() => lay([[x1, oy], [x0, oy]], rings.length * o.shift * R.w, wSpine, [0, -1]));   // the spine ribbon, nose to tail, on top
    // GREEBLES: the style's own decorations, scattered over the plating; sized like the engines (a little smaller on
    // a big hull); a share straddle the outline to break it — more of them the smaller the hull. Mirrored in pairs
    // on a symmetric hull. Same style, same seed, same scatter (so the lights pass lands on the same spots) — and
    // NOT tied to the outline's exact coordinates: the draws are relative to the shape, so nudging a point in the
    // editor (and the re-scale when it is let go) keeps the layout instead of reshuffling it. Never on the tip of a
    // pointy nose: a greeble sitting on the point is a pimple, not a fitting.
    const deco = style.deco, dsheets = Array.isArray(decoSheet) ? decoSheet : [decoSheet], dOf = i => dsheets[i || 0] || dsheets[0];   // the decoration sheets: cell[4] says which
    const pool = deco && deco.greebles ? deco.greebles.filter(c => dsheets[c[4] || 0]) : [];                                             // only the greebles whose sheet is in
    if (o.greebles && dsheets[0] && pool.length) {
      const rng = die(hashOf(style.id + '|' + poly.length + '#' + (o.greebleN || 0) + '#' + (o.seed || 0)));
      const want = o.greebleN || Math.max(2, Math.min(16, Math.round(2 + area / 12))), pOut = Math.max(0.15, Math.min(0.65, 1 - area / 25));
      const size = engineH * o.greebleSize * (area > 60 ? 0.8 : 1), perim = sample(P, 2, true), placed = [];
      const inside = (x, y) => dAt(x, y) > 0;
      const onTip = (x, sz) => { if (x < x1 - sz * 1.5) return false; const e = edgeAt(poly, (x - ox) / S); return !e || (e.max - e.min) * S < sz * 1.2; };   // in the nose, and the hull there is narrower than the greeble
      const tryPlace = () => {
        for (let t = 0; t < 40; t++) {
          const sz = size * (0.85 + rng() * 0.4); let x, y;
          if (rng() < pOut) { const p = perim[Math.floor(rng() * perim.length)], up = outward(p.x, p.y, p.tx, p.ty); x = p.x + up[0] * sz * 0.12; y = p.y + up[1] * sz * 0.12; if (onTip(x, sz)) continue; }
          else { x = x0 + rng() * (x1 - x0); y = y0 + rng() * (y1 - y0); if (!inside(x, y) || dAt(x, y) * G < sz * 0.35 || onTip(x, sz)) continue; }
          if (symY && y > oy - sz * 0.15 && Math.abs(y - oy) > sz * 0.15) continue;
          if (placed.some(q => Math.hypot(q.x - x, q.y - y) < (q.sz + sz) * 0.55)) continue;
          if (hps.some(h => Math.hypot(h.x - x, h.y - y) < h.r + sz * 0.5)) continue;        // the hard points are spoken for
          return { x, y, sz, i: Math.floor(rng() * pool.length) };
        }
        return null;
      };
      const spots = [];
      for (let n = 0; spots.length < want && n < want * 3; n++) {
        const p = tryPlace(); if (!p) continue;
        if (symY && Math.abs(p.y - oy) > p.sz * 0.15) { if (spots.length + 2 > want) continue; spots.push(p, { ...p, y: 2 * oy - p.y, flip: true }); placed.push(p); }
        else { spots.push(p); placed.push(p); }
      }
      for (const s of spots) { const sp = pool[s.i], h = s.sz, w = h * sp[2] / sp[3]; g.save(); g.translate(s.x, s.y); g.scale(1, s.flip ? -1 : 1); g.drawImage(dOf(sp[4]), sp[0], sp[1], sp[2], sp[3], -w / 2, -h / 2, w, h); g.restore(); }
      if (first) { greebles = spots.length; greebleSpots = spots.map(s => ({ x: s.x, y: s.y, sz: s.sz })); }
    }
    // the turret MOUNTS, one under every hard point (the turret itself is the page's, drawn on top)
    if (dsheets[0] && deco?.mounts?.length) for (const h of hps) {
      const sp = deco.mounts[h.mount % deco.mounts.length], hh = h.r * 2, w = hh * sp[2] / sp[3];
      g.drawImage(dsheets[0], sp[0], sp[1], sp[2], sp[3], h.x - w / 2, h.y - hh / 2, w, hh);
    }
    // the ENGINES, from the plan
    if (E) for (const s of E.spots) {
      g.save(); g.translate(s.x, s.y); g.scale(style.flipEngines ? -1 : 1, s.flip ? -1 : 1); g.drawImage(sheet, s.sp.x, s.sp.y, s.sp.w, s.sp.h, -s.w / 2, -E.eh / 2, s.w, E.eh); g.restore();
      if (first) { cones.push([s.x - s.w / 2, s.y - E.eh / 2, s.w * 0.36, E.eh]); nozzles.push([s.x - s.w / 2 + E.eh * 0.1, s.y, E.eh]); }   // the cone: the back third of the sprite — the wash keeps off it; the nozzle: where the glow goes
    }
  };
  pass(g0, img, decoImg, true);
  // ---- the WASH: two colours along the rings (outline → core), on the brighter greys only, off the engine cones ----
  if (o.wash > 0) {
    const id = g0.getImageData(0, 0, W, H), d = id.data, A = hex(o.washA), Bc = hex(o.washB), k = o.wash;
    const inCone = (x, y) => { for (const [cx, cy, cw, ch] of cones) if (x >= cx && x < cx + cw && y >= cy && y < cy + ch) return true; return false; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (d[i + 3] < 8) continue;
      const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], wgt = Math.max(0, Math.min(1, (L - 70) / 80)) * k; if (wgt <= 0.01) continue;
      if (cones.length && inCone(x, y)) continue;
      const t = Math.max(0, Math.min(1, dAt(x, y) * G / deep)), lum = L / 255 * 1.15;
      for (let c = 0; c < 3; c++) { const target = (A[c] + (Bc[c] - A[c]) * t) * lum; d[i + c] = Math.round(d[i + c] + (Math.min(255, target) - d[i + c]) * wgt); }
    }
    g0.putImageData(id, 0, 0);
  }
  // ---- the LIGHTS: the plating's brightest specks painted again, in colour, and bloomed ----
  if (o.lights > 0) {
    const lc = new OffscreenCanvas(W, H), lg = lc.getContext('2d');
    pass(lg, lightsSheet(img, o.lightColor), (Array.isArray(decoImg) ? decoImg : [decoImg]).map(d => d ? lightsSheet(d, o.lightColor) : null), false);
    g0.save(); g0.globalCompositeOperation = 'lighter';
    g0.globalAlpha = 0.55 * o.lights; g0.filter = `blur(${Math.max(2, S * 0.08).toFixed(1)}px)`; g0.drawImage(lc, 0, 0);   // the bloom
    g0.filter = 'none'; g0.globalAlpha = 0.5 * o.lights; g0.drawImage(lc, 0, 0);                                            // the specks themselves
    g0.restore();
  }
  // ---- the engine GLOW: a hot core at each nozzle and a soft plume trailing back, on top of everything ----
  if (o.glow) for (const [gx, gy, eh] of nozzles) {
    const col = style.glow || '140,200,255';
    g0.save(); g0.globalCompositeOperation = 'lighter';
    const plume = g0.createLinearGradient(gx, 0, gx - eh * 2.4, 0); plume.addColorStop(0, `rgba(${col},.5)`); plume.addColorStop(1, `rgba(${col},0)`);
    g0.fillStyle = plume; g0.beginPath(); g0.ellipse(gx - eh * 1.2, gy, eh * 1.2, eh * 0.3, 0, 0, 7); g0.fill();
    const core = g0.createRadialGradient(gx, gy, 0, gx, gy, eh * 0.55); core.addColorStop(0, 'rgba(235,248,255,.95)'); core.addColorStop(0.35, `rgba(${col},.55)`); core.addColorStop(1, `rgba(${col},0)`);
    g0.fillStyle = core; g0.beginPath(); g0.arc(gx, gy, eh * 0.55, 0, 7); g0.fill(); g0.restore();
  }
  if (o.outline) { g0.strokeStyle = 'rgba(255,255,255,.45)'; g0.lineWidth = 1; g0.stroke(path); }
  return { rings: rings.length, widths: rings.map(r => Math.round(r.w / S * 100) / 100), core: Math.round(wCore / S * 100) / 100, spine: Math.round(wSpine / S * 100) / 100, engines, engineRows: rowsUsed, engineSq: Math.round(engineH / S * 100) / 100, greebles, px: S, view: { S, ox, oy }, ribbonPx: wEdge, squares: Math.round((b.maxx - b.minx) * 10) / 10 + '×' + Math.round((b.maxy - b.miny) * 10) / 10,
    hardpoints: hps.map(h => ({ kind: h.kind, x: h.x, y: h.y, r: h.r, size: h.size })), mountSq: Math.round(engineH * 0.8 * o.mountSize / S * 100) / 100, greebleSpots };   // the hard points and greebles in canvas px: the page draws the turrets on the former
}
