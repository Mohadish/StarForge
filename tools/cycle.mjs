// THE CYCLE: five tactics, built by the generator (composePlan → buildPlan), each at its natural ship size (TACTICS.size —
// more money buys more ships), every pair fought N times, sides swapped every other fight.
// Target (his diagram, 2026-10-11): strong  brute>screen>hitrun>range>replen>brute ; marginal  brute>range>screen>replen>hitrun>brute
// Usage: node tools/cycle.mjs <budget> <fights a pair>      (ROOT=file:///…/src/eon/ to measure another copy of the code)
// Two tables: how often the row wins, and how much of the row's fleet is left when it wins (a marginal win costs more).
const root = process.env.ROOT || new URL('../src/eon/', import.meta.url).href;
const BT = await import(root + 'battle.js'), FP = await import(root + 'fleetplan.js'); const S = { breakthroughs: [] };
const T = ['brute', 'screen', 'hitrun', 'range', 'replen'], SHORT = { brute: 'BRU', screen: 'SCR', hitrun: 'H&R', range: 'RNG', replen: 'REP' };
const STRONG = { brute: 'screen', screen: 'hitrun', hitrun: 'range', range: 'replen', replen: 'brute' };
const MARG = { brute: 'range', range: 'screen', screen: 'replen', replen: 'hitrun', hitrun: 'brute' };
const budget = +(process.argv[2] || 3000), N = +(process.argv[3] || 8), ships = Object.fromEntries(T.map(t => [t, Math.max(1, Math.round(budget / (FP.TACTICS[t].size || 750)))]));
const fleet = (t, seed) => FP.buildPlan(S, FP.composePlan({ budget, n: ships[t], mix: [{ id: t, share: 1 }], seed, name: t })).ships;
const M = {}, L = {};
for (const a of T) for (const b of T) if (a < b) {
  let wa = 0, wb = 0, d = 0, la = 0, lb = 0;
  for (let i = 0; i < N; i++) {
    const A = fleet(a, 11 + i), Bf = fleet(b, 71 + i), swap = i % 2, r = swap ? BT.simulate(Bf, A, BT.rng32(i)) : BT.simulate(A, Bf, BT.rng32(i));
    const sa = swap ? 1 : 0, sb = 1 - sa;
    if (r.winner === sa) { wa++; la += r.left[sa]; } else if (r.winner === sb) { wb++; lb += r.left[sb]; } else d++;
  }
  M[a + '>' + b] = (wa + d / 2) / N; M[b + '>' + a] = (wb + d / 2) / N; L[a + '>' + b] = wa ? la / wa : null; L[b + '>' + a] = wb ? lb / wb : null;
}
const table = (title, f) => { console.log(title); console.log('      ' + T.map(t => SHORT[t].padStart(5)).join('')); for (const a of T) console.log(SHORT[a].padEnd(6) + T.map(b => a === b ? '    -' : f(a + '>' + b)).join('')); };
console.log(`budget ${budget} (ships: ${T.map(t => SHORT[t] + ' ' + ships[t]).join(', ')}), ${N} fights a pair`);
table('row wins %', key => String(Math.round(M[key] * 100)).padStart(5));
table('row\'s fleet hull left when it wins %', key => (L[key] === null ? '    ·' : String(Math.round(L[key] * 100)).padStart(5)));
let right = 0;
for (const a of T) { const s = M[a + '>' + STRONG[a]], m = M[a + '>' + MARG[a]]; right += (s > 0.5) + (m > 0.5); console.log(`${SHORT[a]} strong vs ${SHORT[STRONG[a]]}: ${Math.round(s * 100)}% (hull left ${L[a + '>' + STRONG[a]] === null ? '-' : Math.round(L[a + '>' + STRONG[a]] * 100) + '%'}) · marginal vs ${SHORT[MARG[a]]}: ${Math.round(m * 100)}% (hull left ${L[a + '>' + MARG[a]] === null ? '-' : Math.round(L[a + '>' + MARG[a]] * 100) + '%'})`); }
console.log(`links going the right way: ${right}/10`);
