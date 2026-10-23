// THE COLONY AS DISTRICTS (his call, 2026-10-22: "a district is the unit that can be specifically built on — keep them separated"):
// a developed world is the planet's own DISTRICTS (terrain.js — the smallest Voronoi cells, found once per planet), and every district
// that can be built on (not sea on a living or an ocean world, not the polar cap or the strip beside it, not a chasm) holds ONE unit of
// one of four kinds — INDUSTRY, FOOD, HOUSING, SCIENCE — or nothing yet. What a unit gives is its kind's capacity × its GROUND: the
// district's grade for that kind (terrain.js gradeOf: lowland and coast for farms, foothills and highland for works, islands and the
// rare landmarks for labs…) — nothing else: no trade-offs inside a cell, no "short of hands", no "pure" (his call: those penalties are
// gone; a planet-wide one may come later). Nothing is planned by hand: the colony has ONE focus — the tetrahedron's four weights — and
// the planet's triangle has a third corner, DEVELOPMENT: the hands that build. Each eon the builders' points buy units; a new unit is
// the kind furthest under its target, and it goes on the frontier of the settlement (a district touching a built one) where the
// ground suits that kind best — it grows out of the landing like an infection; when the land it stands on is full it jumps to the
// nearest free land (a second settlement). A FULL planet re-makes itself in two stages: a unit torn down one eon, the new kind built
// the next — never a kind the colony is short of.
// THE FILLET (his idea): a corner the colony cannot use rounds off — industry and science by the share of their units that stand idle
// (no hands), housing by hunger (and empty homes), food by surplus (nobody to eat it) — and the focus is held off a rounded corner, so
// a colony pushed all the way to one corner slides back by itself to what it can support. It creeps FILLET.step an eon (no jitter).
// The unit kinds share one GLOBAL design per empire (a level each — breakthroughs will raise them).
// Two layers, both pure and deterministic, no DOM:
//  · the SURFACE engine (G = { w, h, pid, kind, units, b, landing, wf, sup, progress }) — what model.js runs for every colony;
//  · the SANDBOX economy (planet.html, tools/play/planet.mjs) — a small stand-in economy on top of the same engine.
import { FACTORS, FACTOR_COLOR, DISTRICT, employed } from './districts.js';
import { districts as planetDistricts, KINDS as PLANET_KINDS } from './terrain.js';
export { FACTORS, FACTOR_COLOR };
export const KIND_WORD = { industry: 'industry', food: 'food', housing: 'housing', science: 'science' };
export const UNIT = {
  cap: { industry: 15, science: 15, housing: 30, food: 30 },   // M people one district employs / houses / feeds at level 1, on ground of grade 0.5
  grade: [0.5, 1],                                              // × (0.5 + 1 × the district's grade for that kind): 0.5 on the worst ground, 1.5 on the best
  base: 20,                                                     // the sandbox: M people the landing itself houses (the game has the world's own room)
  levelGain: 0.25,                                              // a kind's output × (1 + levelGain × (level − 1)) — breakthroughs raise the level
};
export const LEVEL1 = { industry: 1, food: 1, housing: 1, science: 1 };
export const DEV = { perM: 0.12, cost: 10, demolish: 4, maxPerEon: 6 };   // builder points per M builders an eon; points a unit costs; points to tear one down; at most this many units an eon
export const FILLET = { step: 0.1, maxR: 0.7, empty: 1.5 };   // the fillet creeps this much an eon; a corner's full radius (0.7 → a full corner capped near 63 %); homes past empty × people fillet housing
export const GROW = { rate: 0.03, health: 0.3, starve: 0.02, crowd: 0.1 };
export const TRI = ['industry', 'research', 'development'];

