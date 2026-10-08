// Draws a design's silhouette: the hull, the guns on it, the fields its shields throw (red where
// none reaches), the gantry openings of a dock, the ground under a structure, and how much of the
// space dock's room it takes.
import { CLASS_NAME, KINDS } from './modules.js';

const CLASS_COLOR = { starship: '#5fe3d0', platform: '#7ef3b0', structure: '#ffb347' };
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

// ds: designStats(...) · fit: { area, cap, sections, label } or null (how it sits in the best dock you have)
// selMod: the open module — its guns are lit yellow
export function drawHull(canvas, ds, fit, selMod = null) {
  const g = canvas.getContext('2d'), Wc = canvas.width, Hc = canvas.height;
  g.clearRect(0, 0, Wc, Hc);
  if (!ds) return;
  const { hull, t, shields, mounts } = ds;
  const px = Math.max(10, Math.min(72, (Wc - 90) / (hull.bw + 1), (Hc - 80) / (hull.bh + 1.2)));        // pixels per square
  const cx = Wc / 2 - (hull.box.minx + hull.bw / 2) * px, cy = Hc / 2 - 6 - (hull.box.miny + hull.bh / 2) * px;
  const X = x => cx + x * px, Y = y => cy + y * px;
  canvas._map = { X, Y, px, cx, cy };                                    // so the page can point at things on the hull, and drag them
  g.fillStyle = 'rgba(140,180,240,.13)';
  for (let x = Math.floor(-cx / px); x <= (Wc - cx) / px; x++) for (let y = Math.floor(-cy / px); y <= (Hc - cy) / px; y++) g.fillRect(X(x) - 1, Y(y) - 1, 2, 2);

  const hullPath = () => { g.beginPath(); hull.poly.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.closePath(); };
  const color = t.dock ? '#e8c56b' : CLASS_COLOR[t.klass], side = hull.klass === 'structure';
  const paint = () => {
    const gr = side ? g.createLinearGradient(0, Y(hull.box.miny), 0, Y(hull.box.maxy)) : g.createLinearGradient(X(hull.box.minx), 0, X(hull.box.maxx), 0);
    gr.addColorStop(0, side ? color : shade(color, 0.45)); gr.addColorStop(1, side ? shade(color, 0.45) : color);
    hullPath(); g.fillStyle = gr; g.fill();
    g.save(); hullPath(); g.clip(); g.strokeStyle = 'rgba(4,7,15,.35)'; g.lineWidth = 1;       // plating, one line per square
    if (side) for (let y = Math.ceil(hull.box.miny); y < hull.box.maxy; y++) { g.beginPath(); g.moveTo(X(hull.box.minx), Y(y)); g.lineTo(X(hull.box.maxx), Y(y)); g.stroke(); }
    else { for (let x = Math.ceil(hull.box.minx); x < hull.box.maxx; x++) { g.beginPath(); g.moveTo(X(x), Y(hull.box.miny)); g.lineTo(X(x), Y(hull.box.maxy)); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(X(hull.box.minx), Y(0)); g.lineTo(X(hull.box.maxx), Y(0)); g.stroke(); }
    g.restore();
  };
  if (side) { g.strokeStyle = 'rgba(158,179,216,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(hull.box.minx) - 30, Y(hull.box.maxy) + 1); g.lineTo(X(hull.box.maxx) + 30, Y(hull.box.maxy) + 1); g.stroke(); }
  if (!side && (t.engines.thruster || t.engines.stardrive)) {           // engines glow at the tail
    const r = px * Math.max(0.6, hull.bh * 0.35), gr = g.createRadialGradient(X(hull.box.minx), Y(0), 0, X(hull.box.minx), Y(0), r);
    gr.addColorStop(0, 'rgba(126,243,176,.55)'); gr.addColorStop(1, 'rgba(126,243,176,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(X(hull.box.minx), Y(0), r, r * 0.7, 0, 0, 7); g.fill();
  }
  if (shields.length && t.cover < 0.999) {                              // unprotected hull in red, the covered part painted over it
    hullPath(); g.fillStyle = 'rgba(255,121,121,.55)'; g.fill();
    g.save(); g.beginPath(); for (const s of shields) { g.moveTo(X(s.x) + s.r * px, Y(s.y)); g.arc(X(s.x), Y(s.y), s.r * px, 0, 7); } g.clip(); paint(); g.restore();
  } else paint();
  hullPath(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.5; g.stroke();
  // the guns: drawn to their size; the open module's are lit; the ones the computer cannot run are red
  for (const m of mounts) {
    const K = KINDS[m.kind], over = m.over, lit = m.modId === selMod, x = X(m.x), y = Y(m.y), r = Math.max(3, px * 0.16) * Math.sqrt(m.size || 1);
    if (lit) { const gr = g.createRadialGradient(x, y, r, x, y, r * 3.2); gr.addColorStop(0, 'rgba(255,210,106,.55)'); gr.addColorStop(1, 'rgba(255,210,106,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3.2, 0, 7); g.fill(); }
    g.strokeStyle = g.fillStyle = lit ? '#ffd26a' : over ? '#ff7979' : K.color; g.lineWidth = 1.5;
    const dir = side ? -Math.PI / 2 : 0;
    if (m.kind === 'weapon_energy') { g.beginPath(); g.arc(x, y, r, 0, 7); over ? g.stroke() : g.fill(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(dir) * r * 2.6, y + Math.sin(dir) * r * 2.6); g.stroke(); }
    else if (m.kind === 'weapon_kinetic') { over ? g.strokeRect(x - r, y - r, 2 * r, 2 * r) : g.fillRect(x - r, y - r, 2 * r, 2 * r); g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(dir) * r * 3.4, y + Math.sin(dir) * r * 3.4); g.stroke(); }
    else if (m.kind === 'weapon_missile') { g.beginPath(); const a = dir; g.moveTo(x + Math.cos(a) * r * 2.2, y + Math.sin(a) * r * 2.2); g.lineTo(x + Math.cos(a + 2.4) * r * 1.6, y + Math.sin(a + 2.4) * r * 1.6); g.lineTo(x + Math.cos(a - 2.4) * r * 1.6, y + Math.sin(a - 2.4) * r * 1.6); g.closePath(); over ? g.stroke() : g.fill(); }
    else { g.beginPath(); g.arc(x, y, r * 1.5, 0, 7); g.stroke(); g.beginPath(); g.arc(x, y, r * 0.6, 0, 7); g.fill(); }
    if (over && !lit) { g.strokeStyle = '#ff7979'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r * 2.2, 0, 7); g.stroke(); }
  }
  // the fields
  for (const s of shields) {
    const gr = g.createRadialGradient(X(s.x), Y(s.y), s.r * px * 0.2, X(s.x), Y(s.y), s.r * px);
    gr.addColorStop(0, 'rgba(207,137,255,0)'); gr.addColorStop(0.8, 'rgba(207,137,255,.08)'); gr.addColorStop(1, 'rgba(207,137,255,.24)');
    g.fillStyle = gr; g.beginPath(); g.arc(X(s.x), Y(s.y), s.r * px, 0, 7); g.fill();
    g.setLineDash([6, 5]); g.strokeStyle = 'rgba(207,137,255,.9)'; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
  }
  // a dock's gantry openings
  t.gantries.forEach((gt, i) => {
    const ox = (hull.box.minx + hull.box.maxx) / 2 + (i - (t.gantries.length - 1) / 2) * (gt.w + 0.6) - gt.w / 2 + 0.3, oy = -gt.h / 2;
    g.fillStyle = 'rgba(4,7,15,.6)'; g.fillRect(X(ox), Y(oy), gt.w * px, gt.h * px);
    g.setLineDash([7, 4]); g.strokeStyle = '#e8c56b'; g.lineWidth = 2; g.strokeRect(X(ox), Y(oy), gt.w * px, gt.h * px); g.setLineDash([]);
    g.strokeStyle = 'rgba(232,197,107,.25)'; g.lineWidth = 1;
    for (let k = 1; k < gt.w; k++) { g.beginPath(); g.moveTo(X(ox + k), Y(oy)); g.lineTo(X(ox + k), Y(oy + gt.h)); g.stroke(); }
    for (let k = 1; k < gt.h; k++) { g.beginPath(); g.moveTo(X(ox), Y(oy + k)); g.lineTo(X(ox + gt.w), Y(oy + k)); g.stroke(); }
    g.fillStyle = '#e8c56b'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.fillText(`GANTRY ${gt.w} × ${gt.h}`, X(ox + gt.w / 2), Y(oy + gt.h / 2) + 4);
  });
  // how much of the dock's room it takes
  if (fit) {
    const bw = 220, bx = 10, by = Hc - 16, k = Math.min(1, fit.area / fit.cap), col = fit.sections > 1 ? '#ff7979' : '#e8c56b';
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(bx, by, bw, 8);
    g.fillStyle = col; g.fillRect(bx, by, bw * k, 8);
    for (let i = 1; i < fit.sections; i++) { g.fillStyle = 'rgba(4,7,15,.9)'; g.fillRect(bx + bw * i / fit.sections - 1, by - 2, 2, 12); }
    g.fillStyle = col; g.font = 'bold 11px sans-serif'; g.textAlign = 'left'; g.fillText(fit.label, bx, by - 6);
  }
  g.fillStyle = 'rgba(158,179,216,.5)'; g.font = 'bold 12px sans-serif'; g.textAlign = 'right';
  g.fillText(`${t.squares} squares · ${t.dock ? 'space dock' : CLASS_NAME[t.klass].toLowerCase()}${!side ? '   NOSE →' : ''}`, Wc - 10, 20);
}
