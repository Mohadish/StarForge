// THE COLONY AS SLOTS (his design, 2026-10-18, second pass): a developed world is a grid of cells, every cell FOUR SLOTS, every slot one
// of four kinds — INDUSTRY, FOOD, HOUSING, SCIENCE. Nothing is designed per cell any more: the colony has ONE rectangle, the
// DEVELOPMENT FOCUS — a dot among the four corners whose bilinear weights are the target shares — and the planet's triangle gained a
// third corner, DEVELOPMENT: the hands that build the next slot. Each eon the builders' points buy slots; a new slot is the kind
// furthest under its target, and it goes where it fits: a cell the player PLANNED for that kind first, then a cell whose TRAIT suits
// it (deposits → industry, fertile → food, calm → housing, anomaly → science), then the cell being filled, then the frontier of the
// settlement — it grows outward from the landing like an infection; a planned cell far from it starts a second settlement.
// THE FILLET (his idea): a corner you cannot use rounds off — industry and science by the share of their slots that stand idle
// (no hands), housing by hunger (and empty homes), food by surplus (nobody to eat it) — and the dot is held off a rounded corner,
// so a colony pushed all the way to one corner slides back by itself to what it can support (a full fillet caps a corner near 73 %).
// The fillet moves slowly (FILLET.step an eon) so the dot does not jitter. Slot kinds share one GLOBAL design per empire (a level,
// raised by breakthroughs — later). Pure, deterministic, no DOM: the sandbox (planetlab.js) runs it today, model.js will tomorrow.
import { FACTORS, FACTOR_COLOR, DISTRICT, cellEffect, employed } from './districts.js';
export { FACTORS, FACTOR_COLOR };
export const KIND_WORD = { industry: 'industry', food: 'food', housing: 'housing', science: 'science' };
export const SLOT = {
  per: 4,                                              // slots a cell holds
  cap: { industry: 15, science: 15, housing: 30, food: 30 },   // M people one slot employs / houses / feeds at level 1
  base: 20,                                            // M people the landing itself houses (the colony ship)
  levelGain: 0.25,                                     // a slot kind's output × (1 + levelGain × (level − 1)) — breakthroughs raise the level
};
export const TRAITS = { none: null, deposits: 'industry', fertile: 'food', calm: 'housing', anomaly: 'science' };
export const TRAIT_GLYPH = { deposits: '⛏', fertile: '🌾', calm: '☼', anomaly: '✦' };
export const TRAIT = { boost: 1.5, chance: 0.45 };    // a trait's slot kind yields × boost; chance a cell has any trait
export const DEV = { perM: 0.12, cost: 10, retrain: 6, cell: 0, maxPerEon: 6 };   // builder points per M builders an eon; points a slot costs; to turn a slot into another kind; at most this many slots an eon
export const FILLET = { step: 0.1, maxR: 0.5, empty: 1.5 };   // the fillet creeps this much an eon; a corner's full radius (half the side: four full fillets make a circle); homes past empty × people fillet housing
export const GROW = { rate: 0.03, health: 0.3, starve: 0.02, crowd: 0.1 };
export const CORNER = { industry: [0, 0], food: [1, 0], housing: [0, 1], science: [1, 1] };   // the rectangle's corners, as the tiles' quarters
export const TRI = ['industry', 'research', 'development'];