export const mulberry = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const hashSeed = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------------- the SURFACE engine ----------------
// the planet under a surface: its districts (terrain.js), by its id, size and kind ('other' — a barren or a hot world — is rock)
export const terrainKind = k => PLANET_KINDS.includes(k) ? k : 'rock';
export const planetOf = G => planetDistricts(G.pid ?? 'sandbox', G.w, G.h, terrainKind(G.kind));
export const gradeMul = (D, k, kind) => UNIT.grade[0] + UNIT.grade[1] * (D.grade[k] ? D.grade[k][kind] : 0.5);
export const levelMul = (levels, kind) => 1 + UNIT.levelGain * ((levels[kind] || 1) - 1);
// what one unit gives at full (M people): its kind's capacity × its ground × the empire's level of the kind
export const unitCap = (D, k, kind, levels = LEVEL1) => UNIT.cap[kind] * gradeMul(D, k, kind) * levelMul(levels, kind);
const wrapDx = (D, dx) => { dx = Math.abs(dx); return Math.min(dx, D.W - dx); };
const farCells = (D, a, b) => Math.hypot(wrapDx(D, D.feat[a].x - D.feat[b].x), (D.feat[a].y - D.feat[b].y) * 2) / D.cellW;   // in cells (the planet wraps left to right)
// THE LANDING: the buildable district where people would first settle — good for homes and farms, near the equator and the middle of
// the strip, with room round it
export function landingOf(D) {
  let best = -1, bs = -Infinity;
  for (let k = 0; k < D.n; k++) {
    if (!D.hab[k]) continue; const f = D.feat[k], g = D.grade[k], room = D.adj[k].filter(q => D.hab[q]).length;
    const s = 1.2 * g.housing + 0.6 * g.food - 0.8 * f.lat - 0.6 * Math.abs(f.x / D.W - 0.5) + 0.08 * Math.min(6, room);
    if (s > bs) { bs = s; best = k; }
  }
  return best;
}
// a unit going up: b, 0 to 1, is how far (none means built); it gives b of what it will (a home houses that much, a farm feeds that much)
export const bOf = (G, k) => G.b && G.b[k] != null ? G.b[k] : 1;
export function partialUnit(G) {
  let best = null; for (const k in G.b || {}) { const b = G.b[k]; if (b < 1 && G.units[k] && (!best || b < best.b)) best = { unit: +k, kind: G.units[k], b }; }
  return best;
}
export const counts = G => { const n = { industry: 0, food: 0, housing: 0, science: 0, total: 0 }; for (const k in G.units) { n[G.units[k]]++; n.total++; } return n; };
export const isFull = G => counts(G).total >= planetOf(G).net;
const firstNeed = (G, noFood) => { const n = counts(G); return !n.housing ? 'housing' : !noFood && !n.food ? 'food' : null; };   // the first home and the first farm before anything else
// A SURFACE FOR A WORLD: the landing; a homeworld's old city is 16 units round it (four of each kind); a new colony's landing holds a
// home and a farm — on a dry world too: the farm grows once water is brought in (model.js waterSupply)
// THE LANDING (his rule, 2026-10-20: "you come in with 47,000 people, you get room for like 50,000 — what the ship brought — then you
// build"): its home and its farm are only as far built as the ship's homes and stores — SHELTER times the settlers
export const SHELTER = 2;
export const FOCUS0 = [0.25, 0.25, 0.25, 0.25];
export function newSurface({ w, h, pid = 'sandbox', kind = 'rock', home = false, arrivals = null, blank = false }) {
  const G = { w, h, pid, kind: terrainKind(kind), units: {}, b: {}, landing: -1, wf: FOCUS0.slice(), sup: { industry: 1, food: 1, housing: 1, science: 1 }, progress: 0 };
  const D = planetOf(G); G.landing = landingOf(D); if (blank || G.landing < 0) return G;
  const start = home ? ['housing', 'food', 'industry', 'science', 'housing', 'food', 'industry', 'science', 'housing', 'food', 'industry', 'science', 'housing', 'food', 'industry', 'science'] : ['housing', 'food'];
  for (const kind of start) { const k = nextUnit(G, kind); if (k < 0) break; G.units[k] = kind; }
  if (!home && arrivals != null) for (const k in G.units) G.b[k] = Math.max(0.0005, Math.min(1, arrivals * SHELTER / Math.max(1e-6, unitCap(D, +k, G.units[k]))));
  return G;
}
// an OLDER surface (2026-10-18 → 10-21: cells of four slots) becomes districts: its finished slots are laid again, kind by kind in the
// order the builders would lay them, then the ones going up — as many as the planet has buildable districts; the focus and the fillet stay
export function unitsFromCells(old, { pid, kind }) {
  const G = newSurface({ w: old.w, h: old.h, pid, kind, blank: true }); if (G.landing < 0) return G;
  G.wf = Array.isArray(old.wf) ? old.wf.slice() : old.dot ? rectWeights(old.dot.x, old.dot.y) : FOCUS0.slice(); if (old.sup) G.sup = { ...G.sup, ...old.sup }; G.progress = old.progress || 0;
  const done = { industry: 0, food: 0, housing: 0, science: 0 }, going = [];
  for (const c of old.cells || []) (c.slots || []).forEach((kd, i) => { if (!(kd in done)) return; const b = c.b && c.b[i] != null ? c.b[i] : 1; if (b >= 1) done[kd]++; else going.push({ kind: kd, b }); });
  const total = FACTORS.reduce((a, k) => a + done[k], 0), share = Object.fromEntries(FACTORS.map(k => [k, total ? done[k] / total : 0]));
  for (let i = 0; i < total; i++) { const kd = nextKind(G, share); if (!kd) break; const k = nextUnit(G, kd); if (k < 0) break; G.units[k] = kd; }
  for (const g of going) { const k = nextUnit(G, g.kind); if (k < 0) break; G.units[k] = g.kind; G.b[k] = g.b; }
  return G;
}
// the CAPACITIES of a surface (M people): what its units employ, house and feed — each its kind's capacity × its ground × the empire's
// level of the kind × how far it is built × the world's own multiplier for the kind (mul — the farms' CLIMATE, districts.js).
// scienceShare: the share of the units that are labs (health, care — model.js)
// THE FARMS NEED HANDS (his call, 2026-10-23): a farm district has jobs for UNIT.cap.food / FARM.feeds M — one farmer feeds FARM.feeds
// people on ground of grade 0.5; better ground, research and a kinder climate make every farmer feed more (the jobs stay the same)
export const FARM = { feeds: 4 };
export const jobsOf = (G, k) => G.units[k] === 'food' ? UNIT.cap.food / FARM.feeds * bOf(G, k) : 0;
export function capsOf(G, { levels = LEVEL1, mul = {} } = {}) {
  const D = planetOf(G), cap = { industry: 0, food: 0, housing: 0, science: 0, units: 0, scienceShare: 0, farmJobs: 0 }, perUnit = {};
  for (const k in G.units) { const kind = G.units[k], out = unitCap(D, +k, kind, levels) * bOf(G, k) * (mul[kind] ?? 1); cap[kind] += out; if (kind === 'food') cap.farmJobs += jobsOf(G, k); cap.units++; if (kind === 'science') cap.scienceShare++; perUnit[k] = out; }
  cap.scienceShare = cap.units ? cap.scienceShare / cap.units : 0;
  return { cap, perUnit };
}
// the most homes the world could ever hold (every buildable district a home)
export function roomOf(G, levels = LEVEL1) { const D = planetOf(G); let r = 0; for (let k = 0; k < D.n; k++) if (D.hab[k]) r += unitCap(D, k, 'housing', levels); return r; }
// THE FOCUS — A TETRAHEDRON (his call, 2026-10-20: "on a rectangle food and housing are opposite corners — I can't ask for 50 % of each"):
// the four corners, industry / food / housing / science (FACTORS' order), each pair joined by an edge, so any mix is a point in it —
// 50 % food and 50 % housing is the middle of their edge. G.wf is the WISH (four weights). THE FILLET CUTS each corner the colony
// cannot support: a corner may have at most 1 − (1 − support) × the cut (a full cut leaves ≈ 63 % at the slider's 0.7), and what is
// over a cap goes to the other corners in proportion. An older surface's rectangle dot is read as the rectangle read it.
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
// the next unit's kind: the corner furthest under its target share (a corner at zero never builds)
export function nextKind(G, weights) {
  const n = counts(G); let best = null, bs = -Infinity;
  for (const k of FACTORS) { if (weights[k] <= 0.001) continue; const s = weights[k] * (n.total + 1) - n[k]; if (s > bs) { bs = s; best = k; } }
  return best;
}
// where it goes: a free buildable district on the settlement's FRONTIER (touching a built one) whose ground suits the kind best, next to
// its own kind if it can (homes by homes, farms by farms), not far from the landing; with no frontier left (the land it stands on is
// full) the nearest free land — a second settlement. The first unit goes on the landing.
export function nextUnit(G, kind) {
  const D = planetOf(G), U = G.units; let any = false; for (const k in U) { any = true; break; }
  if (!any) return G.landing >= 0 && D.hab[G.landing] ? G.landing : -1;
  let best = -1, bs = -Infinity;
  for (let k = 0; k < D.n; k++) {
    if (!D.hab[k] || U[k]) continue; let touch = 0, same = 0; for (const q of D.adj[k]) if (U[q]) { touch++; if (U[q] === kind) same++; }
    const s = (touch ? 4 : 0) + 2 * D.grade[k][kind] + 0.5 * Math.min(2, same) + 0.25 * Math.min(3, touch) - 0.35 * farCells(D, k, G.landing);
    if (s > bs) { bs = s; best = k; }
  }
  return best;
}
// a full planet: a unit of the kind furthest OVER its target is TORN DOWN so the kind furthest under can go up in its place — never a
// kind the colony is short of (`lack`); the one whose ground suits the new kind best (and its own the least)
export function demolishPick(G, weights, lack = {}) {
  const n = counts(G); let over = null, os = -Infinity;
  for (const k of FACTORS) { if (lack[k]) continue; const s = n[k] - weights[k] * n.total; if (s > os) { os = s; over = k; } }
  const to = nextKind(G, weights); if (!over || !to || over === to || os < 1) return null;
  const D = planetOf(G); let unit = -1, us = -Infinity;
  for (const k in G.units) { if (G.units[k] !== over || (G.b && G.b[k] != null)) continue; const s = D.grade[k][to] - D.grade[k][over]; if (s > us) { us = s; unit = +k; } }
  return unit < 0 ? null : { unit, from: over, to };
}
// what the builders do next: { unit, kind, b } — a unit going up (b how far), a new one to lay (b 0), or one to tear down first
// (demolish, b = how far the demolition) — or null
export function building(G, { noFood = false, lack = {} } = {}) {
  const part = partialUnit(G); if (part) return { ...part, partial: true };
  const w = weightsFor(G, { noFood }), k = firstNeed(G, noFood) || nextKind(G, w); if (!k) return null;
  if (isFull(G)) { const p = demolishPick(G, w, lack); return p ? { unit: p.unit, kind: p.to, demolish: p.from, b: Math.min(1, (G.progress || 0) / DEV.demolish) } : null; }
  const u = nextUnit(G, k); return u < 0 ? null : { unit: u, kind: k, b: 0 };
}
// ONE EON OF BUILDING: the points go into the unit going up (the least built first) — a unit gives what it is built to, a point at a
// time; one finished, a new one is laid where it fits and grows on. A full world tears one down (DEV.demolish, banked across eons)
// and the new kind goes up the next eon
export function developStep(G, points, { noFood = false, lack = {} } = {}) {
  const log = []; let pts = Math.max(0, points); if (!G.b) G.b = {};
  if (!isFull(G) || partialUnit(G)) { pts += G.progress || 0; G.progress = 0; }   // banked points join (a full world banks them for its demolition)
  let done = 0;
  while (pts > 1e-12 && done < DEV.maxPerEon) {
    const part = partialUnit(G);
    if (part) {
      const put = Math.min(pts, (1 - part.b) * DEV.cost); pts -= put; const b = part.b + put / DEV.cost;
      if (b >= 1 - 1e-9) { delete G.b[part.unit]; done++; log.push({ kind: 'unit', unit: part.unit, slot: part.kind }); } else G.b[part.unit] = b;
      continue;
    }
    const w = weightsFor(G, { noFood });
    if (!isFull(G)) {                                                            // lay a new unit: it starts at nothing and grows
      const kind = firstNeed(G, noFood) || nextKind(G, w); if (!kind) break;
      const k = nextUnit(G, kind); if (k < 0) break;
      G.units[k] = kind; G.b[k] = 0;
      continue;
    }
    G.progress = (G.progress || 0) + pts; pts = 0;                               // a full world: bank toward tearing one down
    if (G.progress < DEV.demolish) break;
    const p = demolishPick(G, w, lack); if (!p) { G.progress = Math.min(G.progress, DEV.cost); break; }   // nothing to re-make: the points are not hoarded past one unit's worth
    delete G.units[p.unit]; delete G.b[p.unit];
    G.progress -= DEV.demolish; log.push({ kind: 'demolish', unit: p.unit, slot: p.from, to: p.to });
    break;                                                                       // the rubble lies an eon: the new unit goes up next eon at the earliest
  }
  return log;
}
// a district in words (the pop-up's hover): what the ground is, what it is good for, why nothing can stand there
const NATURE_WORD = { ocean: 'sea', low: 'lowland', mid: 'upland', high: 'highland', ice: 'ice', chasm: 'chasm' };
const SPECIAL_WORD = { 1: 'a crater', 2: 'a geyser field', 3: 'crystal outcrops', 4: 'an anomaly' };
export function districtInfo(G, k) {
  const D = planetOf(G); if (!(k >= 0 && k < D.n)) return null; const f = D.feat[k], kindW = terrainKind(G.kind);
  const bits = [NATURE_WORD[f.nature] || f.nature];
  if (f.nature !== 'ocean') { if (f.coast >= 1 && f.coast <= 2) bits.push('coast'); if (f.island) bits.push('island'); if (f.lake) bits.push('by a lake'); }
  if (f.foothill) bits.push('foothills'); if (f.basin) bits.push('basin'); if (f.canyon) bits.push('canyon'); if (f.special) bits.push(SPECIAL_WORD[f.special] || 'a landmark');
  const why = D.hab[k] ? null : D.polar[k] ? 'the polar cap' : f.nature === 'ocean' && kindW !== 'ice' ? 'sea' : f.nature === 'chasm' ? 'a chasm' : 'beside the polar cap — kept clear';
  return { k, ground: bits.join(' · '), grade: D.grade[k], buildable: !!D.hab[k], why, unit: G.units[k] || null, b: G.units[k] ? bOf(G, k) : 0, landing: k === G.landing };
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
export function newColony({ w = 6, h = 3, seed = 'home', kind = 'living', people = 100, home = true, focus = [0.25, 0.25, 0.25, 0.25], tri = { industry: 0.4, research: 0.3, development: 0.3 } } = {}) {
  const C = { ...newSurface({ w, h, pid: seed, kind, home }), seed, eon: 0, people, tri: { ...tri }, levels: { ...LEVEL1 }, log: [], last: null };
  C.wf = focus.slice(); C.last = compute(C); return C;
}
export function compute(C) {
  const { cap, perUnit } = capsOf(C, { levels: C.levels });
  const t = normTri(C.tri), people = C.people;
  const hands = { industry: people * t.industry, research: people * t.research, development: people * t.development };
  const food = cap.food, eat = people, fed = eat > 0 ? Math.min(1, food / eat) : 1, hungry = 1 - DISTRICT.hunger * (1 - fed);
  const industry = employed(hands.industry, cap.industry) * hungry, science = employed(hands.research, cap.science) * hungry, housing = UNIT.base + cap.housing;
  const dev = hands.development * DEV.perM * hungry;
  const staffed = { industry: cap.industry > 0 ? Math.min(1, hands.industry / cap.industry) : 1, science: cap.science > 0 ? Math.min(1, hands.research / cap.science) : 1 };
  const growth = GROW.rate * Math.max(-1, 1 - people / Math.max(1, housing)) * fed * (1 + GROW.health * cap.scienceShare);
  const want = { industry: staffed.industry, science: staffed.science, housing: fed * Math.min(1, people * FILLET.empty / Math.max(1, housing)), food: food > 0 ? Math.min(1, eat / food) : 1 };
  const lack = { food: food < eat, housing: housing < people, industry: hands.industry > cap.industry, science: hands.research > cap.science };
  return { cap, perUnit, hands, food, eat, fed, hungry, industry, science, housing, dev, staffed, growth, want, lack, people, weights: weightsFor(C), counts: counts(C) };
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
