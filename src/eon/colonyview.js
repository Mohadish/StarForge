// THE COLONY'S PICTURES (his pop-up, 2026-10-18): the planet's surface as cells of four slots, the development rectangle with its live
// fillet, the effort triangle — drawn on canvases, shared by the game (app.js, the colony pop-up) and the sandbox (planetlab.js).
// The canvases are drawn at full size and SHOWN to fit: toCanvas() turns a mouse position back into drawing pixels.
// 2026-10-21: the surface sits on the PLANET (terrain.js): a straight grid squashed 2:1, every cell drawn as the Voronoi region of its
// jittered centre on the generated terrain, its 4 slots the sub-regions; the overlays (kinds, cranes, plans…) follow those shapes.
import { SLOT, DEV, TRAITS, TRAIT_GLYPH, TRI, FACTORS, FACTOR_COLOR, KIND_WORD, xy, isPure, normTri, bOf, focusOf, effectiveFocus, capsAll } from './colony.js';
import { createTetra } from './tetra.js';
import { LARGEST } from './districts.js';
import { terrain, paint, KINDS } from './terrain.js';

export const CELLW = 140, CELLH = 70, FRAME = LARGEST;                 // a cell on the straight 2:1 grid (his call), the frame every planet is drawn in (the huge world's)
export const TRI_COLOR = { industry: '#ffb347', research: '#4fa3ff', development: '#f5a3c7' };   // his palette: research blue as science, development pink as housing
export const TRI_PTS = { industry: [28, 222], research: [222, 222], development: [125, 34] };   // on a 250 × 250 canvas
export const mapSize = () => [FRAME.w * CELLW, FRAME.h * CELLH];
export const toCanvas = (cv, e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height]; };
// a smaller world sits centred in the frame
export const originOf = G => [Math.round((FRAME.w - G.w) / 2 * CELLW), Math.round((FRAME.h - G.h) / 2 * CELLH)];
// THE PLANET UNDER THE CELLS: generated once per planet (its id + kind + size), painted into an offscreen canvas, with every slot's and
// cell's box and centre (the slots are jittered Voronoi regions, so the overlays need to know where they are)
const TERRAIN = new Map();
const subIndex = (T, cell, s) => (2 * Math.floor(cell / T.w) + (s >> 1)) * (2 * T.w) + 2 * (cell % T.w) + (s & 1);
export function terrainFor(G, planet = {}) {
  const id = planet.id ?? 'sandbox', kind = KINDS.includes(planet.kind) ? planet.kind : 'rock', key = `${id}|${kind}|${G.w}x${G.h}`;
  let T = TERRAIN.get(key); if (T) return T;
  T = terrain(id + '|ground', G.w, G.h, kind, { cellW: CELLW, cellH: CELLH });
  const c = document.createElement('canvas'); c.width = T.W; c.height = T.H; const g = c.getContext('2d'), img = g.createImageData(T.W, T.H); paint(T, img.data); g.putImageData(img, 0, 0); T.image = c;
  const box = Array.from({ length: G.w * G.h * 4 }, () => [T.W, T.H, -1, -1, 0, 0, 0]);   // x0 y0 x1 y1 Σx Σy n per slot
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) { const b = box[T.sub[y * T.W + x]]; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; b[4] += x; b[5] += y; b[6]++; }
  T.slotBox = box.map(b => ({ x0: b[0], y0: b[1], x1: b[2], y1: b[3], cx: b[6] ? b[4] / b[6] : 0, cy: b[6] ? b[5] / b[6] : 0 }));
  T.cellBox = []; for (let k = 0; k < G.w * G.h; k++) { const bs = [0, 1, 2, 3].map(s => T.slotBox[subIndex(T, k, s)]); T.cellBox.push({ x0: Math.min(...bs.map(b => b.x0)), y0: Math.min(...bs.map(b => b.y0)), x1: Math.max(...bs.map(b => b.x1)), y1: Math.max(...bs.map(b => b.y1)), cx: bs.reduce((a, b) => a + b.cx, 0) / 4, cy: bs.reduce((a, b) => a + b.cy, 0) / 4 }); }
  if (TERRAIN.size > 40) TERRAIN.delete(TERRAIN.keys().next().value); TERRAIN.set(key, T); return T;
}
export function cellAt(cv, G, e) {                    // the cell under the mouse = the pixel's owner on the last terrain drawn here
  const T = cv._terrain; if (!T) return -1;
  const [mx, my] = toCanvas(cv, e), [ox, oy] = originOf(G), x = Math.floor(mx - ox), y = Math.floor(my - oy);
  return x >= 0 && y >= 0 && x < T.W && y < T.H ? T.owner[y * T.W + x] : -1;
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
const mark = (g, ch, col, x, y) => { g.fillStyle = col; g.font = 'bold 16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeText(ch, x, y + 1); g.fillText(ch, x, y + 1); g.lineWidth = 1; };
const rgbOf = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// the surface: the planet, then a tint per slot region (its kind; a slot going up fills from the bottom; a slot being torn down reddens
// from the left; a planned cell faintly in its first kind; the hovered cell lighter), then the vector bits: a built slot's pattern,
// ⚒ where the next slot goes, ✕ on a slot being torn down, the plan's letters, the trait glyph, the landing ring, 'pure'.
// opts: { next, hover, frameColor, planet: { id, kind } } — the planet's id seeds its terrain, kind = living | ocean | ice | other
export function drawSurface(cv, G, { next = null, hover = -1, frameColor = 'rgba(126,243,176,.45)', planet = null } = {}) {
  const g = cv.getContext('2d'), [ox, oy] = originOf(G), T = terrainFor(G, planet || {}); cv._terrain = T;
  g.fillStyle = '#060a14'; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(T.image, ox, oy);
  const RGB = Object.fromEntries(FACTORS.map(k => [k, rgbOf(FACTOR_COLOR[k])])), RED = [255, 121, 121];
  const tints = new Array(G.w * G.h * 4).fill(null);
  G.cells.forEach((cell, i) => { for (let s = 0; s < SLOT.per; s++) { const kind = cell.slots[s]; let t = null;
    if (kind && bOf(cell, s) < 1) t = { c: RGB[kind], a: 0.12, fill: bOf(cell, s), fa: 0.5 };
    else if (kind) { t = { c: RGB[kind], a: 0.32 }; if (next && next.demolish && next.cell === i && s === next.slot) t.dem = Math.min(1, (G.progress || 0) / DEV.demolish); }
    else if (next && !next.demolish && !next.partial && next.cell === i && s === cell.slots.length) t = { c: RGB[next.kind], a: 0.08, fill: Math.min(1, next.b || 0), fa: 0.35 };
    else if (cell.plan) t = { c: RGB[cell.plan[0]], a: 0.07 };
    tints[i * 4 + s] = t; } });
  const ov = cv._ov && cv._ov.width === T.W && cv._ov.height === T.H ? cv._ov : (cv._ov = Object.assign(document.createElement('canvas'), { width: T.W, height: T.H }));
  const og = ov.getContext('2d'), img = og.createImageData(T.W, T.H), d = img.data;
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) {
    const i = y * T.W + x, cell = T.owner[i], s = T.slot[i], t = tints[cell * 4 + s]; let r = 0, gg = 0, b = 0, a = 0;
    if (t) { const box = T.slotBox[subIndex(T, cell, s)]; a = t.a; [r, gg, b] = t.c;
      if (t.fill != null && y >= box.y1 - (box.y1 - box.y0) * t.fill) a = t.fa;
      if (t.dem != null && x <= box.x0 + (box.x1 - box.x0) * t.dem) { [r, gg, b] = RED; a = 0.4; } }
    if (cell === hover) { const ha = 0.16, na = a + ha; r = (r * a + 255 * ha) / na; gg = (gg * a + 255 * ha) / na; b = (b * a + 255 * ha) / na; a = na; }
    const o = i * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = Math.round(a * 255);
  }
  og.putImageData(img, 0, 0); g.drawImage(ov, ox, oy);
  G.cells.forEach((cell, i) => {
    const cb = T.cellBox[i];
    for (let s = 0; s < SLOT.per; s++) {
      const sb = T.slotBox[subIndex(T, i, s)], kind = cell.slots[s], size = Math.max(10, Math.min(sb.x1 - sb.x0, sb.y1 - sb.y0) * 0.72), x = ox + sb.cx, y = oy + sb.cy;
      if (kind && bOf(cell, s) >= 1) { glyph(g, kind, x - size / 2, y - size / 2, size); if (next && next.demolish && next.cell === i && s === next.slot) mark(g, '✕', '#ff7979', x, y); }
      else if (next && next.cell === i && (next.slot === s || (!next.partial && !next.demolish && s === cell.slots.length))) mark(g, '⚒', FACTOR_COLOR[next.kind], x, y);
    }
    if (cell.plan) { g.fillStyle = '#04070f'; g.fillRect(ox + cb.cx - 8, oy + cb.y1 - 15, 15 + 10 * (cell.plan.length - 1), 14); g.font = 'bold 11px system-ui'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; cell.plan.forEach((k, j) => { g.fillStyle = FACTOR_COLOR[k]; g.fillText(KIND_WORD[k][0].toUpperCase(), ox + cb.cx - 6 + j * 10, oy + cb.y1 - 4); }); }
    if (cell.trait && cell.trait !== 'none') { g.font = '14px system-ui'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = FACTOR_COLOR[TRAITS[cell.trait]]; g.fillText(TRAIT_GLYPH[cell.trait], ox + cb.cx, oy + cb.y0 + 15); }
    if (i === G.landing) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(ox + cb.cx, oy + cb.cy, 5, 0, 6.283); g.stroke(); g.lineWidth = 1; }
    if (isPure(cell)) { g.fillStyle = 'rgba(255,121,121,.9)'; g.font = '10px system-ui'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText('pure', ox + cb.cx, oy + cb.y0 + 27); }
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