export const mulberry = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const hashSeed = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// a fresh grid: w × h cells, each { slots: [], trait, plan } — traits rolled from the seed
export function newGrid(w, h, rng) {
  const kinds = Object.keys(TRAITS).filter(k => k !== 'none');
  return Array.from({ length: w * h }, () => ({ slots: [], trait: rng() < TRAIT.chance ? kinds[Math.floor(rng() * kinds.length)] : 'none', plan: null, building: null }));
}
// a colony on a grid: the landing cell gets the first slots (a home: four mixed cells round it)
export function newColony({ w = 6, h = 3, seed = 'home', people = 100, home = true, landing = null, dot = { x: 0.5, y: 0.5 }, tri = { industry: 0.4, research: 0.3, development: 0.3 } } = {}) {
  const rng = mulberry(hashSeed(seed)), cells = newGrid(w, h, rng);
  const C = { w, h, seed, eon: 0, people, cells, landing: landing == null ? Math.floor(h / 2) * w + Math.floor((w - 1) / 2) : landing, dot: { ...dot }, tri: { ...tri },
    sup: { industry: 1, food: 1, housing: 1, science: 1 }, progress: 0, levels: { industry: 1, food: 1, housing: 1, science: 1 }, log: [], last: null };
  const seedCells = home ? [C.landing, ...neighbours(C, C.landing, 4)].slice(0, 4) : [C.landing];
  for (const i of seedCells) cells[i].slots = home ? ['housing', 'food', 'industry', 'science'] : ['housing', 'food'];
  C.last = compute(C);
  return C;
}
export const idx = (C, x, y) => y * C.w + x, xy = (C, i) => [i % C.w, Math.floor(i / C.w)];
// the cells round one: the four orthogonal first (n = 4), then the diagonals (n = 8)
export function neighbours(C, i, n = 8) {
  const [x, y] = xy(C, i), out = [], ring = n === 4 ? [[0, -1], [-1, 0], [1, 0], [0, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [dx, dy] of ring) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < C.w && Y < C.h) out.push(idx(C, X, Y)); }
  return out;
}
export const counts = C => { const n = { industry: 0, food: 0, housing: 0, science: 0, total: 0 }; for (const c of C.cells) for (const k of c.slots) { n[k]++; n.total++; } return n; };
export const cellMix = cell => { const m = { industry: 0, food: 0, housing: 0, science: 0 }; for (const k of cell.slots) m[k] += 1 / SLOT.per; return m; };
export const traitMul = (cell, kind) => TRAITS[cell.trait] === kind ? TRAIT.boost : 1;

// THE RECTANGLE: a dot (x, y in 0–1) → the four corners' bilinear weights
export function weightsOf(dot) {
  const x = Math.max(0, Math.min(1, dot.x)), y = Math.max(0, Math.min(1, dot.y));
  return { industry: (1 - x) * (1 - y), food: x * (1 - y), housing: (1 - x) * y, science: x * y };
}
export const filletR = (C, kind) => (1 - Math.max(0, Math.min(1, C.sup[kind]))) * FILLET.maxR;
// the dot held off the rounded corners: each corner's arc centre sits r in from the corner; beyond it, the dot is pulled onto the arc
export function clampDot(C, dot) {
  let x = Math.max(0, Math.min(1, dot.x)), y = Math.max(0, Math.min(1, dot.y));
  for (const k of FACTORS) {
    const r = filletR(C, k); if (r <= 0) continue;
    const [cx, cy] = CORNER[k], ox = cx ? 1 - r : r, oy = cy ? 1 - r : r;          // the arc's centre
    const beyondX = cx ? x > ox : x < ox, beyondY = cy ? y > oy : y < oy;
    if (!beyondX || !beyondY) continue;
    const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy); if (d <= r) continue;
    x = ox + dx / d * r; y = oy + dy / d * r;
  }
  return { x, y };
}
export const effectiveDot = C => clampDot(C, C.dot);

