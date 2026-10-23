// THE SWEEP'S REPORT (tools/play/sweep.mjs): every empire of every run grouped by its FOCUS — how it fared, how much research it had,
// how often it found something, what its finds were good for (the four X of their channels, by summed boost), in which fields, which
// projects it ran.   node tools/play/sweep-report.mjs [dir=tools/play/out/sweep]  → the tables, and summary.json beside the runs
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const here = dirname(fileURLToPath(import.meta.url)), DIR = process.argv[2] || join(here, 'out', 'sweep');
const runs = fs.readdirSync(DIR).filter(f => /^run-\d+\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(join(DIR, f), 'utf8')));
const FOCI = ['expand', 'exploit', 'explore', 'exterm', 'mid'], XS = ['expand', 'exploit', 'explore', 'exterminate'];
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0, sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
const pct = v => (v * 100).toFixed(0).padStart(3) + ' %', f1 = v => v.toFixed(1), pad = (s, n) => String(s).padEnd(n);
const all = runs.flatMap(r => r.R.map(e => ({ ...e, run: r.i, eons: r.eons, won: r.winner === e.empire, life: e.deadAt ?? r.eons })));
console.log(`${runs.length} runs · ${all.length} empires · eons ${Math.min(...runs.map(r => r.eons))}–${Math.max(...runs.map(r => r.eons))} · ends: ${Object.entries(runs.reduce((a, r) => { const k = /holds/.test(r.end) ? 'a winner' : r.end; a[k] = (a[k] || 0) + 1; return a; }, {})).map(([k, v]) => `${v} × ${k}`).join(', ')}\n`);
const by = Object.fromEntries(FOCI.map(f => [f, all.filter(e => e.focus === f)]));
// 1. how they fared
console.log('FOCUS      n   survived  won   people(last)   colonies   research/eon (mean of samples)   final focus vector');
for (const f of FOCI) { const g = by[f]; if (!g.length) continue;
  const last = a => a.length ? a[a.length - 1] : 0;
  console.log(`${pad(f, 9)} ${String(g.length).padStart(3)}   ${pct(mean(g.map(e => e.dead ? 0 : 1)))}   ${String(g.filter(e => e.won).length).padStart(3)}   ${String(Math.round(mean(g.map(e => last(e.people))))).padStart(8)} M   ${f1(mean(g.map(e => last(e.colonies)))).padStart(6)}     ${f1(mean(g.map(e => mean(e.research)))).padStart(7)} ± ${f1(sd(g.map(e => mean(e.research))))}            [${XS.map((_, i) => mean(g.map(e => e.finalFocus[i])).toFixed(2)).join(' ')}]`); }
// 2. the finds: how many, how lucky, and WHAT THEY WERE GOOD FOR (the question)
console.log('\nFOCUS      finds/1000 eons  lucky/1000   what the finds were good for (share of their summed boost):  expand  exploit  explore  extermin.');
for (const f of FOCI) { const g = by[f]; if (!g.length) continue;
  const per = k => mean(g.map(e => e[k] / Math.max(1, e.life) * 1000)), tot = XS.map(x => mean(g.map(e => { const t = XS.reduce((a, y) => a + (e.findX[y] || 0), 0) || 1; return (e.findX[x] || 0) / t; })));
  console.log(`${pad(f, 9)}  ${f1(per('finds')).padStart(8)}        ${f1(per('lucky')).padStart(5)}                                                         ${tot.map(v => pct(v)).join('    ')}`); }
// 3. under which lean they were found
console.log('\nFOCUS      finds leaning to:  expand  exploit  explore  extermin.  (none = the focus was still near the centre)');
for (const f of FOCI) { const g = by[f]; if (!g.length) continue; const t = {}; for (const e of g) for (const [k, v] of Object.entries(e.findUnder || {})) t[k] = (t[k] || 0) + v; const n = Object.values(t).reduce((a, v) => a + v, 0) || 1;
  console.log(`${pad(f, 9)}                    ${XS.map(x => pct((t[x] || 0) / n)).join('    ')}     none ${pct((t.none || 0) / n)}`); }
// 4. the fields of the finds
const FIELDS = ['materials', 'fabrication', 'energy', 'electrics', 'optics', 'thermal', 'motion', 'life', 'information'];
console.log('\nFOCUS      finds by field: ' + FIELDS.map(x => x.slice(0, 6).padStart(7)).join(''));
for (const f of FOCI) { const g = by[f]; if (!g.length) continue; const t = {}; for (const e of g) for (const [k, v] of Object.entries(e.findFields || {})) t[k] = (t[k] || 0) + v; const n = Object.values(t).reduce((a, v) => a + v, 0) || 1;
  console.log(`${pad(f, 9)}                 ${FIELDS.map(x => pct((t[x] || 0) / n).padStart(7)).join('')}`); }
// 5. the projects (directed research): generations done per family
const FAMS = [...new Set(all.flatMap(e => Object.keys(e.projects || {})))].sort();
console.log('\nFOCUS      projects done per empire: ' + FAMS.map(x => x.slice(0, 8).padStart(9)).join(''));
for (const f of FOCI) { const g = by[f]; if (!g.length) continue; console.log(`${pad(f, 9)}                           ${FAMS.map(x => f1(mean(g.map(e => (e.projects || {})[x] || 0))).padStart(9)).join('')}`); }
fs.writeFileSync(join(DIR, 'summary.json'), JSON.stringify({ runs: runs.length, empires: all.length, byFocus: Object.fromEntries(FOCI.map(f => [f, by[f].length])) }, null, 1));
