// DISTRICTS (his design, 2026-10-18): a landable world is a GRID whose size is the world's SIZE class alone (a huge ice world, a tiny
// barren one — size and kind are independent); every cell is a district you develop to a DISTRICT DESIGN = a mix of four factors
// on a square — INDUSTRY, FOOD, HOUSING, SCIENCE — that pull against each other (four neighbours' trade-offs and two diagonals,
// all data in COUPLE). Districts are CAPACITY: how many of the planet's pops each factor can employ or house at full effect;
// the planet's triangle (industry / research / social) stays the EFFORT — who does what. Pops past the capacity work at IDLE.
// A pure district yields the most and is hit hardest by a focus shock (purity × shock). No DOM.
export const FACTORS = ['industry', 'food', 'housing', 'science'];
export const FACTOR_COLOR = { industry: '#ffb347', food: '#7ef3b0', housing: '#4fa3ff', science: '#5fe3d0' };
export const SIZES = { vs: { name: 'very small', w: 2, h: 2 }, s: { name: 'small', w: 3, h: 2 }, m: { name: 'medium', w: 4, h: 2 }, l: { name: 'large', w: 5, h: 3 }, xl: { name: 'huge', w: 6, h: 3 } };   // always wider than tall (his call)
const SIZE_WEIGHTS = [['vs', 20], ['s', 30], ['m', 25], ['l', 15], ['xl', 10]], MOON_WEIGHTS = [['vs', 60], ['s', 40]];
export const DISTRICT = {
  pops: 60,            // M people a full-housing cell houses · pops a full industry / science cell employs · social pops a full food cell gives farms to
  idle: 0.5,           // what a pop past its factor's capacity still does
  cost: 60, upgrade: 30, devShare: 0.5,   // industry to develop a cell, to re-make one; the share of an eon's industry development may take before the build queue
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
// the STARTING district designs: mixed, and one leaning to each factor
export const STARTER_DISTRICTS = [
  { id: 'dist-mixed', name: 'Mixed', mix: { industry: 0.25, food: 0.25, housing: 0.25, science: 0.25 } },
  { id: 'dist-housing', name: 'Housing', mix: { industry: 0, food: 0.3, housing: 0.7, science: 0 } },
  { id: 'dist-farms', name: 'Farms', mix: { industry: 0, food: 0.7, housing: 0.3, science: 0 } },
  { id: 'dist-foundry', name: 'Foundry', mix: { industry: 0.7, food: 0, housing: 0.3, science: 0 } },
  { id: 'dist-campus', name: 'Campus', mix: { industry: 0, food: 0, housing: 0.3, science: 0.7 } },
];
// the homeworld's old city: six cells already developed; a new colony: the landing site, one mixed cell
export const HOME_CELLS = ['dist-housing', 'dist-housing', 'dist-farms', 'dist-foundry', 'dist-campus', 'dist-mixed'];
const hashOf = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pickW = (r, pairs) => { const tot = pairs.reduce((a, p) => a + p[1], 0); let x = r * tot; for (const [k, w] of pairs) { if ((x -= w) <= 0) return k; } return pairs[pairs.length - 1][0]; };
// the size class of a world: rolled from its id (so every galaxy already made keeps its stars and places), the homeworld huge
export function sizeClassOf(pl) {
  if (pl.sizeClass) return pl.sizeClass;
  if (pl.id === 'home') return 'xl';
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
export const habWord = h => `${h.atmosphere === 'none' ? 'no atmosphere' : h.atmosphere + ' atmosphere'} · ${h.water === 'none' ? 'no water' : h.water === 'ice' ? 'water as ice' : 'liquid water'} · ${h.organics ? 'organics' : 'no organics'} · ${h.temp}`;
// a cell's effective shares after the square's trade-offs and the focus shock (0–1 of a full cell each)
export function cellEffect(mix, shock = 0) {
  const c = DISTRICT.couple, m = mix, out = {}, staffed = DISTRICT.staff.floor + (1 - DISTRICT.staff.floor) * Math.min(1, (m.housing || 0) / DISTRICT.staff.need);
  for (const f of FACTORS) { let v = m[f] || 0; for (const [g, k] of Object.entries(c[f] || {})) v *= Math.max(0, 1 + k * (m[g] || 0)); if (f !== 'housing') v *= staffed; out[f] = v; }
  const purity = Math.max(0, (Math.max(...FACTORS.map(f => m[f] || 0)) - 0.25) / 0.75), cut = 1 - DISTRICT.shock * purity * Math.max(0, Math.min(1, shock));
  for (const f of FACTORS) out[f] *= cut;
  out.purity = purity; out.staffed = staffed; return out;
}
// the planet's CAPACITIES from its developed cells (pops per factor)
export function capacities(P, designs, shock = 0) {
  const cap = { industry: 0, food: 0, housing: 0, science: 0, cells: 0, scienceShare: 0 };
  for (const cell of P.cells || []) {
    if (!cell || !cell.design) continue; const d = designs.find(x => x.id === cell.design); if (!d) continue;
    const e = cellEffect(d.mix, shock); cap.cells++; for (const f of FACTORS) cap[f] += e[f] * DISTRICT.pops; cap.scienceShare += d.mix.science || 0;
  }
  cap.scienceShare = cap.cells ? cap.scienceShare / cap.cells : 0;   // science across the districts: health, growth (DISTRICT.health)
  return cap;
}
// pops at work against a capacity: the ones within it count whole, the rest at IDLE
export const employed = (pops, cap) => Math.min(pops, cap) + Math.max(0, pops - cap) * DISTRICT.idle;
export const normMix = mix => { const t = FACTORS.reduce((a, f) => a + Math.max(0, mix[f] || 0), 0) || 1; return Object.fromEntries(FACTORS.map(f => [f, Math.max(0, mix[f] || 0) / t])); };
export const newCells = (grid, starter = []) => { const cells = Array.from({ length: grid ? grid.w * grid.h : 0 }, () => null); starter.forEach((id, i) => { if (i < cells.length) cells[i] = { design: id }; }); return cells; };
