// the colony-as-slots model, headless: node tools/play/planet.mjs [scenario=all] [eons=120] [size=xl]
// scenarios: industry (the dot in the industry corner), balanced (centre), farm, science, all (one after another)
import { newColony, endEon, effectiveDot, counts, FACTORS, KIND_WORD, FILLET } from '../../src/eon/colony.js';
import { SIZES, sizeKey } from '../../src/eon/districts.js';
const [, , which = 'all', eonsArg = '120', sizeArg = '6x3', maxR] = process.argv, eons = +eonsArg, size = sizeKey(sizeArg);   // any rung of the ladder: 2x2 … 6x3 (or the old vs/s/m/l/xl)
if (maxR) FILLET.maxR = +maxR;                        // the fillet's depth: 0.5 = four full fillets make a circle (a corner capped near 73 %); 1 caps a corner at 50 %
const quiet = process.env.QUIET === '1';
const DOTS = { industry: { x: 0, y: 0 }, balanced: { x: 0.5, y: 0.5 }, farm: { x: 1, y: 0 }, science: { x: 1, y: 1 }, housing: { x: 0, y: 1 } };
const r1 = v => Math.round(v * 10) / 10, pct = v => Math.round(v * 100);
for (const name of which === 'all' ? Object.keys(DOTS) : [which]) {
  const g = SIZES[size], C = newColony({ w: g.w, h: g.h, seed: 'home', dot: DOTS[name] });
  console.log(`\n== ${name} (${size} ${g.w}×${g.h} = ${g.w * g.h * 4} slots) — dot wish ${DOTS[name].x},${DOTS[name].y}`);
  console.log('eon  people  homes  food/eat  ind  sci  dev  slots I/F/H/S  eff-dot      fillet I/F/H/S');
  for (let e = 0; e <= eons; e++) {
    if (!quiet && (e % 10 === 0 || e === eons)) { const r = C.last, n = counts(C), d = effectiveDot(C); console.log(`${String(C.eon).padStart(3)}  ${String(Math.round(C.people)).padStart(5)}  ${String(Math.round(r.housing)).padStart(5)}  ${String(Math.round(r.food)).padStart(4)}/${String(Math.round(r.eat)).padEnd(4)} ${String(Math.round(r.industry)).padStart(4)} ${String(Math.round(r.science)).padStart(4)} ${String(r1(r.dev)).padStart(5)}  ${n.industry}/${n.food}/${n.housing}/${n.science} (${n.total})  ${d.x.toFixed(2)},${d.y.toFixed(2)}  ${FACTORS.map(k => pct(C.sup[k])).join('/')}`); }
    if (e < eons) endEon(C);
  }
  const n = counts(C), pure = C.cells.filter(c => c.slots.length === 4 && new Set(c.slots).size === 1).length;
  console.log(`end: ${n.total} slots, ${pure} pure cells, shares ${FACTORS.map(k => KIND_WORD[k][0].toUpperCase() + pct(n[k] / Math.max(1, n.total))).join(' ')}, target ${FACTORS.map(k => KIND_WORD[k][0].toUpperCase() + pct(C.last.weights[k])).join(' ')}`);
}
