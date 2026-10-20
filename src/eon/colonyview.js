// THE COLONY'S PICTURES (his pop-up, 2026-10-18): the planet's surface as cells of four slots, the development rectangle with its live
// fillet, the effort triangle — drawn on canvases, shared by the game (app.js, the colony pop-up) and the sandbox (planetlab.js).
// The canvases are drawn at full size and SHOWN to fit: toCanvas() turns a mouse position back into drawing pixels.
import { SLOT, DEV, TRAITS, TRAIT_GLYPH, TRI, FACTORS, FACTOR_COLOR, KIND_WORD, xy, isPure, normTri, bOf, focusOf, effectiveFocus, capsAll } from './colony.js';
import { createTetra } from './tetra.js';
import { LARGEST } from './districts.js';

export const CELL = 100, GAP = 4, FRAME = LARGEST;                    // a cell, the gap between cells, the frame every planet is drawn in (the huge world's)
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
// THE FOCUS TETRAHEDRON (2026-10-20): the empire's pyramid widget, here with the colony's four kinds — the wish (a ring when the
// fillet holds it back), the effective focus (the ball), each corner's cut; drag the ball, click a corner's name to pull toward it,
// drag empty space to turn it. getG() → the surface; noFood() → a dry world's food corner is out of reach
export function focusTetra(canvas, { getG, noFood = () => false, onChange, onRelease = null }) {
  return createTetra(canvas, { labels: FACTORS.map(k => KIND_WORD[k]), colors: FACTORS.map(k => FACTOR_COLOR[k]), onChange, onRelease,
    getState: () => { const G = getG(); if (!G) return { w: [0.25, 0.25, 0.25, 0.25], w0: [0.25, 0.25, 0.25, 0.25], reach: 9 }; const w = focusOf(G).slice(), dry = noFood(); return { w, w0: w, reach: 9, eff: effectiveFocus(G), caps: capsAll(G), off: dry ? [false, 'no water', false, false] : null }; } });
}
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
// the triangle's ball, where it is drawn (a double-click on it puts it back in the middle)
export const triBall = tri => { const t = normTri(tri); return { x: TRI.reduce((a, k) => a + t[k] * TRI_PTS[k][0], 0), y: TRI.reduce((a, k) => a + t[k] * TRI_PTS[k][1], 0) }; };
export function triFromPoint(px, py) {                // barycentric, clamped into the triangle
  const [ax, ay] = TRI_PTS.industry, [bx, by] = TRI_PTS.research, [cx, cy] = TRI_PTS.development, det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  let a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det, b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det, c = 1 - a - b;
  a = Math.max(0, a); b = Math.max(0, b); c = Math.max(0, c); const s = a + b + c || 1; return { industry: a / s, research: b / s, development: c / s };
}
export const PLAN_CYCLE = [null, ['industry'], ['food'], ['housing'], ['science'], ['industry', 'housing'], ['food', 'science']];
export const nextPlan = plan => { const at = PLAN_CYCLE.findIndex(p => JSON.stringify(p) === JSON.stringify(plan || null)); return PLAN_CYCLE[(at + 1) % PLAN_CYCLE.length]; };
