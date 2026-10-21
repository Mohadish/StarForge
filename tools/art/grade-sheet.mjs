// THE GRADE SHEET: for every world kind (rows) a 5 x 3 planet — its terrain with the landmarks (column 1), then a heat map per district
// kind (housing pink, food green, industry orange, science blue): the brighter a district, the better it is for that kind.
//   node tools/art/grade-sheet.mjs [seed] → art/gen/<date>/grade-sheet-<seed>.png
import fs from 'node:fs';
import path from 'node:path';
import { terrain, paint, KINDS, DISTRICT_KINDS, SPECIALS } from '../../src/eon/terrain.js';
import { encodePng } from './png.mjs';
const seed = process.argv[2] || 'grade', out = path.join('art', 'gen', new Date().toISOString().slice(0, 10), `grade-sheet-${seed}.png`);
const COLOR = { housing: [245, 163, 199], food: [126, 243, 176], industry: [255, 179, 71], science: [79, 163, 255] };
const W0 = 5, H0 = 3, CW = 140, CH = 70, GAP = 24, PW = W0 * CW, PH = H0 * CH;
const W = GAP + 5 * (PW + GAP), H = GAP + KINDS.length * (PH + GAP);
const sheet = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { sheet[i * 4] = 6; sheet[i * 4 + 1] = 10; sheet[i * 4 + 2] = 20; sheet[i * 4 + 3] = 255; }
const blit = (px, x0, y0) => { for (let y = 0; y < PH; y++) px.copy(sheet, ((y0 + y) * W + x0) * 4, y * PW * 4, (y + 1) * PW * 4); };
const ring = (px, x, y, r0, r1, c) => { for (let yy = Math.max(0, y - r1); yy <= Math.min(PH - 1, y + r1); yy++) for (let xx = Math.max(0, x - r1); xx <= Math.min(PW - 1, x + r1); xx++) { const d = Math.hypot(xx - x, (yy - y) * 2); if (d >= r0 && d <= r1) { const i = (yy * PW + xx) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; } } };
KINDS.forEach((kind, row) => {
  const T = terrain(`${seed}-${W0}x${H0}`, W0, H0, kind, { cellW: CW, cellH: CH }), y0 = GAP + row * (PH + GAP);
  // column 1: the terrain + landmarks (canyon = dark brown districts, basin = pale rim, special = white ring, foothill dots skipped)
  const base = Buffer.alloc(PW * PH * 4); paint(T, base, { frames: true, slots: false });
  for (let i = 0; i < PW * PH; i++) { const f = T.feat[T.det[i]]; if (f.canyon) { base[i * 4] = base[i * 4] * 0.45 + 40; base[i * 4 + 1] = base[i * 4 + 1] * 0.45 + 20; base[i * 4 + 2] = base[i * 4 + 2] * 0.45 + 10; } else if (f.basin) { base[i * 4] = base[i * 4] * 0.8 + 50; base[i * 4 + 1] = base[i * 4 + 1] * 0.8 + 50; base[i * 4 + 2] = base[i * 4 + 2] * 0.8 + 50; } }
  T.feat.forEach(f => { if (f.special) ring(base, Math.round(f.x), Math.round(f.y), 4, 6.5, [255, 255, 255]); });
  blit(base, GAP, y0);
  // columns 2–5: a heat map per district kind
  DISTRICT_KINDS.forEach((dk, col) => {
    const px = Buffer.alloc(PW * PH * 4); paint(T, px, { frames: false, slots: false }); const c = COLOR[dk];
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) { const i = y * PW + x, d = T.det[i], g = T.habitable[d] ? T.grade[d][dk] : 0;
      const r = T.det[x + 1 < PW ? i + 1 : i - x], dn = T.det[y + 1 < PH ? i + PW : i], edge = r !== d || dn !== d;
      const dark = 0.45, a = T.habitable[d] ? 0.1 + 0.85 * g : 0;                                   // the ground dimmed, the grade as the kind's colour
      for (let ch = 0; ch < 3; ch++) px[i * 4 + ch] = Math.round(px[i * 4 + ch] * dark * (1 - a) + c[ch] * a * (edge ? 0.6 : 1)); }
    for (let yy = 4; yy < 18; yy++) for (let xx = 4; xx < 18; xx++) { const i = (yy * PW + xx) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; }
    blit(px, GAP + (col + 1) * (PW + GAP), y0);
  });
  const hab = T.feat.filter((f, k) => T.habitable[k]), avg = dk => (hab.reduce((a, f, j) => a + T.grade[T.feat.indexOf(f)][dk], 0) / Math.max(1, hab.length)).toFixed(2);
  console.log(`${kind}: net ${T.net}/${T.gross} · canyons ${T.feat.filter(f => f.canyon).length} · basins ${T.feat.filter(f => f.basin).length} · specials ${T.feat.filter(f => f.special).map(f => SPECIALS[f.special]).join(',') || '-'} · avg grade housing ${avg('housing')} food ${avg('food')} industry ${avg('industry')} science ${avg('science')}`);
});
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, encodePng(W, H, sheet)); console.log(out, W, 'x', H, '· rows:', KINDS.join(' | '), '· columns: terrain | housing | food | industry | science');
