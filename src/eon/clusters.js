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
  housing:  { ground: '#b9b2a2', edge: '#7a7468', top: '#e9ecf1', left: '#b9c0cb', right: '#89909d', light: '#ffd9a0', cap: '#f4f6f9' },
  industry: { ground: '#9a9690', edge: '#5a5753', top: '#a7abb0', left: '#777b80', right: '#54585d', light: '#ff8c2a', smoke: 'rgba(232,236,240,.8)', pipe: '#6c7178' },
  science:  { ground: '#c3c7d1', edge: '#777d8e', top: '#f4f7fc', left: '#c5cde0', right: '#97a2bb', light: '#56b5ff', glow: 'rgba(70,165,255,.5)' },
};
const toScreen = (u, v) => [u * EX[0] + v * EY[0], u * EX[1] + v * EY[1]];
// ---- one chip ----
export function makeChip(kind, variant, seed = 1) {
  const rnd = mulberry(seed * 131 + variant * 17 + kind.length * 7), r = CHIP.r[variant], hmax = CHIP.hmax[variant], n = CHIP.n[variant];
  // the FLAKY footprint: many vertices, radii in and out (indentations), a few deeper bites
  const foot = []; for (let k = 0, m = 20 + variant * 6; k < m; k++) { const t = k / m * 6.2832, f = 0.62 + rnd() * 0.38 - (rnd() < 0.12 ? 0.25 : 0); foot.push([Math.cos(t) * r * f, Math.sin(t) * r * 0.5 * f]); }
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
  } else {                                               // science: the big dome, small domes, a dish, masts, a lab block
    const big = 1.6 + variant * 0.4; put({ u: 0, v: 0, x: 0, y: 0.5, a: big, b: big, h: big * 0.9, kind: 'dome', big: true });
    for (let i = 0; i < 1 + (variant >> 1); i++) { const rr = 0.8 + rnd() * 0.6, s = spot(0.78, rr, rr); if (s) put({ ...s, a: rr, b: rr, h: rr * 0.9, kind: 'dome' }); }
    { const s = spot(0.78, 1, 1); if (s) put({ ...s, a: 0.9, b: 0.9, h: 2.2 + variant * 0.6, kind: 'dish' }); }
    for (let i = 0; i < 1 + variant; i++) { const s = spot(0.78, 0.3, 0.3); if (s) put({ ...s, a: 0.2, b: 0.2, h: hmax * (0.6 + rnd() * 0.4), kind: 'mast' }); }
    for (let i = 0; i < Math.max(1, variant); i++) { const a = 1.2 + rnd() * 1.2, b = 0.8 + rnd() * 0.8, s = spot(0.78, a, b); if (s) put({ ...s, a, b, h: 1.1 + rnd() * 0.9, kind: 'box' }); }
  }
  pieces.sort((p, q) => p.y - q.y);
  return { kind, variant, r, foot, pieces };
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
export function drawChip(g, chip, cx, cy, s, { tint = null } = {}) {
  const P = PALETTE[chip.kind];
  g.fillStyle = P.edge; poly(g, chip.foot.map(([x, y]) => [x, y + 0.9]), cx, cy, s); g.fill();            // a thin dark lip under the lower edge
  g.fillStyle = P.ground; poly(g, chip.foot, cx, cy, s); g.fill();
  if (chip.kind === 'science') { g.fillStyle = P.glow; g.beginPath(); g.ellipse(cx, cy + 0.5 * s, chip.r * 0.55 * s, chip.r * 0.28 * s, 0, 0, 6.283); g.fill(); }
  for (const p of chip.pieces) {
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
// ---- a district's chips: 2–4 overlapped chips (his "each block is 2, 3, sometimes 4 of these"), bigger with the level; full = 6 ----
export const CHIPS_BY_LEVEL = [[], [0, 0], [1, 0, 0], [2, 1, 0, 0]], CHIPS_FULL = [3, 2, 1, 1, 0, 0];
export function layout(spots, centre, level, { full = false } = {}) {   // spots: candidate [x, y] on the ground inside the district
  const plan = full ? CHIPS_FULL : CHIPS_BY_LEVEL[Math.max(0, Math.min(3, level))];
  const sorted = spots.slice().sort((p, q) => Math.hypot(p[0] - centre[0], (p[1] - centre[1]) * 2) - Math.hypot(q[0] - centre[0], (q[1] - centre[1]) * 2));
  const out = []; for (let i = 0; i < plan.length && i < sorted.length; i++) out.push({ x: sorted[i][0], y: sorted[i][1], variant: plan[i] });
  return out;
}
