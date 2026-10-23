// A SWEEP OF AI WORLDS (his ask, 2026-10-23: "4 or 5 empires on 200 stars, 3,000 turns, 60 instances, a mixture of expansion,
// extermination, exploitation… does the focus really change the way research is induced?"). Each run: one world (src/eon/world.js),
// every empire played by the AI head (ai.js) with its own FOCUS (the corner it leans to; 'mid' never moves), until someone holds the
// galaxy or the eons run out. What is kept per empire is the RESEARCH: every find (field, what its channels are good for — the four X
// — and the focus it was found under), the lucky breaks, the projects done, the research it had — and how it fared.
//   node tools/play/sweep.mjs [runs=60] [eons=3000] [stars=200] [workers=12]   → tools/play/out/sweep/run-<i>.json, then the report
//   node tools/play/sweep.mjs --one <i> <eons> <stars>                          (one run; the driver spawns these)
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
const here = dirname(fileURLToPath(import.meta.url)), OUT = join(here, 'out', 'sweep');
const FOCI = ['expand', 'exploit', 'explore', 'exterm', 'mid'];

if (process.argv[2] === '--one') {
  const i = +process.argv[3], EONS = +process.argv[4] || 3000, STARS = +process.argv[5] || 200;
  const { galaxyOf } = await import('../../src/eon/galaxy.js');
  const { createWorld, living, newLog, campaignEon } = await import('../../src/eon/world.js');
  const { makeBrain } = await import('../../src/eon/ai.js');
  const { compute } = await import('../../src/eon/model.js');
  const N = i % 2 ? 5 : 4, seed = `sweep-${i}`, W = createWorld(seed, N, { galaxy: galaxyOf(STARS) });
  const focusOf = e => FOCI[(i + e * 2) % FOCI.length];                // every run a mix; over the runs every focus in every seat
  const brains = W.empires.map((S, e) => makeBrain(W, S, { note: () => {}, onAct: () => {}, focus: focusOf(e) }));
  const log = newLog(W, { player: 'sweep' }), t0 = Date.now();
  const R = W.empires.map((S, e) => ({ empire: e, name: S.name, focus: focusOf(e), lucky: 0, finds: 0, projects: {}, research: [], people: [], colonies: [], focusAt: [], deadAt: null }));
  let end = 'out of eons';
  for (let eon = 0; eon < EONS; eon++) {
    campaignEon(W, brains, log);
    W.empires.forEach((S, e) => {
      const r = R[e]; if (r.deadAt == null && S.dead) r.deadAt = W.eon;
      for (const x of S.report || []) { if (/^A lucky break/.test(x.text)) r.lucky++; if (/^Breakthrough in|^A lucky break/.test(x.text)) r.finds++; }
      if (W.eon % 50 === 0 && !S.dead) { const c = compute(S); r.research.push(Math.round(c.research)); r.people.push(Math.round(c.people)); r.colonies.push(c.colonies.length); r.focusAt.push(S.focus.map(v => +v.toFixed(2))); }
    });
    if (W.winner != null) { end = `${W.empires[W.winner].name} holds the galaxy at eon ${W.eon}`; break; }
    if (!living(W).length) { end = 'nobody left'; break; }
  }
  // what each empire found: field, X of its channels (summed pct), the focus it leaned under
  for (const [e, S] of W.empires.entries()) {
    const r = R[e], natural = S.breakthroughs.filter(b => !b.project && b.eon > 0), X = { expand: 0, exploit: 0, explore: 0, exterminate: 0 }, under = {}, fields = {};
    for (const b of natural) { fields[b.field] = (fields[b.field] || 0) + 1; under[b.under || 'none'] = (under[b.under || 'none'] || 0) + 1; for (const p of b.props) for (const ch of p.channels) if (X[ch.x] != null) X[ch.x] += ch.pct; }
    Object.assign(r, { naturalFinds: natural.length, findX: X, findUnder: under, findFields: fields, projects: { ...(S.gens || {}) }, levels: S.slotLevels, adapt: S.adapt || {}, finalFocus: S.focus.map(v => +v.toFixed(2)), dead: !!S.dead, cohesion: Math.round(S.cohesion || 0) });
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(join(OUT, `run-${i}.json`), JSON.stringify({ i, seed, empires: N, stars: STARS, eons: W.eon, end, seconds: Math.round((Date.now() - t0) / 1000), winner: W.winner, R }));
  console.log(`run ${i}: ${N} empires, ${W.eon} eons, ${end} (${Math.round((Date.now() - t0) / 1000)} s)`);
  process.exit(0);
}

// THE DRIVER: a pool of workers, one run each
const RUNS = +(process.argv[2] || 60), EONS = +(process.argv[3] || 3000), STARS = +(process.argv[4] || 200), WORKERS = +(process.argv[5] || 12);
fs.mkdirSync(OUT, { recursive: true });
let next = 0, running = 0, done = 0; const t0 = Date.now();
await new Promise(resolve => {
  const launch = () => {
    while (running < WORKERS && next < RUNS) {
      const i = next++; if (fs.existsSync(join(OUT, `run-${i}.json`))) { done++; continue; }   // a sweep that was stopped picks up where it was
      running++;
      const ch = spawn(process.execPath, ['--max-old-space-size=2048', fileURLToPath(import.meta.url), '--one', String(i), String(EONS), String(STARS)], { stdio: ['ignore', 'pipe', 'pipe'] });
      ch.stdout.on('data', d => process.stdout.write(d)); ch.stderr.on('data', d => process.stderr.write(`[run ${i}] ${d}`));
      ch.on('exit', code => { running--; done++; if (code) console.log(`run ${i} failed (${code})`); console.log(`  ${done}/${RUNS} done · ${Math.round((Date.now() - t0) / 60000)} min`); if (done >= RUNS && !running) resolve(); else launch(); });
    }
    if (done >= RUNS && !running) resolve();
  };
  launch();
});
console.log(`sweep: ${RUNS} runs in ${Math.round((Date.now() - t0) / 60000)} min → ${OUT}`);
