// CLUSTER CHIPS (his pen sketch, 2026-10-21): a standalone diagonal patch of flaky, indented ground with a settlement on it that is
// low around the rim and rises to a cone of spires at the middle. A district grows by laying 2–4 chips over each other — a scattered,
// overlapped array, layered back to front — until it is full, then the next district. Each kind has its own build:
//   housing  — a cone of slender spires with rounded caps, low blocks round the rim, window lights, the faction's tint on the caps
//   industry — low wide halls, round tanks, thin chimneys with smoke, pipes, an orange glow — flat and sprawling, no cone
//   science  — one big dome at the middle, small domes, a dish on a stalk, antenna masts with blue tips, a blue glow ring
// Designed in code (iso primitives) so they take any palette and scale; later an AI pass can "make it cool" from this array.
// Screen space: iso axes ex = (1, .5), ey = (-1, .5); a chip is drawn with its ground centre at (0, 0); units ≈ px at scale 1.
const EX = [1, 0.5], EY = [-1, 0.5];
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const CHIP = { r: [6, 8, 10, 12], hmax: [7, 11, 15, 19], n: [4, 6, 9, 12] };   // the four sizes: ground radius, the cone's top, how many pieces
export const PALETTE = {
  housing:  { ground: [185, 178, 162], top: '#e9ecf1', left: '#b9c0cb', right: '#89909d', light: '#ffd9a0', cap: '#f4f6f9' },
  industry: { ground: [150, 146, 140], top: '#a7abb0', left: '#777b80', right: '#54585d', light: '#ff8c2a', smoke: 'rgba(232,236,240,.8)', pipe: '#6c7178' },
  science:  { ground: [195, 199, 209], top: '#f4f7fc', left: '#c5cde0', right: '#97a2bb', light: '#56b5ff', glow: 'rgba(70,165,255,.5)' },
  // TERRAIN CHIPS (his ask 2026-10-21): mountain ridges and forest patches — the same idea, layered on top of the ground
  ridge:    { ground: [152, 142, 122], left: '#bcb097', right: '#6b6252', snow: '#f5f7f9' },
  forest:   { ground: [62, 98, 54], crown: '#3d7638', lit: '#6ba65a', shade: '#27491f' },
};
const toScreen = (u, v) => [u * EX[0] + v * EY[0], u * EX[1] + v * EY[1]];
// ---- one chip ----
export function makeChip(kind, variant, seed = 1) {
  const rnd = mulberry(seed * 131 + variant * 17 + kind.length * 7), r = CHIP.r[variant], hmax = CHIP.hmax[variant], n = CHIP.n[variant];
  // the footprint BLENDS into the ground (his ask: no ledge, tendrils): three nested jagged rings on the unit circle (× r, squashed
  // 2:1 when drawn), each spikier and fainter outward — the core under the buildings, a mid ring, and a halo of tendrils
  const ring = (m, lo, hi, bite) => { const out = []; for (let k = 0; k < m; k++) { const t = k / m * 6.2832, f = lo + rnd() * (hi - lo) - (rnd() < bite ? (hi - lo) * 0.8 : 0); out.push([Math.cos(t) * f, Math.sin(t) * f]); } return out; };
  const foot = ring(18 + variant * 4, 0.55, 0.85, 0.1), mid = ring(26 + variant * 6, 0.6, 1.15, 0.2), halo = ring(34 + variant * 8, 0.5, 1.55, 0.3);
  const inside = (x, y, m = 0.78) => Math.hypot(x / r, y / (r * 0.5)) <= m;
  const pieces = [], put = p => { pieces.push(p); return p; }, clear = (u, v, a, b) => !pieces.some(q => Math.abs(q.u - u) < q.a + a + 0.3 && Math.abs(q.v - v) < q.b + b + 0.3);
  const spot = (maxR, a, b, tries = 60) => { for (let t = 0; t < tries; t++) { const u = (rnd() - 0.5) * 2 * r * 0.7, v = (rnd() - 0.5) * 2 * r * 0.7, [x, y] = toScreen(u, v); if (!inside(x, y, maxR)) continue; if (!clear(u, v, a, b)) continue; return { u, v, x, y }; } return null; };
  const centreness = (x, y) => Math.max(0, 1 - Math.hypot(x / r, y / (r * 0.5)) / 0.78);
  if (kind === 'housing') {                              // the cone: spires at the middle, blocks round the rim
    for (let i = 0; i < n; i++) { const tall = i < Math.ceil(n * 0.45); const a = tall ? 0.55 + rnd() * 0.5 : 0.9 + rnd() * 0.9, b = tall ? 0.55 + rnd() * 0.5 : 0.9 + rnd() * 0.9;
      const s = spot(tall ? 0.45 : 0.78, a, b); if (!s) continue; const c = centreness(s.x, s.y), h = tall ? hmax * (0.45 + 0.55 * Math.pow(c, 1.2)) * (0.85 + rnd() * 0.3) : 1.2 + rnd() * 1.8 + 1.5 * c;
      put({ ...s, a, b, h, kind: tall ? 'spire' : 'box' }); }
  } else if (kind === 'industry') {                      // flat and sprawling: halls, tanks, chimneys, a pipe or two
    for (let i = 0; i < Math.ceil(n * 0.4); i++) { const a = 1.4 + rnd() * 1.6, b = 0.9 + rnd() * 0.9, s = spot(0.78, a, b); if (s) put({ ...s, a, b, h: 1.3 + rnd() * 1.4, kind: 'box' }); }
    for (let i = 0; i < Math.max(1, Math.round(n * 0.25)); i++) { const rr = 0.8 + rnd() * 0.7, s = spot(0.78, rr, rr); if (s) put({ ...s, a: rr, b: rr, h: 1.4 + rnd() * 1.6, kind: 'tank' }); }
    for (let i = 0; i < Math.max(1, Math.round(n * 0.2)); i++) { const s = spot(0.6, 0.35, 0.35); if (s) put({ ...s, a: 0.3, b: 0.3, h: hmax * (0.55 + rnd() * 0.45), kind: 'chimney' }); }
    for (let i = 0; i < 1 + variant; i++) { const p = pieces[Math.floor(rnd() * pieces.length)], q = pieces[Math.floor(rnd() * pieces.length)]; if (p && q && p !== q) pieces.push({ x: p.x, y: p.y, x2: q.x, y2: q.y, u: 99, v: 99, a: 0, b: 0, h: 0, kind: 'pipe' }); }
  } else if (kind === 'ridge') {                         // a mountain RANGE (his critique: "toothpicks"): wide peaks, ~30° slopes (half-width 1.7 × height), overlapping along a ridge line
    const n0 = 2 + variant, ang = (rnd() - 0.5) * 0.8;   // the ridge line, roughly along the long axis, a little turned
    for (let i = 0; i < n0; i++) { const t = (i / Math.max(1, n0 - 1) - 0.5) * 1.5 * r, u = t * Math.cos(ang), v = t * Math.sin(ang) + (rnd() - 0.5) * r * 0.3, [x, y] = toScreen(u, v);
      const c = Math.max(0, 1 - Math.abs(t) / (0.8 * r)), h = r * (0.28 + 0.34 * c) * (0.85 + rnd() * 0.3), w = h * 1.7; put({ u, v, x, y, a: w, b: w, w, h, kind: 'peak', snow: h > r * 0.44 }); }
  } else if (kind === 'forest') {                        // a forest patch: many small crowns
    for (let i = 0; i < 6 + variant * 5; i++) { const rr = 0.45 + rnd() * 0.55, s = spot(0.9, rr * 0.5, rr * 0.5, 40); if (!s) continue; put({ ...s, a: rr * 0.5, b: rr * 0.5, h: rr, rr, kind: 'tree' }); }
  } else {                                               // science: the big dome, small domes, a dish, masts, a lab block
    const big = 1.6 + variant * 0.4; put({ u: 0, v: 0, x: 0, y: 0.5, a: big, b: big, h: big * 0.9, kind: 'dome', big: true });
    for (let i = 0; i < 1 + (variant >> 1); i++) { const rr = 0.8 + rnd() * 0.6, s = spot(0.78, rr, rr); if (s) put({ ...s, a: rr, b: rr, h: rr * 0.9, kind: 'dome' }); }
    { const s = spot(0.78, 1, 1); if (s) put({ ...s, a: 0.9, b: 0.9, h: 2.2 + variant * 0.6, kind: 'dish' }); }
    for (let i = 0; i < 1 + variant; i++) { const s = spot(0.78, 0.3, 0.3); if (s) put({ ...s, a: 0.2, b: 0.2, h: hmax * (0.6 + rnd() * 0.4), kind: 'mast' }); }
    for (let i = 0; i < Math.max(1, variant); i++) { const a = 1.2 + rnd() * 1.2, b = 0.8 + rnd() * 0.8, s = spot(0.78, a, b); if (s) put({ ...s, a, b, h: 1.1 + rnd() * 0.9, kind: 'box' }); }
  }
  pieces.sort((p, q) => p.y - q.y);
  return { kind, variant, r, foot, mid, halo, pieces };
}
// ---- drawing primitives (screen space, scale s) ----
function poly(g, pts, cx, cy, s) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(cx + x * s, cy + y * s) : g.moveTo(cx + x * s, cy + y * s)); g.closePath(); }
function corners(cx, cy, s, p) { const c = [cx + p.x * s, cy + p.y * s], A = p.a * s, B = p.b * s; return { L: [c[0] - A - B, c[1] - A / 2 + B / 2], Bt: [c[0] + A - B, c[1] + A / 2 + B / 2], R: [c[0] + A + B, c[1] + A / 2 - B / 2], T: [c[0] - A + B, c[1] - A / 2 - B / 2], c }; }
function box(g, cx, cy, s, p, P, topFill) {
  const { L, Bt, R, T } = corners(cx, cy, s, p), H = p.h * s, up = q => [q[0], q[1] - H];
  g.fillStyle = P.left; g.beginPath(); g.moveTo(...L); g.lineTo(...Bt); g.lineTo(...up(Bt)); g.lineTo(...up(L)); g.closePath(); g.fill();
  g.fillStyle = P.right; g.beginPath(); g.moveTo(...Bt); g.lineTo(...R); g.lineTo(...up(R)); g.lineTo(...up(Bt)); g.closePath(); g.fill();
  g.fillStyle = topFill || P.top; g.beginPath(); g.moveTo(...up(L)); g.lineTo(...up(Bt)); g.lineTo(...up(R)); g.lineTo(...up(T)); g.closePath(); g.fill();
  return { L, Bt, R, T, up };
}
function cylinder(g, cx, cy, s, p, P, topFill) {
  const x = cx + p.x * s, y = cy + p.y * s, rx = p.a * s, ry = p.a * s * 0.5, H = p.h * s;
  g.fillStyle = P.left; g.beginPath(); g.moveTo(x - rx, y); g.lineTo(x - rx, y - H); g.lineTo(x, y - H); g.lineTo(x, y + ry); g.closePath(); g.fill();
  g.fillStyle = P.right; g.beginPath(); g.moveTo(x, y + ry); g.lineTo(x, y - H); g.lineTo(x + rx, y - H); g.lineTo(x + rx, y); g.closePath(); g.fill();
  g.fillStyle = P.left; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI); g.fill();
  g.fillStyle = topFill || P.top; g.beginPath(); g.ellipse(x, y - H, rx, ry, 0, 0, 6.283); g.fill();
}
function dome(g, cx, cy, s, p, P) {
  const x = cx + p.x * s, y = cy + p.y * s, rx = p.a * s, ry = p.a * s * 0.5, H = p.h * s;
  g.fillStyle = P.left; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.283); g.fill();
  g.fillStyle = P.top; g.beginPath(); g.ellipse(x, y, rx, H, 0, Math.PI, 0); g.fill();
  g.fillStyle = P.right; g.beginPath(); g.ellipse(x, y, rx, H, 0, -0.5, 0); g.lineTo(x + rx, y); g.closePath(); g.fill();
  g.fillStyle = P.light; g.beginPath(); g.ellipse(x, y, rx * 0.5, H * 0.5, 0, Math.PI, 0); g.fill();
  g.fillStyle = P.top; g.beginPath(); g.ellipse(x, y, rx * 0.5, H * 0.5, 0, Math.PI, 0); g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1;
}
// the ground: the three rings, each a radial fade of the kind's ground colour, clipped to its jagged outline — the halo faint, the
// core nearly solid under the buildings; drawn in the 2:1 squashed space so the rings are ellipses
function ground(g, chip, cx, cy, s, P) {
  const [R, G, B] = P.ground, rs = chip.r * s;
  g.save(); g.translate(cx, cy); g.scale(1, 0.5);
  for (const [pts, a0, a1] of [[chip.halo, 0.28, 0], [chip.mid, 0.55, 0.05], [chip.foot, 0.92, 0.35]]) {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rs * 1.55); grad.addColorStop(0, `rgba(${R},${G},${B},${a0})`); grad.addColorStop(1, `rgba(${R},${G},${B},${a1})`);
    g.fillStyle = grad; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x * rs, y * rs) : g.moveTo(x * rs, y * rs)); g.closePath(); g.fill();
  }
  g.restore();
}
export function drawChip(g, chip, cx, cy, s, { tint = null } = {}) {
  const P = PALETTE[chip.kind];
  ground(g, chip, cx, cy, s, P);
  if (chip.kind === 'science') { g.fillStyle = P.glow; g.beginPath(); g.ellipse(cx, cy + 0.5 * s, chip.r * 0.55 * s, chip.r * 0.28 * s, 0, 0, 6.283); g.fill(); }
  for (const p of chip.pieces) {
    if (p.kind === 'peak') { const x = cx + p.x * s, y = cy + p.y * s, w = p.w * s, h = p.h * s, foot = y + w * 0.18, k1 = 0.55 + 0.2 * ((p.u * 7) % 1), k2 = 0.5 + 0.25 * ((p.v * 5) % 1);   // a broad mountain: two faces, a bent skirt, the sunlit face left
      g.fillStyle = P.left; g.beginPath(); g.moveTo(x - w, y); g.lineTo(x - w * k1, y - h * 0.3); g.lineTo(x, y - h); g.lineTo(x - w * 0.08, foot); g.closePath(); g.fill();
      g.fillStyle = P.right; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + w * k2, y - h * 0.28); g.lineTo(x + w, y); g.lineTo(x - w * 0.08, foot); g.closePath(); g.fill();
      if (p.snow) { g.fillStyle = P.snow; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - w * 0.3, y - h * 0.58); g.lineTo(x - w * 0.1, y - h * 0.66); g.lineTo(x + w * 0.08, y - h * 0.52); g.lineTo(x + w * 0.3, y - h * 0.6); g.closePath(); g.fill(); } continue; }
    if (p.kind === 'tree') { const x = cx + p.x * s, y = cy + p.y * s, rr = p.rr * s;
      g.fillStyle = P.shade; g.beginPath(); g.ellipse(x + rr * 0.35, y + rr * 0.15, rr * 1.1, rr * 0.5, 0, 0, 6.283); g.fill();
      g.fillStyle = P.crown; g.beginPath(); g.arc(x, y - rr * 0.6, rr, 0, 6.283); g.fill();
      g.fillStyle = P.lit; g.beginPath(); g.arc(x - rr * 0.3, y - rr * 0.85, rr * 0.5, 0, 6.283); g.fill(); continue; }
    if (p.kind === 'pipe') { g.strokeStyle = P.pipe; g.lineWidth = Math.max(1, 0.35 * s); g.beginPath(); g.moveTo(cx + p.x * s, cy + p.y * s - 0.6 * s); g.lineTo(cx + p.x2 * s, cy + p.y2 * s - 0.6 * s); g.stroke(); continue; }
    if (p.kind === 'box') { const f = box(g, cx, cy, s, p, P, chip.kind === 'housing' ? tint : null); if (chip.kind === 'industry' && p.h * s > 4) { g.fillStyle = P.light; g.fillRect(f.Bt[0] + s * 0.3, f.Bt[1] - s * 0.8, s * 0.5, s * 0.35); } continue; }
    if (p.kind === 'spire') { const f = box(g, cx, cy, s, p, P, tint); const x = (f.L[0] + f.R[0]) / 2, y = f.up(f.Bt)[1] - p.b * s * 0.5, rr = (p.a + p.b) * s * 0.5;
      g.fillStyle = tint || P.cap; g.beginPath(); g.ellipse(x, y, rr, rr * 0.5, 0, 0, 6.283); g.fill(); g.fillStyle = P.cap; g.beginPath(); g.ellipse(x, y, rr, rr * 0.7, 0, Math.PI, 0); g.fill();
      if (p.h * s >= 5) { g.fillStyle = P.light; const n = Math.floor(p.h * s / 2.5); for (let k = 0; k < n; k++) g.fillRect(f.Bt[0] + s * 0.25, f.Bt[1] - p.h * s + 1.5 + k * 2.5, Math.max(1, s * 0.25), Math.max(1, s * 0.25)); } continue; }
    if (p.kind === 'tank') { cylinder(g, cx, cy, s, p, P); continue; }
    if (p.kind === 'chimney') { cylinder(g, cx, cy, s, p, P, P.right); const x = cx + p.x * s, y = cy + p.y * s - p.h * s; g.fillStyle = P.smoke; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + (0.4 + k * 0.9) * s, y - (0.6 + k * 1.0) * s, (0.5 + k * 0.3) * s, 0, 6.283); g.fill(); } continue; }
    if (p.kind === 'dome') { dome(g, cx, cy, s, p, P); continue; }
    if (p.kind === 'mast') { const x = cx + p.x * s, y = cy + p.y * s; g.strokeStyle = P.right; g.lineWidth = Math.max(1, 0.3 * s); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - p.h * s); g.stroke(); g.fillStyle = P.light; g.beginPath(); g.arc(x, y - p.h * s, Math.max(1, 0.35 * s), 0, 6.283); g.fill(); continue; }
    if (p.kind === 'dish') { const x = cx + p.x * s, y = cy + p.y * s; g.strokeStyle = P.right; g.lineWidth = Math.max(1, 0.35 * s); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - p.h * s); g.stroke();
      g.fillStyle = P.top; g.beginPath(); g.ellipse(x + 0.3 * s, y - p.h * s - 0.2 * s, p.a * 1.3 * s, p.a * 0.75 * s, -0.5, 0, 6.283); g.fill(); g.fillStyle = P.left; g.beginPath(); g.ellipse(x + 0.3 * s, y - p.h * s - 0.2 * s, p.a * 0.8 * s, p.a * 0.45 * s, -0.5, 0, 6.283); g.fill(); continue; }
  }
}
// ---- THE FIELDS (his reference picture): a patchwork of small plots along the iso axes, many greens and yellows, a few browns and
// rare purples and paddies, thin pale tracks between them, a pivot circle here and there — drawn in code into a tile that repeats
// (periodic in ground space, so the screen tile is 2L × L). Used as a canvas pattern clipped to the food districts. ----
const PLOTS = [['#6f9a3c', 5], ['#86b14a', 5], ['#5e8a36', 4], ['#9cb84f', 3], ['#c9b64b', 3], ['#d7c35e', 2], ['#a6894a', 2], ['#8b6a3f', 1.5], ['#b7a24e', 2], ['#7fa36c', 2], ['#7b5fa6', 0.4], ['#5a7fb3', 0.6]];
// the URBAN grid (his idea: the same patchwork, as a sub-layer under the cities and the industry): concrete greys, dark yards, small blocks
const URBAN = [['#a9a8a2', 4], ['#bdbbb4', 3], ['#8f9194', 4], ['#777a7e', 3], ['#c9c6bd', 2], ['#636669', 2], ['#9b968c', 2], ['#575a5e', 1]];
export const urbanTile = (seed = 1, s = 1) => fieldsTile(seed, s, 48, { plots: URBAN, track: 'rgba(52,54,58,.75)', size: 4, stripes: 0, pivots: 0 });
export function fieldsTile(seed = 1, s = 1, L = 48, { plots: PL = PLOTS, track = 'rgba(226,214,170,.75)', size = 6, stripes = 0.5, pivots = 0.12 } = {}) {
  const rnd = mulberry(seed * 977 + 3), leaves = [], split = (u0, v0, u1, v1, depth) => { const du = u1 - u0, dv = v1 - v0; if ((Math.max(du, dv) < size + rnd() * 3 && depth > 1) || depth > 10) { leaves.push([u0, v0, u1, v1]); return; }
    const t = 0.32 + rnd() * 0.36; if (du >= dv) { split(u0, v0, u0 + du * t, v1, depth + 1); split(u0 + du * t, v0, u1, v1, depth + 1); } else { split(u0, v0, u1, v0 + dv * t, depth + 1); split(u0, v0 + dv * t, u1, v1, depth + 1); } };
  split(0, 0, L, L, 0);
  const tot = PL.reduce((a, p) => a + p[1], 0), pick = () => { let r = rnd() * tot; for (const [c, w] of PL) { r -= w; if (r <= 0) return c; } return PL[0][0]; };
  const plots = leaves.map(([u0, v0, u1, v1]) => ({ u0, v0, u1, v1, c: pick(), pivot: Math.min(u1 - u0, v1 - v0) > 5 && rnd() < pivots, stripes: rnd() < stripes }));
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null; if (!cv) return { plots, L };
  cv.width = Math.round(2 * L * s); cv.height = Math.round(L * s); const g = cv.getContext('2d');
  for (const [ou, ov] of [[0, 0], [-L, 0], [L, 0], [0, -L], [0, L], [-L, -L], [L, L], [-L, L], [L, -L]]) {
    g.setTransform(s, 0.5 * s, -s, 0.5 * s, L * s, 0);
    for (const p of plots) { const u0 = p.u0 + ou, v0 = p.v0 + ov, u1 = p.u1 + ou, v1 = p.v1 + ov;
      g.fillStyle = p.c; g.fillRect(u0, v0, u1 - u0, v1 - v0);
      if (p.stripes) { g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 0.35; g.beginPath(); for (let t = u0 + 1; t < u1; t += 1.2) { g.moveTo(t, v0); g.lineTo(t, v1); } g.stroke(); }
      if (p.pivot) { const cu = (u0 + u1) / 2, cv2 = (v0 + v1) / 2, rr = Math.min(u1 - u0, v1 - v0) * 0.42; g.fillStyle = 'rgba(40,80,30,.55)'; g.beginPath(); g.arc(cu, cv2, rr, 0, 6.283); g.fill(); g.strokeStyle = 'rgba(230,220,170,.7)'; g.lineWidth = 0.4; g.beginPath(); g.arc(cu, cv2, rr * 0.55, 0, 6.283); g.stroke(); }
      g.strokeStyle = track; g.lineWidth = 0.45; g.strokeRect(u0, v0, u1 - u0, v1 - v0); }
  }
  g.setTransform(1, 0, 0, 1, 0, 0); return cv;
}
// ---- a district FILLS UP (his direction): its chips by how built it is (fill 0..1) — one small chip first, then more and bigger
// ones packed from the district's heart outward, the biggest at the heart, smaller toward the edge; a full district holds `cap` ----
export function layout(spots, centre, fill, { cap = 8, gap = 4 } = {}) {   // spots: candidate [x, y] on the ground inside the district; gap: px between chips
  if (fill <= 0 || !spots.length) return [];
  const sorted = spots.slice().sort((p, q) => Math.hypot(p[0] - centre[0], (p[1] - centre[1]) * 2) - Math.hypot(q[0] - centre[0], (q[1] - centre[1]) * 2));
  const n = Math.max(1, Math.round(cap * fill)), big = fill < 0.3 ? 0 : fill < 0.6 ? 1 : fill < 0.85 ? 2 : 3, out = [];
  for (const p of sorted) {                                                 // spread across the district: the heart first, then outward, never closer than `gap`
    if (out.length >= n) break; if (out.some(q => Math.hypot(p[0] - q.x, (p[1] - q.y) * 2) < gap)) continue;
    const i = out.length; out.push({ x: p[0], y: p[1], variant: Math.max(0, big - (i === 0 ? 0 : i < 3 ? 1 : i < 6 ? 2 : 3)) });
  }
  return out;
}
// the colony's districts fill in OVERLAPPING stages: the i-th district in the build order starts when the (i × STAGGER)-th slot of
// progress is reached and takes SPAN to fill — the first is done while the second is half way and the third has just begun
export const fillOf = (orderIndex, progress, { stagger = 0.6, span = 3 } = {}) => Math.max(0, Math.min(1, (progress - orderIndex * stagger) / span));
