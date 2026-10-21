// The planet surface sheet: 8 sizes × 4 kinds at 1:1 (a cell = 140 × 70 px), each panel a seeded surface with its Voronoi cells.
//   node tools/art/planet-sheet.mjs [seed] [out.png]
import fs from 'node:fs';
import path from 'node:path';
import { terrain, paint, KINDS } from '../../src/eon/terrain.js';
import { encodePng } from './png.mjs';
const seed = process.argv[2] || 'sheet', out = process.argv[3] || path.join('art', 'gen', new Date().toISOString().slice(0, 10), `planet-sheet-${seed}.png`);
const SIZES = [[2, 2], [3, 2], [4, 2], [3, 3], [5, 2], [4, 3], [5, 3], [6, 3]], CW = 140, CH = 70, GAP = 24;
const colW = 6 * CW + GAP, rowH = 3 * CH + GAP, W = KINDS.length * colW + GAP, H = SIZES.length * rowH + GAP;
const sheet = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { sheet[i * 4] = 6; sheet[i * 4 + 1] = 10; sheet[i * 4 + 2] = 20; sheet[i * 4 + 3] = 255; }
for (let k = 0; k < KINDS.length; k++) for (let s = 0; s < SIZES.length; s++) {
  const [w, h] = SIZES[s], T = terrain(`${seed}-${w}x${h}`, w, h, KINDS[k], { cellW: CW, cellH: CH }), px = Buffer.alloc(T.W * T.H * 4);
  paint(T, px);
  const x0 = GAP + k * colW, y0 = GAP + s * rowH;
  for (let y = 0; y < T.H; y++) px.copy(sheet, ((y0 + y) * W + x0) * 4, y * T.W * 4, (y + 1) * T.W * 4);
  const land = Array.from(T.land).map(v => Math.round(v * 100));
  console.log(`${KINDS[k]} ${w}x${h}: land per cell % ${land.join(' ')}`);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encodePng(W, H, sheet));
console.log(`${out}  ${W} x ${H}  columns: ${KINDS.join(' | ')}  rows: ${SIZES.map(s => s.join('x')).join(' ')}`);
