// THE FAR VIEW'S SYMBOLS (his call 2026-10-21: at a 140 × 70 cell a district is ~25 px — one crisp symbol reads better than a
// cluster of 6-px sprites): a district's kind at three levels, and the landmarks — all drawn in code on the canvas, so they stay
// sharp at any zoom and take the world's palette. Every symbol is drawn in a box of `s` px centred on (x, y), a dark outline behind
// the fill so it reads over any ground. The near view (sprites scattered inside the district) comes later, from the same data.
export const GLYPH_SIZE = [0, 10, 13, 16];          // px by level 1..3
const OUT = 'rgba(6,10,20,.85)';
function shape(g, fill, draw) { g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = 2.6; g.beginPath(); draw(); g.stroke(); g.fillStyle = fill; g.fill(); g.restore(); }
function strokes(g, color, w, draw) { g.save(); g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = w + 2; g.beginPath(); draw(); g.stroke(); g.strokeStyle = color; g.lineWidth = w; g.beginPath(); draw(); g.stroke(); g.restore(); }
const rect = (g, x, y, w, h) => { g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); };
const tri = (g, x, y, w, h) => { g.moveTo(x, y + h); g.lineTo(x + w / 2, y); g.lineTo(x + w, y + h); g.closePath(); };
// ---- districts ----
export function drawDistrict(g, kind, level, x, y, color) {
  const s = GLYPH_SIZE[Math.max(1, Math.min(3, level))], L = Math.max(1, Math.min(3, level)), x0 = x - s / 2, y0 = y - s / 2;
  if (kind === 'housing') {
    if (L === 1) shape(g, color, () => { rect(g, x0 + s * 0.2, y0 + s * 0.45, s * 0.6, s * 0.5); tri(g, x0 + s * 0.1, y0 + s * 0.05, s * 0.8, s * 0.42); });
    else if (L === 2) shape(g, color, () => { for (const [dx, h] of [[0, 0.5], [0.36, 0.7], [0.72, 0.45]]) { rect(g, x0 + s * dx, y0 + s * (1 - h), s * 0.28, s * h); } });
    else shape(g, color, () => { for (const [dx, h] of [[0, 0.55], [0.26, 0.95], [0.52, 0.75], [0.78, 0.6]]) rect(g, x0 + s * dx, y0 + s * (1 - h), s * 0.22, s * h); });
  } else if (kind === 'food') {
    strokes(g, color, L === 3 ? 2.2 : 1.8, () => { for (let k = 0; k < (L === 1 ? 3 : 4); k++) { const yy = y0 + s * (0.2 + k * (L === 1 ? 0.3 : 0.22)); g.moveTo(x0 + s * 0.08, yy); g.lineTo(x0 + s * 0.92, yy); } });
    if (L >= 2) shape(g, color, () => { rect(g, x0 + s * 0.6, y0 + s * 0.05, s * 0.32, s * 0.4); });
    if (L === 3) shape(g, color, () => { g.moveTo(x0 + s * 0.3, y0 + s * 0.42); g.arc(x0 + s * 0.3, y0 + s * 0.25, s * 0.17, 0, 6.283); });
  } else if (kind === 'industry') {
    shape(g, color, () => { rect(g, x0 + s * 0.05, y0 + s * 0.5, s * 0.9, s * 0.45); for (let k = 0; k < L; k++) rect(g, x0 + s * (0.15 + k * 0.28), y0 + s * 0.08, s * 0.16, s * 0.45); });
    if (L >= 2) shape(g, 'rgba(230,236,245,.9)', () => { for (let k = 0; k < L; k++) { const cx = x0 + s * (0.23 + k * 0.28), cy = y0 + s * 0.02; g.moveTo(cx + s * 0.1, cy); g.arc(cx, cy, s * 0.1, 0, 6.283); } });
  } else {                                           // science
    shape(g, color, () => { const cx = x0 + s * 0.5, cy = y0 + s * 0.72, r = s * 0.36; g.moveTo(cx + r, cy); g.arc(cx, cy, r, Math.PI, 0); g.lineTo(cx + r, cy + s * 0.22); g.lineTo(cx - r, cy + s * 0.22); g.closePath(); });
    if (L >= 2) strokes(g, color, 1.8, () => { g.moveTo(x0 + s * 0.5, y0 + s * 0.36); g.lineTo(x0 + s * 0.5, y0 + s * 0.02); if (L === 3) { g.moveTo(x0 + s * 0.3, y0 + s * 0.12); g.lineTo(x0 + s * 0.7, y0 + s * 0.12); } });
    if (L === 3) strokes(g, color, 2, () => { g.moveTo(x0 + s * 0.12, y0 + s * 0.3); g.arc(x0 + s * 0.5, y0 + s * 0.3, s * 0.38, Math.PI, Math.PI * 1.7); });
  }
}
// ---- landmarks: crater, geyser, crystal, anomaly, ridge (mountains), canyon ----
export function drawLandmark(g, name, x, y, pal) {
  const s = 18, x0 = x - s / 2, y0 = y - s / 2, light = pal.light || '#e8ecf2', dark = pal.dark || '#2a2420', accent = pal.accent || '#7ef3b0';
  if (name === 'crater') { shape(g, dark, () => { g.moveTo(x + s * 0.5, y); g.ellipse(x, y, s * 0.5, s * 0.28, 0, 0, 6.283); }); shape(g, light, () => { g.moveTo(x + s * 0.34, y - s * 0.04); g.ellipse(x, y - s * 0.04, s * 0.34, s * 0.17, 0, 0, 6.283); }); shape(g, dark, () => { g.moveTo(x + s * 0.22, y); g.ellipse(x, y, s * 0.22, s * 0.1, 0, 0, 6.283); }); }
  else if (name === 'geyser') { strokes(g, light, 2.2, () => { g.moveTo(x, y + s * 0.45); g.lineTo(x, y - s * 0.3); }); shape(g, light, () => { for (const [dx, dy, r] of [[0, -0.4, 0.16], [-0.18, -0.26, 0.11], [0.18, -0.24, 0.11]]) { g.moveTo(x + s * dx + s * r, y + s * dy); g.arc(x + s * dx, y + s * dy, s * r, 0, 6.283); } }); shape(g, dark, () => { g.moveTo(x + s * 0.3, y + s * 0.45); g.ellipse(x, y + s * 0.45, s * 0.3, s * 0.1, 0, 0, 6.283); }); }
  else if (name === 'crystal') { shape(g, accent, () => { for (const [dx, h, w] of [[-0.22, 0.9, 0.3], [0.1, 1, 0.34], [0.36, 0.6, 0.26]]) { const cx = x + s * dx; g.moveTo(cx, y + s * 0.5); g.lineTo(cx - s * w / 2, y + s * (0.5 - h * 0.45)); g.lineTo(cx, y + s * (0.5 - h)); g.lineTo(cx + s * w / 2, y + s * (0.5 - h * 0.45)); g.closePath(); } }); }
  else if (name === 'anomaly') { shape(g, accent, () => { const r = s * 0.5, q = s * 0.14; g.moveTo(x, y - r); g.lineTo(x + q, y - q); g.lineTo(x + r, y); g.lineTo(x + q, y + q); g.lineTo(x, y + r); g.lineTo(x - q, y + q); g.lineTo(x - r, y); g.lineTo(x - q, y - q); g.closePath(); }); }
  else if (name === 'ridge') { shape(g, pal.rock || '#9a8c74', () => { for (const [dx, h, w] of [[-0.3, 0.6, 0.5], [0.08, 0.95, 0.62], [0.4, 0.7, 0.46]]) tri(g, x + s * (dx - w / 2), y + s * (0.5 - h), s * w, s * h); }); shape(g, light, () => { for (const [dx, h, w] of [[0.08, 0.95, 0.62]]) tri(g, x + s * (dx - w * 0.22), y + s * (0.5 - h), s * w * 0.44, s * h * 0.36); }); }
  else if (name === 'canyon') { strokes(g, dark, 3.2, () => { g.moveTo(x - s * 0.5, y - s * 0.3); g.lineTo(x - s * 0.15, y - s * 0.05); g.lineTo(x + s * 0.05, y + s * 0.2); g.lineTo(x + s * 0.5, y + s * 0.35); }); strokes(g, pal.rock || '#9a8c74', 0.9, () => { g.moveTo(x - s * 0.5, y - s * 0.3); g.lineTo(x - s * 0.15, y - s * 0.05); g.lineTo(x + s * 0.05, y + s * 0.2); g.lineTo(x + s * 0.5, y + s * 0.35); }); }
}
