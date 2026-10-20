// THE PYRAMID'S MATHS — four weights (one per corner, summing to 1) ↔ a point inside a regular tetrahedron. Used by the empire's focus
// (model.js) and, since 2026-10-20, by a colony's development focus (colony.js) — and by the widget that draws both (tetra.js).
// Pure, no imports: the planet sandbox can load the widget without the whole game.
export const CORNERS = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
export const CENTER = [0.25, 0.25, 0.25, 0.25];
export const posOf = w => [0, 1, 2].map(k => w[0] * CORNERS[0][k] + w[1] * CORNERS[1][k] + w[2] * CORNERS[2][k] + w[3] * CORNERS[3][k]);
export function weightsOf(p) {
  const w = CORNERS.map(v => Math.max(0, (1 + p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) / 4));
  const s = w.reduce((a, b) => a + b, 0) || 1;
  return w.map(x => x / s);
}
export function focusDistance(a, b) { const pa = posOf(a), pb = posOf(b); return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) / Math.sqrt(3); }
export function limitMove(w, w0, reach) {
  const d = focusDistance(w0, w);
  if (d <= reach || d === 0) return w;
  const p0 = posOf(w0), p = posOf(w), k = Math.max(0, reach) / d;
  return weightsOf(p0.map((v, i) => v + (p[i] - v) * k));
}
