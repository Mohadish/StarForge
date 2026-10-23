// DISTRICTS (his design, 2026-10-18; reworked the same day into SLOTS — colony.js): a landable world is a GRID whose size is the world's
// SIZE alone (a huge ice world, a tiny barren one — size and kind are independent); every cell holds four slots of four kinds on a
// square — INDUSTRY, FOOD, HOUSING, SCIENCE — that pull against each other inside the cell (four neighbours' trade-offs and two
// diagonals, all data in COUPLE). This file keeps what the cells share: the sizes, the habitability, the square (cellEffect), and the
// capacity rule (pops past a capacity work at IDLE). A pure cell yields the most and is hit hardest by a focus shock. No DOM.
export const FACTORS = ['industry', 'food', 'housing', 'science'];
export const FACTOR_COLOR = { industry: '#ffb347', food: '#7ef3b0', housing: '#f5a3c7', science: '#4fa3ff' };   // his palette (2026-10-18): industry orange, food green, housing pink (as development), science blue
// the SIZE LADDER (his call, 2026-10-18: "all sorts of sizes, gradually"): every grid from 2 × 2 up to the huge world's 6 × 3, always
// wider than tall, smallest to largest by cells — the huge one is the FRAME every planet pop-up draws, a smaller world sits centred in it
export const SIZES = {
  '2x2': { name: 'tiny', w: 2, h: 2 }, '3x2': { name: 'small', w: 3, h: 2 }, '4x2': { name: 'small', w: 4, h: 2 }, '3x3': { name: 'medium', w: 3, h: 3 }, '5x2': { name: 'medium', w: 5, h: 2 },
  '4x3': { name: 'large', w: 4, h: 3 }, '5x3': { name: 'very large', w: 5, h: 3 }, '6x3': { name: 'huge', w: 6, h: 3 },
};   // no 6 × 2: the same cells as 4 × 3 and it looks worse (his call)
export const SIZE_ORDER = Object.keys(SIZES), LARGEST = SIZES['6x3'];
const SIZE_ALIAS = { vs: '2x2', s: '3x2', m: '4x2', l: '5x3', xl: '6x3' };   // the five classes before the ladder (a saved sizeClass, tools' arguments)
export const sizeKey = k => SIZE_ALIAS[k] || k;
const SIZE_WEIGHTS = [['2x2', 8], ['3x2', 12], ['4x2', 14], ['3x3', 14], ['5x2', 13], ['4x3', 16], ['5x3', 13], ['6x3', 10]], MOON_WEIGHTS = [['2x2', 50], ['3x2', 35], ['4x2', 15]];
export const DISTRICT = {
  idle: 0.5,           // what a pop past its factor's capacity still does
  shock: 0.6,          // a pure district loses this much of its output at a full focus shock (× purity)
  // the SQUARE (his pairings, 2026-10-18): output `a` × (1 + k × share of `b`) — a negative k cuts, a positive one helps. The four
  // neighbours fight: industry→food (smoke kills yields), food→housing (fields take the land), housing→science (education spreads
  // thin over a crowd), science→industry (the learned will not work the works). The two diagonals are GOOD pairings: housing→industry
  // (hands), science→food (better yields) — so housing + industry and science + food districts work well together
  couple: { industry: { science: -0.5, housing: 0.3 }, food: { industry: -0.5, science: 0.3 }, housing: { food: -0.5 }, science: { housing: -0.5 } },
  // nobody, nothing: a district with no housing of its own is poorly staffed — its industry, food and science run at `floor` until
  // its housing share reaches `need` (people do everything)
  staff: { need: 0.25, floor: 0.4 },
  hunger: 0.4,         // a hungry planet (food short of what it eats) loses up to this much of its industry and research
  health: 0.3,         // growth gains up to this much from science across the districts (food and health)
};
const hashOf = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pickW = (r, pairs) => { const tot = pairs.reduce((a, p) => a + p[1], 0); let x = r * tot; for (const [k, w] of pairs) { if ((x -= w) <= 0) return k; } return pairs[pairs.length - 1][0]; };
// the size class of a world: rolled from its id (so every galaxy already made keeps its stars and places), the homeworld huge
export function sizeClassOf(pl) {
  if (pl.sizeClass) return sizeKey(pl.sizeClass);
  if (pl.id === 'home') return '6x3';
  const r = (hashOf(pl.id + '|size') % 10000) / 10000;
  return pickW(r, pl.kind === 'moon' ? MOON_WEIGHTS : SIZE_WEIGHTS);
}
export const gridOf = pl => pl.landable ? SIZES[sizeClassOf(pl)] : null;
// HABITABILITY (his list, 2026-10-18; data now, mechanics later): atmosphere (any atmosphere shields from radiation, even a foul one),
// water (ice or liquid is water), organics, and the temperature — from the world's kind, the rest rolled from its id
const WORLD_BY_COLOR = { '#5fc48a': 'living', '#4fa3ff': 'ocean', '#bfe6ff': 'ice' };
export function habitabilityOf(pl) {
  if (pl.hab) return pl.hab;
  const w = WORLD_BY_COLOR[pl.color] || (pl.kind === 'moon' ? 'moon' : /hot/.test(pl.note || '') ? 'hot' : 'other'), r = i => (hashOf(pl.id + '|hab' + i) % 1000) / 1000;
  const pick = (a, b, p) => r(1) < p ? a : b;
  if (w === 'living') return { atmosphere: 'thick', water: 'liquid', organics: true, temp: 'mild' };
  if (w === 'ocean') return { atmosphere: 'thick', water: 'liquid', organics: r(2) < 0.7, temp: pick('mild', 'cold', 0.6) };
  if (w === 'ice') return { atmosphere: pick('thin', 'none', 0.6), water: 'ice', organics: r(2) < 0.15, temp: 'cold' };
  if (w === 'hot') return { atmosphere: pick('toxic', 'thin', 0.5), water: 'none', organics: false, temp: 'hot' };
  if (w === 'moon') return { atmosphere: pick('thin', 'none', 0.2), water: pl.water != null ? (pl.water ? 'ice' : 'none') : (r(3) < 0.4 ? 'ice' : 'none'), organics: false, temp: pick('cold', 'mild', 0.7) };
  return { atmosphere: pick('thin', 'none', 0.35), water: r(2) < 0.1 ? 'ice' : 'none', organics: false, temp: pick('cold', 'mild', 0.5) };   // barren
}
// CLIMATE (his call, 2026-10-23): a world's COLD, HEAT and RADIATION (no air to stop it; a thin one lets half through) cut what its
// farms give — each by its share, multiplied; research ADAPTS the crops (S.adapt: 0 none … 1 fully adapted, research.js)
export const CLIMATE = { cold: 0.3, heat: 0.3, radiation: 0.35, thinAir: 0.5 };
export function hazardsOf(pl) {
  const h = habitabilityOf(pl), out = {};
  if (h.temp === 'cold') out.cold = CLIMATE.cold; if (h.temp === 'hot') out.heat = CLIMATE.heat;
  if (h.atmosphere === 'none') out.radiation = CLIMATE.radiation; else if (h.atmosphere === 'thin') out.radiation = CLIMATE.radiation * CLIMATE.thinAir;
  return out;
}
// what the farms of a world give for its climate, after the crops' adaptation: { mul, parts: [{ hazard, base, adapt, cut }] }
export function farmClimate(pl, adapt = {}) {
  let mul = 1; const parts = [];
  for (const [hazard, base] of Object.entries(hazardsOf(pl))) { const a = Math.max(0, Math.min(1, adapt[hazard] || 0)), cut = base * (1 - a); mul *= 1 - cut; parts.push({ hazard, base, adapt: a, cut }); }
  return { mul, parts };
}
export const habWord = h => `${h.atmosphere === 'none' ? 'no atmosphere' : h.atmosphere + ' atmosphere'} · ${h.water === 'none' ? 'no water' : h.water === 'ice' ? 'water as ice' : 'liquid water'} · ${h.organics ? 'organics' : 'no organics'} · ${h.temp}`;
// a cell's effective shares after the square's trade-offs and the focus shock (0–1 of a full cell each)
export function cellEffect(mix, shock = 0) {
  const c = DISTRICT.couple, m = mix, out = {}, staffed = DISTRICT.staff.floor + (1 - DISTRICT.staff.floor) * Math.min(1, (m.housing || 0) / DISTRICT.staff.need);
  for (const f of FACTORS) { let v = m[f] || 0; for (const [g, k] of Object.entries(c[f] || {})) v *= Math.max(0, 1 + k * (m[g] || 0)); if (f !== 'housing') v *= staffed; out[f] = v; }
  const purity = Math.max(0, (Math.max(...FACTORS.map(f => m[f] || 0)) - 0.25) / 0.75), cut = 1 - DISTRICT.shock * purity * Math.max(0, Math.min(1, shock));
  for (const f of FACTORS) out[f] *= cut;
  out.purity = purity; out.staffed = staffed; return out;
}
// pops at work against a capacity: the ones within it count whole, the rest at IDLE
export const employed = (pops, cap) => Math.min(pops, cap) + Math.max(0, pops - cap) * DISTRICT.idle;
