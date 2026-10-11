// THE CYCLE: five tactics, built by the generator (composePlan → buildPlan), every pair fought N times both ways.
// Target (his diagram): strong  brute>screen>hitrun>range>replen>brute ; marginal  brute>range>screen>replen>hitrun>brute
const root = process.env.ROOT || new URL('../src/eon/', import.meta.url).href;
const BT = await import(root + 'battle.js'), FP = await import(root + 'fleetplan.js'); const S = { breakthroughs: [] };
const T = ['brute', 'screen', 'hitrun', 'range', 'replen'], SHORT = { brute: 'BRU', screen: 'SCR', hitrun: 'H&R', range: 'RNG', replen: 'REP' };
const STRONG = { brute: 'screen', screen: 'hitrun', hitrun: 'range', range: 'replen', replen: 'brute' };
const MARG = { brute: 'range', range: 'screen', screen: 'replen', replen: 'hitrun', hitrun: 'brute' };
const budget = +(process.argv[2] || 3000), N = +(process.argv[3] || 8), ships = { brute: 2, hitrun: 8, range: 4, replen: 4, screen: 5 };   // ships per fleet by appetite (TACTICS weight × 4)
const fleet = (t, seed) => FP.buildPlan(S, FP.composePlan({ budget, n: ships[t], mix: [{ id: t, share: 1 }], seed, name: t })).ships;
const M = {};
for (const a of T) for (const b of T) if (a < b) {
  let wa = 0, wb = 0, d = 0, time = 0;
  for (let i = 0; i < N; i++) { const A = fleet(a, 11 + i), Bf = fleet(b, 71 + i); const r = i % 2 ? BT.simulate(Bf, A, BT.rng32(i)) : BT.simulate(A, Bf, BT.rng32(i)); const winA = i % 2 ? r.winner === 1 : r.winner === 0, winB = i % 2 ? r.winner === 0 : r.winner === 1; if (winA) wa++; else if (winB) wb++; else d++; time += r.time; }
  M[a + '>' + b] = (wa + d / 2) / N; M[b + '>' + a] = (wb + d / 2) / N; M[a + '|' + b + ':t'] = Math.round(time / N);
}
console.log(`budget ${budget}, ${N} fights a pair — row's win share vs column`);
console.log('      ' + T.map(t => SHORT[t].padStart(5)).join(''));
for (const a of T) console.log(SHORT[a].padEnd(6) + T.map(b => a === b ? '    -' : String(Math.round(M[a + '>' + b] * 100)).padStart(5)).join(''));
let score = 0; const rows = [];
for (const a of T) { const s = M[a + '>' + STRONG[a]], m = M[a + '>' + MARG[a]]; rows.push(`${SHORT[a]} strong vs ${SHORT[STRONG[a]]}: ${Math.round(s * 100)}% (want ≥75) ${s >= 0.75 ? 'OK' : 'MISS'} · marginal vs ${SHORT[MARG[a]]}: ${Math.round(m * 100)}% (want 55–70) ${m >= 0.55 && m <= 0.75 ? 'OK' : 'MISS'}`); score += (s >= 0.75) + (m >= 0.55 && m <= 0.75); }
console.log(rows.join('\n')); console.log(`cycle score ${score}/10`);
for (const t of T) { const f = fleet(t, 11); console.log(SHORT[t], f.length + ' ships ·', f[0].plan.words, '·', BT.archetype(f[0]).label, '· speed', Math.round(f[0].speed), 'evade', Math.round(f[0].evade * 100) + '%', 'reach', f[0].pref); }
