// THE COLONY'S PICTURES (his pop-up, 2026-10-18): the planet's surface as cells of four slots, the development rectangle with its live
// fillet, the effort triangle — drawn on canvases, shared by the game (app.js, the colony pop-up) and the sandbox (planetlab.js).
// The canvases are drawn at full size and SHOWN to fit: toCanvas() turns a mouse position back into drawing pixels.
// 2026-10-21: the surface sits on the PLANET (terrain.js): a straight grid squashed 2:1, every cell drawn as the Voronoi region of its
// jittered centre on the generated terrain. 2026-10-22: the DISTRICTS are the units — the hover lights one district, the marks sit on one.
import { TRI, FACTORS, FACTOR_COLOR, KIND_WORD, normTri, bOf, focusOf, effectiveFocus, capsAll, terrainKind } from './colony.js';
import { createTetra } from './tetra.js';
import { LARGEST } from './districts.js';
import { terrain, paint, CELL_PX, primeDistricts } from './terrain.js';
import { renderColony, stateFromSurface, stateKey, districtBoxes } from './surface.js';

export const CELLW = CELL_PX.w, CELLH = CELL_PX.h, FRAME = LARGEST;                 // a cell on the straight 2:1 grid (his call), 30 % up from 140 × 70 (his ask 2026-10-21: "make the planet bigger"); the frame = the huge world's
export const TRI_COLOR = { industry: '#ffb347', research: '#4fa3ff', development: '#f5a3c7' };   // his palette: research blue as science, development pink as housing
export const TRI_PTS = { industry: [28, 222], research: [222, 222], development: [125, 34] };   // on a 250 × 250 canvas
export const mapSize = () => [FRAME.w * CELLW, FRAME.h * CELLH];
export const toCanvas = (cv, e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height]; };
// a smaller world sits centred in the frame
export const originOf = G => [Math.round((FRAME.w - G.w) / 2 * CELLW), Math.round((FRAME.h - G.h) / 2 * CELLH)];
// THE PLANET UNDER THE DISTRICTS: generated once per planet (its id + kind + size), painted into an offscreen canvas; its districts are
// handed to the game (terrain.js primeDistricts) — the very ones the model builds on
const TERRAIN = new Map();
export function terrainFor(G, planet = {}) {
  const id = planet.id ?? G.pid ?? 'sandbox', kind = terrainKind(planet.kind ?? G.kind), key = `${id}|${kind}|${G.w}x${G.h}`;
  let T = TERRAIN.get(key); if (T) return T;
  T = terrain(id + '|ground', G.w, G.h, kind, { cellW: CELLW, cellH: CELLH }); primeDistricts(id, G.w, G.h, kind, T);
  const c = document.createElement('canvas'); c.width = T.W; c.height = T.H; const g = c.getContext('2d'), img = g.createImageData(T.W, T.H); paint(T, img.data); g.putImageData(img, 0, 0); T.image = c;
  if (TERRAIN.size > 40) TERRAIN.delete(TERRAIN.keys().next().value); TERRAIN.set(key, T); return T;
}
export function districtAt(cv, G, e) {                // the district under the mouse = the drawn (jagged) outline's owner on the last terrain drawn here
  const T = cv._terrain; if (!T) return -1;
  const [mx, my] = toCanvas(cv, e), [ox, oy] = originOf(G), x = Math.floor(mx - ox), y = Math.floor(my - oy);
  return x >= 0 && y >= 0 && x < T.W && y < T.H ? T.detJ[y * T.W + x] : -1;
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
// the surface: the planet with what stands on it (surface.js), then the hovered district under a light veil with its outline, ⚒ on the
// unit going up (or where the next one goes), ✕ on a unit being torn down, ○ the landing.
// opts: { next, hover, frameColor, planet: { id, kind } } — the planet's id seeds its terrain, kind = living | ocean | ice | other
export function drawSurface(cv, G, { next = null, hover = -1, frameColor = 'rgba(126,243,176,.45)', planet = null } = {}) {
  const g = cv.getContext('2d'), [ox, oy] = originOf(G), T = terrainFor(G, planet || {}); cv._terrain = T;
  g.fillStyle = '#060a14'; g.fillRect(0, 0, cv.width, cv.height);
  // THE PICTURE (surface.js, 2026-10-21): the planet with its crops, urban grid, ridges, forests and the cluster chips that fill a
  // district as its unit is built — rendered once per state (built kinds + fractions) and cached on the terrain
  const state = stateFromSurface(G, T, bOf), key = stateKey(state) + '|' + (frameColor || '');
  if (!T._comp || T._comp.key !== key) T._comp = { key, canvas: renderColony(T, state, 1, { faction: frameColor && frameColor.length >= 7 ? frameColor.slice(0, 7) : '#9fe8c4' }) };
  g.drawImage(T._comp.canvas, ox, oy);
  if (hover >= 0) {                                      // the hovered DISTRICT: a light veil over its jagged region and its outline
    const b = districtBoxes(T)[hover]; if (b && b[2] >= b[0]) {
      const own = i => T.detJ[i] === hover; g.fillStyle = 'rgba(255,255,255,.2)';
      for (let y = b[1]; y <= b[3]; y++) { let run = -1; for (let x = b[0]; x <= b[2] + 1; x++) { const on = x <= b[2] && own(y * T.W + x); if (on && run < 0) run = x; if (!on && run >= 0) { g.fillRect(ox + run, oy + y, x - run, 1); run = -1; } } }
      g.fillStyle = 'rgba(255,255,255,.85)';
      for (let y = b[1]; y <= b[3]; y++) for (let x = b[0]; x <= b[2]; x++) { const i = y * T.W + x; if (!own(i)) continue; if (x === 0 || y === 0 || x === T.W - 1 || y === T.H - 1 || !own(i - 1) || !own(i + 1) || !own(i - T.W) || !own(i + T.W)) g.fillRect(ox + x, oy + y, 1, 1); }
    } }
  const at = k => T.feat && T.feat[k] ? [ox + T.feat[k].x, oy + T.feat[k].y] : null;
  if (next) { const p = at(next.unit); if (p) { if (next.demolish) mark(g, '✕', '#ff7979', p[0], p[1]); else mark(g, '⚒', FACTOR_COLOR[next.kind], p[0], p[1]); } }
  const L = at(G.landing); if (L) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(L[0], L[1], 5, 0, 6.283); g.stroke(); g.lineWidth = 1; }
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