// what the colony makes this eon: capacities from the cells (the square's trade-offs per cell, traits, levels), the triangle's hands against them
export function compute(C) {
  const cap = { industry: 0, food: 0, housing: 0, science: 0, cells: 0, scienceShare: 0, pure: 0 }, perCell = [];
  for (const cell of C.cells) {
    if (!cell.slots.length) { perCell.push(null); continue; }
    const mix = cellMix(cell), e = cellEffect(mix, 0), out = {}; cap.cells++; cap.scienceShare += mix.science; if (cell.slots.length === SLOT.per && new Set(cell.slots).size === 1) cap.pure++;
    for (const f of FACTORS) { out[f] = e[f] * SLOT.per * SLOT.cap[f] * traitMul(cell, f) * (1 + SLOT.levelGain * (C.levels[f] - 1)); cap[f] += out[f]; }
    out.purity = e.purity; out.staffed = e.staffed; perCell.push(out);
  }
  cap.scienceShare = cap.cells ? cap.scienceShare / cap.cells : 0;
  const t = normTri(C.tri), people = C.people;
  const hands = { industry: people * t.industry, research: people * t.research, development: people * t.development };
  const food = cap.food, eat = people, fed = eat > 0 ? Math.min(1, food / eat) : 1, hungry = 1 - DISTRICT.hunger * (1 - fed);
  const empI = employed(hands.industry, cap.industry), empS = employed(hands.research, cap.science);
  const industry = empI * hungry, science = empS * hungry, housing = SLOT.base + cap.housing;
  const dev = hands.development * DEV.perM * hungry;
  const staffed = { industry: cap.industry > 0 ? Math.min(1, hands.industry / cap.industry) : 1, science: cap.science > 0 ? Math.min(1, hands.research / cap.science) : 1 };
  const growth = GROW.rate * Math.max(-1, 1 - people / Math.max(1, housing)) * fed * (1 + GROW.health * cap.scienceShare);
  // the fillet's targets: what each corner can still support
  const want = { industry: staffed.industry, science: staffed.science, housing: fed * Math.min(1, people * FILLET.empty / Math.max(1, housing)), food: food > 0 ? Math.min(1, eat / food) : 1 };
  // what the colony is SHORT of (never retrained away, whatever the dot says): food under the mouths, homes under the people, hands past the works
  const short = { food: food < eat, housing: housing < people, industry: hands.industry > cap.industry, science: hands.research > cap.science };
  return { cap, perCell, hands, food, eat, fed, hungry, industry, science, housing, dev, staffed, growth, want, short, weights: weightsOf(effectiveDot(C)), counts: counts(C) };
}
export const normTri = tri => { const s = TRI.reduce((a, k) => a + Math.max(0, tri[k] || 0), 0) || 1; return Object.fromEntries(TRI.map(k => [k, Math.max(0, tri[k] || 0) / s])); };

