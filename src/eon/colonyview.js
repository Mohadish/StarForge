// THE COLONY'S PICTURES (his pop-up, 2026-10-18): the planet's surface as cells of four slots, the development rectangle with its live
// fillet, the effort triangle — drawn on canvases, shared by the game (app.js, the colony pop-up) and the sandbox (planetlab.js).
// The canvases are drawn at full size and SHOWN to fit: toCanvas() turns a mouse position back into drawing pixels.
import { SLOT, DEV, TRAITS, TRAIT_GLYPH, TRI, FACTORS, FACTOR_COLOR, KIND_WORD, xy, filletR, effectiveDot, isPure, normTri, bOf } from './colony.js';
import { LARGEST } from './districts.js';

export const CELL = 100, GAP = 4, RM = 30, FRAME = LARGEST;            // a cell, the gap between cells, the rectangle's margin, the frame every planet is drawn in (the huge world's)
export const TRI_COLOR = { industry: '#ffb347', research: '#4fa3ff', development: '#f5a3c7' };   // his palette: research blue as science, development pink as housing
export const TRI_PTS = { industry: [28, 222], research: [222, 222], development: [125, 34] };   // on a 250 × 250 canvas
export const mapSize = () => [FRAME.w * (CELL + GAP) + GAP, FRAME.h * (CELL + GAP) + GAP];
export const toCanvas = (cv, e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height]; };
// a smaller world sits centred in the frame
export const originOf = G => [Math.round((FRAME.w - G.w) / 2 * (CELL + GAP)), Math.round((FRAME.h - G.h) / 2 * (CELL + GAP))];
export function cellAt(cv, G, e) {
  const [mx, my] = toCanvas(cv, e), [ox, oy] = originOf(G), lx = mx - ox - GAP, ly = my - oy - GAP, x = Math.floor(lx / (CELL + GAP)), y = Math.floor(ly / (CELL + GAP));
  return lx >= 0 && ly >= 0 && x < G.w && y < G.h && lx % (CELL + GAP) < CELL && ly % (CELL + GAP) < CELL ? y * G.w + x : -1;
}
// a kind's little pattern inside a slot (drawn for 34 px, scaled to the slot): chimneys, furrows, blocks, a dome
export function glyph(g, kind, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 34, s / 34);
  g.fillStyle = FACTOR_COLOR[kind]; g.strokeStyle = FACTOR_COLOR[kind]; g.globalAlpha = 0.9; g.lineWidth = 1;
  if (kind === 'industry') { for (let k = 0; k < 3; k++) g.fillRect(5 + k * 9, 34 - 6 - (k === 1 ? 14 : 9), 4, k === 1 ? 14 : 9); g.fillRect(3, 34 - 6, 28, 2); }
  else if (kind === 'food') { for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(4, 6 + k * 6); g.lineTo(30, 6 + k * 6); g.stroke(); } }
  else if (kind === 'housing') { for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) g.fillRect(5 + j * 9, 6 + k * 11, 6, 8); }
  else { g.beginPath(); g.arc(17, 19, 10.6, Math.PI, 0); g.fill(); g.fillRect(6, 19, 22, 2); }
  g.restore();
}
// the surface: cells as 2 × 2 slot quarters, each kind its colour and its pattern (a placeholder tapestry until his sprites); the crane
// ⚒ where the next slot goes (filled by the builders' progress), a red ✕ on a slot being torn down; planned cells framed in their kinds'
// colours, traits in the corner, the landing a ring, a pure cell marked. opts: { next, hover, frameColor }
export function drawSurface(cv, G, { next = null, hover = -1, frameColor = 'rgba(126,243,176,.45)' } = {}) {
  const g = cv.getContext('2d'), [ox, oy] = originOf(G), half = CELL / 2, spots = [[0, 0], [half, 0], [0, half], [half, half]];
  g.clearRect(0, 0, cv.width, cv.height);
  if (G.w < FRAME.w || G.h < FRAME.h) { g.strokeStyle = 'rgba(255,255,255,.06)'; g.setLineDash([4, 6]); g.strokeRect(ox + GAP - 2.5, oy + GAP - 2.5, G.w * (CELL + GAP) - GAP + 5, G.h * (CELL + GAP) - GAP + 5); g.setLineDash([]); }
  G.cells.forEach((cell, i) => {
    const [x, y] = xy(G, i), px = ox + GAP + x * (CELL + GAP), py = oy + GAP + y * (CELL + GAP), started = cell.slots.length > 0;
    g.fillStyle = started ? '#0f1726' : '#090d18'; g.fillRect(px, py, CELL, CELL);
    for (let s = 0; s < SLOT.per; s++) {
      const [sx, sy] = spots[s], kind = cell.slots[s];
      if (kind && bOf(cell, s) < 1) {                   // GOING UP: faint, filling from the bottom as far as it is built; the crane on the one being built
        const b = bOf(cell, s); g.fillStyle = FACTOR_COLOR[kind]; g.globalAlpha = 0.1; g.fillRect(px + sx + 2, py + sy + 2, half - 4, half - 4);
        g.globalAlpha = 0.5; g.fillRect(px + sx + 2, py + sy + 2 + (half - 4) * (1 - b), half - 4, (half - 4) * b); g.globalAlpha = 1;
        g.strokeStyle = FACTOR_COLOR[kind]; g.setLineDash([3, 3]); g.strokeRect(px + sx + 3.5, py + sy + 3.5, half - 7, half - 7); g.setLineDash([]);
        if (next && next.cell === i && next.slot === s) { g.fillStyle = FACTOR_COLOR[kind]; g.font = '18px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⚒', px + sx + half / 2, py + sy + half / 2 + 1); }
      } else if (kind) {
        g.fillStyle = FACTOR_COLOR[kind]; g.globalAlpha = 0.28; g.fillRect(px + sx + 2, py + sy + 2, half - 4, half - 4); g.globalAlpha = 1; glyph(g, kind, px + sx + 2, py + sy + 2, half - 4);
        if (next && next.demolish && next.cell === i && s === next.slot) {
          const p = Math.min(1, (G.progress || 0) / DEV.demolish); g.fillStyle = 'rgba(255,121,121,.35)'; g.fillRect(px + sx + 2, py + sy + 2, (half - 4) * p, half - 4);
          g.strokeStyle = '#ff7979'; g.setLineDash([3, 3]); g.strokeRect(px + sx + 3.5, py + sy + 3.5, half - 7, half - 7); g.setLineDash([]);
          g.fillStyle = '#ff7979'; g.font = 'bold 20px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✕', px + sx + half / 2, py + sy + half / 2 + 1);
        }
      } else if (next && !next.demolish && !next.partial && next.cell === i && s === cell.slots.length) {
        g.strokeStyle = FACTOR_COLOR[next.kind]; g.setLineDash([3, 3]); g.strokeRect(px + sx + 3.5, py + sy + 3.5, half - 7, half - 7); g.setLineDash([]);
        const p = Math.min(1, next.b || 0); g.fillStyle = FACTOR_COLOR[next.kind]; g.globalAlpha = 0.35; g.fillRect(px + sx + 4, py + sy + half - 4 - (half - 8) * p, half - 8, (half - 8) * p); g.globalAlpha = 1;
        g.fillStyle = FACTOR_COLOR[next.kind]; g.font = '18px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⚒', px + sx + half / 2, py + sy + half / 2 + 1);
      } else if (started) { g.strokeStyle = 'rgba(255,255,255,.08)'; g.strokeRect(px + sx + 3.5, py + sy + 3.5, half - 7, half - 7); }
    }
    g.lineWidth = cell.plan ? 2 : 1; g.strokeStyle = cell.plan ? FACTOR_COLOR[cell.plan[0]] : started ? frameColor : 'rgba(255,255,255,.1)'; g.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1); g.lineWidth = 1;
    if (cell.plan) { g.fillStyle = '#04070f'; g.fillRect(px + 2, py + CELL - 16, 15 + 10 * (cell.plan.length - 1), 14); g.font = 'bold 11px system-ui'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; cell.plan.forEach((k, j) => { g.fillStyle = FACTOR_COLOR[k]; g.fillText(KIND_WORD[k][0].toUpperCase(), px + 4 + j * 10, py + CELL - 5); }); }
    if (cell.trait && cell.trait !== 'none') { g.font = '14px system-ui'; g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillStyle = FACTOR_COLOR[TRAITS[cell.trait]]; g.fillText(TRAIT_GLYPH[cell.trait], px + CELL - 4, py + 15); }
    if (i === G.landing) { g.strokeStyle = '#fff'; g.beginPath(); g.arc(px + CELL / 2, py + CELL / 2, 5, 0, 6.283); g.stroke(); }
    if (isPure(cell)) { g.fillStyle = 'rgba(255,121,121,.9)'; g.font = '10px system-ui'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('pure', px + 3, py + 12); }
    if (i === hover) { g.strokeStyle = '#fff'; g.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3); }
  });
}
// the rectangle: the four corners, the rounded shape the fillet leaves, the wish (hollow) and the effective dot (solid)
export function drawRect(cv, G, { noFood = false } = {}) {
  const g = cv.getContext('2d'), M = RM, S = cv.width - 2 * M, X = v => M + v * S, Y = v => M + v * S;
  g.clearRect(0, 0, cv.width, cv.height);
  const r = Object.fromEntries(FACTORS.map(k => [k, filletR(G, k)]));
  g.beginPath();
  g.moveTo(X(r.industry), Y(0)); g.lineTo(X(1 - r.food), Y(0)); if (r.food) g.arc(X(1 - r.food), Y(r.food), r.food * S, -Math.PI / 2, 0);
  g.lineTo(X(1), Y(1 - r.science)); if (r.science) g.arc(X(1 - r.science), Y(1 - r.science), r.science * S, 0, Math.PI / 2);
  g.lineTo(X(r.housing), Y(1)); if (r.housing) g.arc(X(r.housing), Y(1 - r.housing), r.housing * S, Math.PI / 2, Math.PI);
  g.lineTo(X(0), Y(r.industry)); if (r.industry) g.arc(X(r.industry), Y(r.industry), r.industry * S, Math.PI, Math.PI * 1.5);
  g.closePath();
  const grad = g.createLinearGradient(X(0), Y(0), X(1), Y(1)); grad.addColorStop(0, 'rgba(255,179,71,.18)'); grad.addColorStop(1, 'rgba(79,163,255,.18)');
  g.fillStyle = grad; g.fill(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; g.stroke(); g.lineWidth = 1;
  g.font = 'bold 12px system-ui'; g.textBaseline = 'middle';
  const lab = (k, x, y, align) => { g.fillStyle = FACTOR_COLOR[k]; g.globalAlpha = k === 'food' && noFood ? 0.4 : 1; g.textAlign = align; g.fillText(KIND_WORD[k] + (k === 'food' && noFood ? ' (no water)' : G.sup[k] < 0.97 ? ' ' + Math.round(G.sup[k] * 100) + '%' : ''), x, y); g.globalAlpha = 1; };
  lab('industry', X(0), Y(0) - 14, 'left'); lab('food', X(1), Y(0) - 14, 'right'); lab('housing', X(0), Y(1) + 14, 'left'); lab('science', X(1), Y(1) + 14, 'right');
  const w = G.dot, e = effectiveDot(G);
  if (Math.hypot(w.x - e.x, w.y - e.y) > 0.002) { g.strokeStyle = 'rgba(255,255,255,.4)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(w.x), Y(w.y)); g.lineTo(X(e.x), Y(e.y)); g.stroke(); g.setLineDash([]); }
  g.strokeStyle = '#fff'; g.beginPath(); g.arc(X(w.x), Y(w.y), 6, 0, 6.283); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(X(e.x), Y(e.y), 5, 0, 6.283); g.fill();
}
export const dotFromPoint = (cv, px, py) => { const S = cv.width - 2 * RM; return { x: Math.max(0, Math.min(1, (px - RM) / S)), y: Math.max(0, Math.min(1, (py - RM) / S)) }; };
// the triangle: industry left, research right, development top; tri = { industry, research, development }
export function drawTri(cv, tri) {
  const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
  const P = TRI_PTS; g.beginPath(); g.moveTo(...P.industry); g.lineTo(...P.research); g.lineTo(...P.development); g.closePath();
  g.fillStyle = 'rgba(255,255,255,.05)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
  const t = normTri(tri), x = TRI.reduce((a, k) => a + t[k] * P[k][0], 0), y = TRI.reduce((a, k) => a + t[k] * P[k][1], 0);
  g.font = 'bold 12px system-ui'; g.textBaseline = 'middle';
  g.fillStyle = TRI_COLOR.industry; g.textAlign = 'left'; g.fillText(`industry ${Math.round(t.industry * 100)}%`, 6, 238);
  g.fillStyle = TRI_COLOR.research; g.textAlign = 'right'; g.fillText(`research ${Math.round(t.research * 100)}%`, 244, 238);
  g.fillStyle = TRI_COLOR.development; g.textAlign = 'center'; g.fillText(`development ${Math.round(t.development * 100)}%`, 125, 16);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 5, 0, 6.283); g.fill();
}
export function triFromPoint(px, py) {                // barycentric, clamped into the triangle
  const [ax, ay] = TRI_PTS.industry, [bx, by] = TRI_PTS.research, [cx, cy] = TRI_PTS.development, det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  let a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det, b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det, c = 1 - a - b;
  a = Math.max(0, a); b = Math.max(0, b); c = Math.max(0, c); const s = a + b + c || 1; return { industry: a / s, research: b / s, development: c / s };
}
export const PLAN_CYCLE = [null, ['industry'], ['food'], ['housing'], ['science'], ['industry', 'housing'], ['food', 'science']];
export const nextPlan = plan => { const at = PLAN_CYCLE.findIndex(p => JSON.stringify(p) === JSON.stringify(plan || null)); return PLAN_CYCLE[(at + 1) % PLAN_CYCLE.length]; };
