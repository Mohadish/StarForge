// THE COLONY AS SLOTS (his design, 2026-10-18): a developed world is a grid of cells, every cell FOUR SLOTS, every slot one of four
// kinds — INDUSTRY, FOOD, HOUSING, SCIENCE. Nothing is designed per cell: the colony has ONE rectangle, the DEVELOPMENT FOCUS — a dot
// among the four corners whose bilinear weights are the target shares — and the planet's triangle has a third corner, DEVELOPMENT:
// the hands that build the next slot. Each eon the builders' points buy slots; a new slot is the kind furthest under its target, and
// it goes where it fits: a cell the player PLANNED for that kind first, then a cell whose TRAIT suits it (deposits → industry,
// fertile → food, calm → housing, anomaly → science), then the cell being filled, then the frontier of the settlement — it grows out
// of the landing like an infection; a planned cell far from it starts a second settlement. A FULL planet re-makes itself in two
// stages: a slot torn down one eon, the new kind built the next (a penalty of time) — never a kind the colony is short of.
// THE FILLET (his idea): a corner the colony cannot use rounds off — industry and science by the share of their slots that stand idle
// (no hands), housing by hunger (and empty homes), food by surplus (nobody to eat it) — and the dot is held off a rounded corner, so a
// colony pushed all the way to one corner slides back by itself to what it can support. It creeps FILLET.step an eon (no jitter).
// The slot kinds share one GLOBAL design per empire (a level each — breakthroughs will raise them).
// Two layers, both pure and deterministic, no DOM:
//  · the SURFACE engine (G = { w, h, cells, landing, dot, sup, progress }) — what model.js runs for every colony in the game;
//  · the SANDBOX economy (planet.html, tools/play/planet.mjs) — a small stand-in economy on top of the same engine.
import { FACTORS, FACTOR_COLOR, DISTRICT, cellEffect, employed } from './districts.js';
export { FACTORS, FACTOR_COLOR };
export const KIND_WORD = { industry: 'industry', food: 'food', housing: 'housing', science: 'science' };
export const SLOT = {
  per: 4,                                              // slots a cell holds
  cap: { industry: 15, science: 15, housing: 30, food: 30 },   // M people one slot employs / houses / feeds at level 1
  base: 20,                                            // the sandbox: M people the landing itself houses (the game has the world's own room)
  levelGain: 0.25,                                     // a slot kind's output × (1 + levelGain × (level − 1)) — breakthroughs raise the level
};
export const LEVEL1 = { industry: 1, food: 1, housing: 1, science: 1 };
export const TRAITS = { none: null, deposits: 'industry', fertile: 'food', calm: 'housing', anomaly: 'science' };
export const TRAIT_GLYPH = { deposits: '⛏', fertile: '🌾', calm: '☼', anomaly: '✦' };
export const TRAIT = { boost: 1.5, chance: 0.45 };    // a trait's slot kind yields × boost; chance a cell has any trait
export const DEV = { perM: 0.12, cost: 10, demolish: 4, maxPerEon: 6 };   // builder points per M builders an eon; points a slot costs; points to tear one down; at most this many slots an eon
export const FILLET = { step: 0.1, maxR: 0.7, empty: 1.5 };   // the fillet creeps this much an eon; a corner's full radius (0.5: four full fillets make a circle, a full corner capped near 73 %; 0.7 → 63 %); homes past empty × people fillet housing
export const GROW = { rate: 0.03, health: 0.3, starve: 0.02, crowd: 0.1 };
export const TRI = ['industry', 'research', 'development'];

