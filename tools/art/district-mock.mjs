// DISTRICTS ON THE PLANET — a mock (his direction 2026-10-21): the smallest Voronoi cells are the districts, one kind each, only on
// habitable ground; a colony grows from its landing across neighbouring districts. No model here: a seeded walk over the terrain.
//   node tools/art/district-mock.mjs [seed] → art/gen/<date>/district-mock-<seed>.png
import fs from 'node:fs';
import path from 'node:path';
import { terrain, paint } from '../../src/eon/terrain.js';
import { encodePng } from './png.mjs';
const seed = process.argv[2] || 'mock', out = path.join('art', 'gen', new Date().toISOString().slice(0, 10), `district-mock-${seed}.png`);
const KIND = { industry: [255, 179, 71], food: [126, 243, 176], housing: [245, 163, 199], science: [79, 163, 255] }, KINDS = Object.keys(KIND);
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// the districts' graph: neighbours and centres from the pixels
function graph(T) {
  const n = T.dtype.length, nb = Array.from({ length: n }, () => new Set()), cx = new Float64Array(n), cy = new Float64Array(n), cnt = new Float64Array(n);
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) { const i = y * T.W + x, d = T.det[i], r = T.det[x + 1 < T.W ? i + 1 : i - x], dn = T.det[y + 1 < T.H ? i + T.W : i];
    cx[d] += x; cy[d] += y; cnt[d]++; if (r !== d) { nb[d].add(r); nb[r].add(d); } if (dn !== d) { nb[d].add(dn); nb[dn].add(d); } }
  return { nb, cx: cx.map((v, k) => v / (cnt[k] || 1)), cy: cy.map((v, k) => v / (cnt[k] || 1)) };
}
// grow: the landing = the habitable district nearest the centre; then, step by step, a random frontier district gets the kind the
// colony has least of (industry / food / housing / science kept even)
function grow(T, rnd, stages) {
  const G = graph(T), n = T.dtype.length, built = new Int8Array(n).fill(-1), order = [];
  let landing = -1, best = 1e18; for (let k = 0; k < n; k++) if (T.habitable[k]) { const d = (G.cx[k] - T.W / 2) ** 2 + ((G.cy[k] - T.H / 2) * 2) ** 2; if (d < best) { best = d; landing = k; } }
  const count = [0, 0, 0, 0], pick = () => { const m = Math.min(...count), c = count.map((v, i) => v === m ? i : -1).filter(i => i >= 0); return c[Math.floor(rnd() * c.length)]; };
  const frontier = new Set([landing]);
  while (frontier.size) {
    const list = [...frontier], k = list[Math.floor(rnd() * list.length)]; frontier.delete(k); if (built[k] >= 0) continue;
    const kind = pick(); built[k] = kind; count[kind]++; order.push(k);
    for (const q of G.nb[k]) if (T.habitable[q] && built[q] < 0) frontier.add(q);
  }
  return stages.map(s => { const b = new Int8Array(n).fill(-1); order.slice(0, s === Infinity ? order.length : s).forEach(k => { b[k] = built[k]; }); return { built: b, landing, n: Math.min(s, order.length), of: order.length }; });
}
function draw(T, stage, px) {
  paint(T, px, { frames: true, slots: false });
  const { built, landing } = stage, G = graph(T);
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) { const i = y * T.W + x, d = T.det[i], k = built[d]; if (k < 0) continue;
    const c = KIND[KINDS[k]], r = T.det[x + 1 < T.W ? i + 1 : i - x], dn = T.det[y + 1 < T.H ? i + T.W : i], edge = (r !== d && built[r] !== k) || (dn !== d && built[dn] !== k);
    const a = edge ? 0.85 : 0.5; for (let ch = 0; ch < 3; ch++) px[i * 4 + ch] = Math.round(px[i * 4 + ch] * (1 - a) + c[ch] * a * (edge ? 0.55 : 1)); }
  const lx = G.cx[landing], ly = G.cy[landing];
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) { const dd = Math.hypot(x - lx, (y - ly) * 2); if (dd > 4 && dd < 6.5) { const i = y * T.W + x; px[i * 4] = 255; px[i * 4 + 1] = 255; px[i * 4 + 2] = 255; } }
}
const PANELS = [['living', 6, 3, [12, 60, Infinity]], ['ocean', 4, 3, [8, 30, Infinity]], ['ice', 4, 2, [Infinity]], ['rock', 3, 2, [Infinity]]];
const CW = 140, CH = 70, GAP = 24, rows = PANELS.map(p => ({ p, T: terrain(`${seed}-${p[1]}x${p[2]}`, p[1], p[2], p[0], { cellW: CW, cellH: CH }) }));
const W = GAP + Math.max(...rows.map(r => r.p[3].length * (r.T.W + GAP))), H = GAP + rows.reduce((a, r) => a + r.T.H + GAP, 0);
const sheet = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { sheet[i * 4] = 6; sheet[i * 4 + 1] = 10; sheet[i * 4 + 2] = 20; sheet[i * 4 + 3] = 255; }
let y0 = GAP;
for (const { p, T } of rows) {
  const stages = grow(T, mulberry(7), p[3]); let x0 = GAP;
  stages.forEach((st, j) => { const px = Buffer.alloc(T.W * T.H * 4); draw(T, st, px); for (let y = 0; y < T.H; y++) px.copy(sheet, ((y0 + y) * W + x0) * 4, y * T.W * 4, (y + 1) * T.W * 4); x0 += T.W + GAP;
    console.log(`${p[0]} ${p[1]}x${p[2]} stage ${j + 1}: ${st.n} of ${st.of} habitable districts built (gross ${T.gross}, net ${T.net})`); });
  y0 += T.H + GAP;
}
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, encodePng(W, H, sheet)); console.log(out, W, 'x', H);