// the next slot's kind: the corner furthest under its target share (a corner at zero never builds)
export function nextKind(C, weights = compute(C).weights) {
  const n = counts(C); let best = null, bs = -Infinity;
  for (const k of FACTORS) { if (weights[k] <= 0.001) continue; const s = weights[k] * (n.total + 1) - n[k]; if (s > bs) { bs = s; best = k; } }
  return best;
}
// where it goes: a cell planned for this kind, a suiting trait, the cell being filled, the settlement's frontier — the best score wins;
// a planned cell takes nothing else; a planned cell off the frontier is a new seed (his call: a second settlement, they weld later)
export function nextCell(C, kind) {
  const started = new Set(C.cells.map((c, i) => c.slots.length ? i : -1).filter(i => i >= 0));
  const frontier4 = new Set(), frontier8 = new Set();
  for (const i of started) { for (const j of neighbours(C, i, 4)) if (!started.has(j)) frontier4.add(j); for (const j of neighbours(C, i, 8)) if (!started.has(j)) frontier8.add(j); }
  const [lx, ly] = xy(C, C.landing); let best = -1, bs = -Infinity;
  C.cells.forEach((cell, i) => {
    if (cell.slots.length >= SLOT.per) return;
    if (cell.plan && !cell.plan.includes(kind)) return;                           // planned for something else: not here
    const planned = cell.plan && cell.plan.includes(kind), onFrontier = started.has(i) || frontier8.has(i);
    if (!planned && !onFrontier) return;                                          // only the settlement grows, unless planned
    const [x, y] = xy(C, i), far = Math.hypot(x - lx, y - ly);
    const s = (planned ? 10 : 0) + (TRAITS[cell.trait] === kind ? 3 : 0) + (started.has(i) ? 2 : 0) + (frontier4.has(i) ? 1 : 0) - far * 0.1 - (TRAITS[cell.trait] && TRAITS[cell.trait] !== kind && !cell.slots.length ? 1 : 0);
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}
// a full planet: a slot of the kind furthest OVER its target turns into the kind furthest under (DEV.retrain points)
export function retrainPick(C, weights, short = compute(C).short) {
  const n = counts(C); let over = null, os = -Infinity;
  for (const k of FACTORS) { if (short[k]) continue; const s = n[k] - weights[k] * n.total; if (s > os) { os = s; over = k; } }
  const to = nextKind(C, weights); if (!over || !to || over === to || os < 1) return null;
  let cell = -1, cs = -Infinity;
  C.cells.forEach((c, i) => { const has = c.slots.filter(k => k === over).length; if (!has) return; if (c.plan && !c.plan.includes(to)) return; const s = (c.plan && c.plan.includes(to) ? 10 : 0) + (TRAITS[c.trait] === to ? 3 : 0) + has; if (s > cs) { cs = s; cell = i; } });
  return cell < 0 ? null : { cell, from: over, to };
}
// ONE EON: outputs, the builders' points buy slots, the people grow, the fillet creeps
export function endEon(C) {
  const r = compute(C), log = [];
  C.progress += r.dev;
  let built = 0, full = C.cells.every(c => c.slots.length >= SLOT.per);
  while (built < DEV.maxPerEon) {
    const w = weightsOf(effectiveDot(C));
    if (!full) {
      if (C.progress < DEV.cost) break;
      const kind = nextKind(C, w); if (!kind) break;
      const i = nextCell(C, kind); if (i < 0) break;
      C.cells[i].slots.push(kind); C.progress -= DEV.cost; built++; log.push({ kind: 'slot', cell: i, slot: kind });
      full = C.cells.every(c => c.slots.length >= SLOT.per);
    } else {
      if (C.progress < DEV.retrain) break;
      const p = retrainPick(C, w, r.short); if (!p) { C.progress = Math.min(C.progress, DEV.retrain); break; }   // nothing to retrain: the points are not hoarded
      const s = C.cells[p.cell].slots; s[s.indexOf(p.from)] = p.to; C.progress -= DEV.retrain; built++; log.push({ kind: 'retrain', cell: p.cell, from: p.from, to: p.to });
    }
  }
  // the people: growth to the room, crowding past it, hunger
  let people = C.people * (1 + r.growth);
  if (people > r.housing) people -= (people - r.housing) * GROW.crowd;
  if (r.fed < 1) people -= people * GROW.starve * (1 - r.fed);
  C.people = Math.max(1, people);
  // the fillet creeps toward what the corners can support
  for (const k of FACTORS) { const want = Math.max(0, Math.min(1, r.want[k])), d = want - C.sup[k]; C.sup[k] += Math.max(-FILLET.step, Math.min(FILLET.step, d)); }
  C.eon++; C.last = compute(C); C.log = log; return r;
}
// the next slot's cell, for the map (where the cranes are)
export const building = C => { const k = nextKind(C); if (!k) return null; const full = C.cells.every(c => c.slots.length >= SLOT.per); if (full) { const p = retrainPick(C, weightsOf(effectiveDot(C))); return p ? { cell: p.cell, kind: p.to, retrain: p.from } : null; } const i = nextCell(C, k); return i < 0 ? null : { cell: i, kind: k }; };
// why a corner is rounded, in words (the UI's hover)
export function filletWhy(C, kind, r = C.last || compute(C)) {
  const pct = v => Math.round(v * 100) + ' %';
  if (C.sup[kind] >= 0.97) return `${KIND_WORD[kind]}: the corner is open`;
  if (kind === 'industry') return `industry: ${pct(1 - r.staffed.industry)} of the works stand idle — no hands`;
  if (kind === 'science') return `science: ${pct(1 - r.staffed.science)} of the labs stand idle — no hands`;
  if (kind === 'housing') return r.fed < 1 ? `housing: hungry — food feeds ${pct(r.fed)} of the people` : `housing: homes for ${Math.round(r.housing)} M, people ${Math.round(C.people)} M — empty homes`;
  return `food: ${Math.round(r.food - r.eat)} M more fed than eat here — a surplus (nothing to ship it to yet)`;
}
export const snapshot = C => JSON.parse(JSON.stringify(C));