export const mulberry = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const hashSeed = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------------- the SURFACE engine ----------------
// a fresh surface: w × h cells, each { slots: [], trait, plan } — traits rolled from the seed (a world's id: the same world, the same ground)
export function newCells(w, h, rng) {
  const kinds = Object.keys(TRAITS).filter(k => k !== 'none');
  return Array.from({ length: w * h }, () => ({ slots: [], trait: rng() < TRAIT.chance ? kinds[Math.floor(rng() * kinds.length)] : 'none', plan: null }));
}
export const idx = (G, x, y) => y * G.w + x, xy = (G, i) => [i % G.w, Math.floor(i / G.w)];
// the cells round one: the four orthogonal first (n = 4), then the diagonals (n = 8)
export function neighbours(G, i, n = 8) {
  const [x, y] = xy(G, i), out = [], ring = n === 4 ? [[0, -1], [-1, 0], [1, 0], [0, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [dx, dy] of ring) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < G.w && Y < G.h) out.push(idx(G, X, Y)); }
  return out;
}
// a surface for a world: the landing in the middle; a homeworld's old city is the landing and its three nearest neighbours, each a
// mixed cell (one slot of every kind); a new colony's landing holds a home and a farm — on a dry world too: the farm grows once water
// is brought in (model.js waterSupply), and that first harvest is what lets a handful of settlers grow (a works left them stuck)
// THE LANDING (his rule, 2026-10-20: "you come in with 47,000 people, you get room for like 50,000 — what the ship brought — then you
// build"): its home and its farm are only as far built as the ship's homes and stores — SHELTER times the settlers; the rest of
// those two slots is still to build, a point at a time
export const SHELTER = 2;
export function newSurface({ w, h, seed, home = false, water = true, landing = null, arrivals = null }) {
  const G = { w, h, cells: newCells(w, h, mulberry(hashSeed(seed))), landing: landing == null ? Math.floor(h / 2) * w + Math.floor((w - 1) / 2) : landing, wf: FOCUS0.slice(), sup: { industry: 1, food: 1, housing: 1, science: 1 }, progress: 0 };
  const seedCells = home ? [G.landing, ...neighbours(G, G.landing, 4)].slice(0, 4) : [G.landing];
  for (const i of seedCells) G.cells[i].slots = home ? ['housing', 'food', 'industry', 'science'] : ['housing', 'food'];
  if (!home && arrivals != null) { const full = capsOf(G).cap; G.cells[G.landing].b = [Math.max(0.0005, Math.min(1, arrivals * SHELTER / Math.max(1e-6, full.housing))), Math.max(0.0005, Math.min(1, arrivals * SHELTER / Math.max(1e-6, full.food)))]; }
  return G;
}
// A SLOT GOING UP (his rule, 2026-10-20: growth must follow building): every slot is built a point at a time — b, 0 to 1, is how far
// (none means built); it gives b of what it will (a home houses that much, a farm feeds that much). Builders finish the least-built first
export const bOf = (cell, i) => cell.b && cell.b[i] != null ? cell.b[i] : 1;
export function partialSlot(G) {
  let best = null;
  G.cells.forEach((cell, c) => { if (!cell.b) return; cell.slots.forEach((kind, i) => { const b = bOf(cell, i); if (b < 1 && (!best || b < best.b)) best = { cell: c, slot: i, kind, b }; }); });
  return best;
}
const firstNeed = (G, noFood) => { const n = counts(G); return !n.housing ? 'housing' : !noFood && !n.food ? 'food' : null; };   // the first home and the first farm before anything else
export const counts = G => { const n = { industry: 0, food: 0, housing: 0, science: 0, total: 0 }; for (const c of G.cells) for (const k of c.slots) { n[k]++; n.total++; } return n; };
export const cellMix = cell => { const m = { industry: 0, food: 0, housing: 0, science: 0 }; for (const k of cell.slots) m[k] += 1 / SLOT.per; return m; };
export const traitMul = (cell, kind) => TRAITS[cell.trait] === kind ? TRAIT.boost : 1;
export const isFull = G => G.cells.every(c => c.slots.length >= SLOT.per);
export const isPure = cell => cell.slots.length === SLOT.per && new Set(cell.slots).size === 1;
// the CAPACITIES of a surface (M people): what its slots employ, house and feed — the square's trade-offs inside each cell (districts.js
// cellEffect: neighbours fight, the diagonals help, a cell without a home of its own is short of hands, a pure one is hit by a focus
// shock), the ground's trait, the empire's level of each slot kind
export function capsOf(G, { levels = LEVEL1, shock = 0 } = {}) {
  const cap = { industry: 0, food: 0, housing: 0, science: 0, cells: 0, scienceShare: 0, pure: 0, slots: 0 }, perCell = [];
  for (const cell of G.cells) {
    if (!cell.slots.length) { perCell.push(null); continue; }
    const mix = cellMix(cell), e = cellEffect(mix, shock), out = {}; cap.cells++; cap.slots += cell.slots.length; cap.scienceShare += mix.science; if (isPure(cell)) cap.pure++;
    const built = {}; for (const f of FACTORS) built[f] = [0, 0]; cell.slots.forEach((k, i) => { built[k][0]++; built[k][1] += bOf(cell, i); });   // a kind's slots going up give their share
    for (const f of FACTORS) { out[f] = e[f] * SLOT.per * SLOT.cap[f] * traitMul(cell, f) * (1 + SLOT.levelGain * ((levels[f] || 1) - 1)) * (built[f][0] ? built[f][1] / built[f][0] : 1); cap[f] += out[f]; }
    out.purity = e.purity; out.staffed = e.staffed; perCell.push(out);
  }
  cap.scienceShare = cap.cells ? cap.scienceShare / cap.cells : 0;
  return { cap, perCell };
}
// THE FOCUS — A TETRAHEDRON (his call, 2026-10-20: "on a rectangle food and housing are opposite corners — I can't ask for 50 % of each"):
// the four corners, industry / food / housing / science (FACTORS' order), each pair joined by an edge, so any mix is a point in it —
// 50 % food and 50 % housing is the middle of their edge. G.wf is the WISH (four weights). THE FILLET CUTS each corner the colony
// cannot support: a corner may have at most 1 − (1 − support) × the cut (a full cut leaves ≈ 63 % at the slider's 0.7), and what is
// over a cap goes to the other corners in proportion. An older surface's rectangle dot is read as the rectangle read it.
export const FOCUS0 = [0.25, 0.25, 0.25, 0.25];
export const rectWeights = (x, y) => { x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y)); return [(1 - x) * (1 - y), x * (1 - y), (1 - x) * y, x * y]; };
export function focusOf(G) { if (!G.wf) { G.wf = G.dot ? rectWeights(G.dot.x, G.dot.y) : FOCUS0.slice(); delete G.dot; } return G.wf; }
export const capOf = (G, kind) => 1 - (1 - Math.max(0, Math.min(1, G.sup[kind]))) * FILLET.maxR * 0.53;
export const capsAll = G => FACTORS.map(k => capOf(G, k));
export function effectiveFocus(G) {
  const w = focusOf(G).map(v => Math.max(0, +v || 0)), t = w.reduce((a, b) => a + b, 0) || 1; for (let i = 0; i < 4; i++) w[i] /= t;
  const caps = capsAll(G);
  for (let pass = 0; pass < 8; pass++) {
    let excess = 0; for (let i = 0; i < 4; i++) if (w[i] > caps[i]) { excess += w[i] - caps[i]; w[i] = caps[i]; }
    if (excess < 1e-12) break;
    const take = w.map((v, i) => w[i] < caps[i] - 1e-12 ? v + 1e-6 : 0), tt = take.reduce((a, b) => a + b, 0); if (tt <= 0) break;
    for (let i = 0; i < 4; i++) w[i] += excess * take[i] / tt;         // spread; what lands over a cap is cut again next pass
  }
  return w;
}
export const asKinds = w => ({ industry: w[0], food: w[1], housing: w[2], science: w[3] });
// the target shares: the effective focus — on a dry world no farms (food out, the rest share its weight)
export function weightsFor(G, { noFood = false } = {}) {
  const w = asKinds(effectiveFocus(G)); if (!noFood) return w;
  const t = w.industry + w.housing + w.science || 1; return { industry: w.industry / t, food: 0, housing: w.housing / t, science: w.science / t };
}
// the next slot's kind: the corner furthest under its target share (a corner at zero never builds)
export function nextKind(G, weights) {
  const n = counts(G); let best = null, bs = -Infinity;
  for (const k of FACTORS) { if (weights[k] <= 0.001) continue; const s = weights[k] * (n.total + 1) - n[k]; if (s > bs) { bs = s; best = k; } }
  return best;
}
// where it goes: a cell planned for this kind, a suiting trait, the cell being filled, the settlement's frontier — the best score wins;
// a planned cell takes nothing else; a planned cell off the frontier is a new seed (his call: a second settlement, they weld later)
export function nextCell(G, kind) {
  const started = new Set(); G.cells.forEach((c, i) => { if (c.slots.length) started.add(i); });
  const frontier4 = new Set(), frontier8 = new Set();
  for (const i of started) { for (const j of neighbours(G, i, 4)) if (!started.has(j)) frontier4.add(j); for (const j of neighbours(G, i, 8)) if (!started.has(j)) frontier8.add(j); }
  const [lx, ly] = xy(G, G.landing); let best = -1, bs = -Infinity;
  G.cells.forEach((cell, i) => {
    if (cell.slots.length >= SLOT.per) return;
    if (cell.plan && !cell.plan.includes(kind)) return;
    const planned = !!(cell.plan && cell.plan.includes(kind)), onFrontier = started.has(i) || frontier8.has(i);
    if (!planned && !onFrontier) return;
    const [x, y] = xy(G, i), far = Math.hypot(x - lx, y - ly);
    const s = (planned ? 10 : 0) + (TRAITS[cell.trait] === kind ? 3 : 0) + (started.has(i) ? 2 : 0) + (frontier4.has(i) ? 1 : 0) - far * 0.1 - (TRAITS[cell.trait] && TRAITS[cell.trait] !== kind && !cell.slots.length ? 1 : 0);
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}
// a full planet: a slot of the kind furthest OVER its target is TORN DOWN so the kind furthest under can go up in its place — never a
// kind the colony is short of (`lack`)
export function demolishPick(G, weights, lack = {}) {
  const n = counts(G); let over = null, os = -Infinity;
  for (const k of FACTORS) { if (lack[k]) continue; const s = n[k] - weights[k] * n.total; if (s > os) { os = s; over = k; } }
  const to = nextKind(G, weights); if (!over || !to || over === to || os < 1) return null;
  let cell = -1, cs = -Infinity;
  G.cells.forEach((c, i) => { const has = c.slots.filter(k => k === over).length; if (!has) return; if (c.plan && !c.plan.includes(to)) return; const s = (c.plan && c.plan.includes(to) ? 10 : 0) + (TRAITS[c.trait] === to ? 3 : 0) + has; if (s > cs) { cs = s; cell = i; } });
  return cell < 0 ? null : { cell, from: over, to };
}
// what the builders do next: { cell, kind, slot, b } — a slot going up (b how far), a new one to lay (b 0), or one to tear down first
// (demolish, b = how far the demolition) — or null
export function building(G, { noFood = false, lack = {} } = {}) {
  const part = partialSlot(G); if (part) return { ...part, partial: true };
  const w = weightsFor(G, { noFood }), k = firstNeed(G, noFood) || nextKind(G, w); if (!k) return null;
  if (isFull(G)) { const p = demolishPick(G, w, lack); return p ? { cell: p.cell, kind: p.to, demolish: p.from, slot: G.cells[p.cell].slots.indexOf(p.from), b: Math.min(1, (G.progress || 0) / DEV.demolish) } : null; }
  const i = nextCell(G, k); return i < 0 ? null : { cell: i, kind: k, slot: G.cells[i].slots.length, b: 0 };
}
// ONE EON OF BUILDING: the points go into the slot going up (the least built first) — a slot gives what it is built to, a point at
// a time; one finished, a new one is laid where it fits and grows on. A full world tears one down (DEV.demolish, banked across eons)
// and the new kind goes up the next eon
export function developStep(G, points, { noFood = false, lack = {} } = {}) {
  const log = []; let pts = Math.max(0, points);
  if (!isFull(G) || partialSlot(G)) { pts += G.progress || 0; G.progress = 0; }   // an older save's banked points join (a full world banks them for its demolition)
  let done = 0;
  while (pts > 1e-12 && done < DEV.maxPerEon) {
    const part = partialSlot(G);
    if (part) {
      const cell = G.cells[part.cell], put = Math.min(pts, (1 - part.b) * DEV.cost); pts -= put;
      if (!cell.b) cell.b = cell.slots.map(() => 1);
      cell.b[part.slot] = Math.min(1, part.b + put / DEV.cost);
      if (cell.b[part.slot] >= 1 - 1e-9) { cell.b[part.slot] = 1; if (cell.b.every(x => x >= 1)) delete cell.b; done++; log.push({ kind: 'slot', cell: part.cell, slot: part.kind, done: cell.slots.length === SLOT.per && !cell.b }); }
      continue;
    }
    const w = weightsFor(G, { noFood });
    if (!isFull(G)) {                                                            // lay a new slot: it starts at nothing and grows
      const kind = firstNeed(G, noFood) || nextKind(G, w); if (!kind) break;
      const i = nextCell(G, kind); if (i < 0) break;
      const cell = G.cells[i]; if (!cell.b) cell.b = cell.slots.map(() => 1); cell.slots.push(kind); cell.b.push(0);
      continue;
    }
    G.progress = (G.progress || 0) + pts; pts = 0;                               // a full world: bank toward tearing one down
    if (G.progress < DEV.demolish) break;
    const p = demolishPick(G, w, lack); if (!p) { G.progress = Math.min(G.progress, DEV.cost); break; }   // nothing to re-make: the points are not hoarded past one slot's worth
    const cell = G.cells[p.cell], si = cell.slots.indexOf(p.from); cell.slots.splice(si, 1); if (cell.b) { cell.b.splice(si, 1); if (cell.b.every(x => x >= 1)) delete cell.b; }
    G.progress -= DEV.demolish; log.push({ kind: 'demolish', cell: p.cell, slot: p.from, to: p.to });
    break;                                                                       // the rubble lies an eon: the new slot goes up next eon at the earliest
  }
  return log;
}
// the fillet creeps toward what each corner can support (0–1 each)
export function creepFillet(G, want) { for (const k of FACTORS) { const v = Math.max(0, Math.min(1, want[k] ?? 1)), d = v - G.sup[k]; G.sup[k] += Math.max(-FILLET.step, Math.min(FILLET.step, d)); } }
// why a corner is rounded, in words (the widget's hover); r: { staffed: { industry, science }, fed, housing, people, food, eat } (food in M fed)
export function filletWhy(G, kind, r) {
  const pct = v => Math.round(v * 100) + ' %';
  if (G.sup[kind] >= 0.97) return `${KIND_WORD[kind]}: the corner is open`;
  if (kind === 'industry') return `industry: ${pct(1 - r.staffed.industry)} of the works stand idle — no hands`;
  if (kind === 'science') return `science: ${pct(1 - r.staffed.science)} of the labs stand idle — no hands`;
  if (kind === 'housing') return r.fed < 1 ? `housing: hungry — food feeds ${pct(r.fed)} of the people` : `housing: homes for ${Math.round(r.housing)} M, people ${Math.round(r.people)} M — empty homes`;
  return `food: ${Math.round(r.food - r.eat)} M more fed than eat here — a surplus (nothing to ship it to yet)`;
}
export const normTri = tri => { const s = TRI.reduce((a, k) => a + Math.max(0, tri[k] || 0), 0) || 1; return Object.fromEntries(TRI.map(k => [k, Math.max(0, tri[k] || 0) / s])); };

// ---------------- the SANDBOX economy (planet.html) ----------------
// C = a surface plus { seed, eon, people, tri, levels, log, last }
export function newColony({ w = 6, h = 3, seed = 'home', people = 100, home = true, landing = null, focus = [0.25, 0.25, 0.25, 0.25], tri = { industry: 0.4, research: 0.3, development: 0.3 } } = {}) {
  const C = { ...newSurface({ w, h, seed, home, landing }), seed, eon: 0, people, tri: { ...tri }, levels: { ...LEVEL1 }, log: [], last: null };
  C.wf = focus.slice(); C.last = compute(C); return C;
}
export function compute(C) {
  const { cap, perCell } = capsOf(C, { levels: C.levels });
  const t = normTri(C.tri), people = C.people;
  const hands = { industry: people * t.industry, research: people * t.research, development: people * t.development };
  const food = cap.food, eat = people, fed = eat > 0 ? Math.min(1, food / eat) : 1, hungry = 1 - DISTRICT.hunger * (1 - fed);
  const industry = employed(hands.industry, cap.industry) * hungry, science = employed(hands.research, cap.science) * hungry, housing = SLOT.base + cap.housing;
  const dev = hands.development * DEV.perM * hungry;
  const staffed = { industry: cap.industry > 0 ? Math.min(1, hands.industry / cap.industry) : 1, science: cap.science > 0 ? Math.min(1, hands.research / cap.science) : 1 };
  const growth = GROW.rate * Math.max(-1, 1 - people / Math.max(1, housing)) * fed * (1 + GROW.health * cap.scienceShare);
  const want = { industry: staffed.industry, science: staffed.science, housing: fed * Math.min(1, people * FILLET.empty / Math.max(1, housing)), food: food > 0 ? Math.min(1, eat / food) : 1 };
  const lack = { food: food < eat, housing: housing < people, industry: hands.industry > cap.industry, science: hands.research > cap.science };
  return { cap, perCell, hands, food, eat, fed, hungry, industry, science, housing, dev, staffed, growth, want, lack, people, weights: weightsFor(C), counts: counts(C) };
}
export function endEon(C) {
  const r = compute(C);
  C.log = developStep(C, r.dev, { lack: r.lack });
  let people = C.people * (1 + r.growth);
  if (people > r.housing) people -= (people - r.housing) * GROW.crowd;
  if (r.fed < 1) people -= people * GROW.starve * (1 - r.fed);
  C.people = Math.max(0.001, people);
  creepFillet(C, r.want);
  C.eon++; C.last = compute(C); return r;
}
export const snapshot = C => JSON.parse(JSON.stringify(C));
