// CLUSTER CHIPS (his sketch, 2026-10-21): a standalone diagonal patch of ragged ground with a handful of buildings on it. A district
// grows by laying more chips over each other — a scattered, overlapped array, layered back to front — until it is full, then the next
// district. Designed in code (iso boxes on a jagged footprint) so they take any palette and scale; later an AI pass can "make it
// cool" from this array. Screen space: iso axes ex = (1, .5), ey = (-1, .5); a chip is drawn with its ground centre at (0, 0).
const EX = [1, 0.5], EY = [-1, 0.5];
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const CHIP = {                                                     // the four sizes (variant 0..3): ground radius, how many buildings, their height range
  r: [7, 9.5, 11.5, 13.5], n: [3, 4, 6, 8], h: [[2, 5], [3, 8], [3, 11], [4, 14]],
};
export const PALETTE = {
  housing:  { ground: '#bdb6a6', edge: '#6f6a5f', top: '#e6e9ee', left: '#b7bec9', right: '#8a919e', light: '#ffd9a0' },
  industry: { ground: '#9d9a94', edge: '#4e4c48', top: '#a3a8ad', left: '#767b81', right: '#53575c', light: '#ff9a3c', smoke: 'rgba(235,238,242,.75)' },
  science:  { ground: '#c6c9d2', edge: '#6b7080', top: '#f3f6fb', left: '#c3cbdd', right: '#95a0b8', light: '#5fb8ff', glow: 'rgba(80,170,255,.45)' },
};
// ---- one chip: the ragged footprint + buildings laid on an iso lattice inside it, the tallest toward the middle ----
export function makeChip(kind, variant, seed = 1) {
  const rnd = mulberry(seed * 131 + variant * 17 + kind.length), r = CHIP.r[variant], n = CHIP.n[variant], [h0, h1] = CHIP.h[variant];
  const foot = []; for (let k = 0, m = 10 + variant * 2; k < m; k++) { const t = k / m * 6.2832, jag = (k & 1 ? 0.78 : 1) * (0.9 + rnd() * 0.2); foot.push([Math.cos(t) * r * jag, Math.sin(t) * r * 0.5 * jag]); }
  const boxes = [];
  for (let tries = 0; boxes.length < n && tries < 200; tries++) {
    const u = (rnd() - 0.5) * 2 * r * 0.62, v = (rnd() - 0.5) * 2 * r * 0.62;                       // ground coords (along ex / ey)
    const x = u * EX[0] + v * EY[0], y = u * EX[1] + v * EY[1]; if (Math.hypot(x / r, y / (r * 0.5)) > 0.8) continue;
    const a = 1.1 + rnd() * 1.4, b = 1.1 + rnd() * 1.4; if (boxes.some(q => Math.abs(q.u - u) < q.a + a + 0.4 && Math.abs(q.v - v) < q.b + b + 0.4)) continue;
    const centre = 1 - Math.hypot(x / r, y / (r * 0.5)) / 0.8, h = h0 + (h1 - h0) * (0.35 * rnd() + 0.65 * centre);
    boxes.push({ u, v, x, y, a, b, h, kind: kind === 'industry' && rnd() < 0.35 ? 'chimney' : kind === 'science' && rnd() < 0.3 ? 'dome' : 'box' });
  }
  boxes.sort((p, q) => p.y - q.y);
  return { kind, variant, r, foot, boxes };
}
// ---- drawing: at (cx, cy) on the canvas, scale s px per unit, optional faction tint on the city's tops ----
function poly(g, pts, cx, cy, s) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(cx + x * s, cy + y * s) : g.moveTo(cx + x * s, cy + y * s)); g.closePath(); }
function box(g, cx, cy, s, bx, by, a, b, h, P, tint) {
  const c = [cx + bx * s, cy + by * s], A = a * s, B = b * s, H = h * s;
  const L = [c[0] - A - B, c[1] - A / 2 + B / 2], Bt = [c[0] + A - B, c[1] + A / 2 + B / 2], R = [c[0] + A + B, c[1] + A / 2 - B / 2], T = [c[0] - A + B, c[1] - A / 2 - B / 2];   // ground corners: left, bottom, right, top (back)
  const up = p => [p[0], p[1] - H];
  g.fillStyle = P.left; g.beginPath(); g.moveTo(...L); g.lineTo(...Bt); g.lineTo(...up(Bt)); g.lineTo(...up(L)); g.closePath(); g.fill();
  g.fillStyle = P.right; g.beginPath(); g.moveTo(...Bt); g.lineTo(...R); g.lineTo(...up(R)); g.lineTo(...up(Bt)); g.closePath(); g.fill();
  g.fillStyle = tint || P.top; g.beginPath(); g.moveTo(...up(L)); g.lineTo(...up(Bt)); g.lineTo(...up(R)); g.lineTo(...up(T)); g.closePath(); g.fill();
  return { L, Bt, R, T, up };
}
export function drawChip(g, chip, cx, cy, s, { tint = null } = {}) {
  const P = PALETTE[chip.kind];
  // the ground patch: a dark rim under the lower edge (thickness), then the pale top
  g.fillStyle = P.edge; poly(g, chip.foot.map(([x, y]) => [x, y + 1.2]), cx, cy, s); g.fill();
  g.fillStyle = P.ground; poly(g, chip.foot, cx, cy, s); g.fill();
  if (chip.kind === 'science') { g.fillStyle = P.glow; poly(g, chip.foot.map(([x, y]) => [x * 0.55, y * 0.55]), cx, cy, s); g.fill(); }
  for (const b of chip.boxes) {
    if (b.kind === 'chimney') { box(g, cx, cy, s, b.x, b.y, b.a * 0.45, b.b * 0.45, b.h * 1.5, P); const px = cx + b.x * s, py = cy + (b.y - b.h * 1.5 * 0.5) * s - b.h * 1.5 * s * 0.5;
      g.fillStyle = P.smoke; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(px + (k * 0.9 + 0.6) * s, py - (k * 1.1 + 0.8) * s, (0.7 + k * 0.35) * s, 0, 6.283); g.fill(); } continue; }
    const f = box(g, cx, cy, s, b.x, b.y, b.a, b.b, b.h, P, chip.kind === 'housing' ? tint : null);
    if (b.kind === 'dome') { g.fillStyle = P.top; g.beginPath(); g.arc(cx + b.x * s, cy + b.y * s - b.h * s, Math.min(b.a, b.b) * s * 0.9, Math.PI, 0); g.fill(); g.fillStyle = P.light; g.beginPath(); g.arc(cx + b.x * s, cy + b.y * s - b.h * s, Math.min(b.a, b.b) * s * 0.35, Math.PI, 0); g.fill(); }
    if (b.h * s >= 6) { g.fillStyle = P.light; const n = Math.floor(b.h * s / 3); for (let k = 0; k < n; k++) { g.fillRect(f.Bt[0] + 1, f.Bt[1] - b.h * s + 2 + k * 3, 1, 1); } }   // a window light or two
  }
}
// ---- a district's chips: positions on an iso lattice inside the region, nearest the centre first; how many and how big by level ----
export const CHIPS_BY_LEVEL = [[], [0], [1, 0], [2, 1, 0, 0]], CHIPS_FULL = [3, 2, 1, 1, 0, 0];
export function layout(spots, centre, level, { full = false } = {}) {   // spots: candidate [x, y] on the ground inside the district
  const plan = full ? CHIPS_FULL : CHIPS_BY_LEVEL[Math.max(0, Math.min(3, level))];
  const sorted = spots.slice().sort((p, q) => Math.hypot(p[0] - centre[0], (p[1] - centre[1]) * 2) - Math.hypot(q[0] - centre[0], (q[1] - centre[1]) * 2));
  const out = []; for (let i = 0; i < plan.length && i < sorted.length; i++) out.push({ x: sorted[i][0], y: sorted[i][1], variant: plan[i] });
  return out;
}
