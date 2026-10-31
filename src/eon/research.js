// RESEARCH AS PROJECTS (his design, 2026-10-22/23) — pure, no DOM.
// · WHERE RESEARCH GOES BY ITSELF: no points of attention any more. Every lab splits its research over the nine fields by what its
//   PLACE has to give (the Veil: mostly optics) plus a little of everything; a colony studies its own world half by the world's
//   CHARACTER (works → fabrication and materials, labs → information, farms → life, homes → information and life). A lab ship parked
//   at your own colony studies that colony too.
// · PROJECTS: you say what you want developed — an energy weapon, a shield, better farms… — and how much of the empire's research it
//   takes (its INFLUENCE, %). A project pulls its research through the fields of its RECIPE; what is left flows by itself (and that
//   is where the chance finds come from). How good the result comes out is the STRENGTH of those fields: the places you study,
//   what you have found there, and the recent finds of those fields (BOOSTERS, used up by the project). A field with nothing to learn
//   where you look gives a poor result — you can still push research through it, it just comes out weak.
// · A FINISHED PROJECT is a new generation of its family, built into everything of that kind (a ship family: fully integrated boosts
//   to its channels; a civil one: a level for that kind of district). The roles (capital, point defence, sniper…) stay the designer's.
// · ADVISORS read the empire and suggest what it needs (hungry, crowded, idle hands, ships breaking down, hostile fleets, a new find…).
import { DOMAINS, CHANNEL_X } from '../data/properties.js';
import { counts } from './colony.js';
import { CLIMATE } from './districts.js';
import { traitsFrom, makeup, lookOf, nameFor, traitWords, rareChance, rollRare, rareFx, rareWords, die } from './traits.js';
import { AVENUES, REFINE, BT, AV_NEED, CAPS, hasAvenues, baseAvenue, refineGain, qFactor, gunShares, candidates } from './avenues.js';

export const FIELD_IDS = Object.keys(DOMAINS);
export const FIELD_COL = { materials: '#c9a27a', fabrication: '#ffb347', energy: '#ffd84f', electrics: '#7fd8ff', optics: '#c79bff', thermal: '#ff7a59', motion: '#5fe0b4', life: '#8fd16a', information: '#4fa3ff' };
export const RESEARCH = {
  need: 1500, growth: 1.5,                   // research a family's first generation takes; × growth for every generation after
  strength: { base: 0.55, potential: 0.6, perFind: 0.04, booster: 0.06, boosters: 3 },   // a field's strength for a project; at most 3 finds boost one project
  mag: 10,                                   // % a generation adds to its family's main channel at quality 1 (the other channels by their weight) — an empire-wide boost (sensors)
  modelMag: 20,                              // % a generation of a COMPONENT adds to its main channel at quality 1, on top of the generation before (2026-10-24)
  level: { base: 0.4, q: 0.6 },              // a civil generation raises its kind's level by base + q × quality (a level = +25 % output)
  adapt: { base: 0.25, q: 0.25 },            // a climate generation adapts the crops by base + q × quality (of 1: fully adapted, the hazard gone)
  profileBase: 0.03,                         // every field has something to learn wherever you look
  selfStudy: 0.5,                            // a colony studies its own world this much by its character
  lucky: { after: 70, span: 30 },            // no find for 70 eons: a lucky break grows likelier every eon, certain by 100 (his call: "people want things to happen")
};
// what each kind of district makes a world worth studying for
const CHARACTER = { industry: { fabrication: 0.6, materials: 0.4 }, science: { information: 0.5, electrics: 0.3, energy: 0.2 }, food: { life: 1 }, housing: { information: 0.6, life: 0.4 } };
// THE FAMILIES (his tree, 2026-10-23: categories, then the things themselves) — the RECIPE: the share of research each field carries;
// what a generation improves: CHANNELS (properties.js, every module of that kind gets them) or a district LEVEL
export const CATEGORIES = [
  { id: 'military', name: 'Military', fams: ['beam', 'gun', 'missile', 'drones', 'armor'] },
  { id: 'energy', name: 'Energy', fams: ['shield', 'reactor', 'fab'] },
  { id: 'propulsion', name: 'Propulsion', fams: ['drive', 'thruster'] },
  { id: 'information', name: 'Information', fams: ['computer', 'sensors'] },
  { id: 'civil', name: 'Civil', fams: ['farms', 'homes', 'works', 'labs'] },   // the climate's crops are avenues of the farms now (avenues.js, 2026-10-31)
];
export const FAMILIES = {
  beam:     { module: 'weapon_energy', name: 'Energy weapon',    icon: '⚡', base: 'Lance',   recipe: { energy: 0.4, optics: 0.35, thermal: 0.25 }, channels: { beam_power: 1, weapon_range: 0.6, rate_of_fire: 0.6 } },
  gun:      { module: 'weapon_kinetic', name: 'Kinetic gun',      icon: '⦿', base: 'Driver',  recipe: { materials: 0.35, fabrication: 0.35, motion: 0.3 }, channels: { kinetic_penetration: 1, accuracy: 0.6, rate_of_fire: 0.6 } },
  missile:  { module: 'weapon_missile', name: 'Missile',          icon: '➹', base: 'Viper',   recipe: { fabrication: 0.35, materials: 0.25, life: 0.2, motion: 0.2 }, channels: { warhead_yield: 1, weapon_range: 0.6, targeting: 0.4 } },
  drones:   { module: 'hangar', name: 'Drones',           icon: '✈', base: 'Wasp',    recipe: { information: 0.4, motion: 0.3, fabrication: 0.3 }, channels: { structural_scale: 1, power_efficiency: 0.4 } },
  armor:    { module: 'armor', name: 'Armour',           icon: '⛨', base: 'Plate',   recipe: { materials: 0.45, fabrication: 0.35, thermal: 0.2 }, channels: { armor_integrity: 1, armor_deflection: 0.6, hull_integrity: 0.4 } },
  shield:   { module: 'shield', name: 'Shield',           icon: '◎', base: 'Aegis',   recipe: { motion: 0.4, energy: 0.25, electrics: 0.2, fabrication: 0.15 }, channels: { shield_capacity: 1, shield_recovery: 0.6, shield_reach: 0.4 } },
  reactor:  { module: 'reactor', name: 'Reactor',          icon: '☢', base: 'Heart',   recipe: { energy: 0.5, thermal: 0.3, materials: 0.2 }, channels: { reactor_output: 1, energy_storage: 0.6, power_efficiency: 0.4 } },
  drive:    { module: 'stardrive', name: 'Star drive',       icon: '➶', base: 'Strider', recipe: { motion: 0.4, energy: 0.35, thermal: 0.25 }, channels: { drive_efficiency: 1, thrust: 0.4 } },
  thruster: { module: 'thruster', name: 'Thrusters',        icon: '⇶', base: 'Swift',   recipe: { motion: 0.5, fabrication: 0.25, electrics: 0.25 }, channels: { thrust: 1, agility: 0.6, evasion: 0.4 } },
  computer: { module: 'weapon_system', name: 'Weapons computer', icon: '▣', base: 'Oracle',  recipe: { electrics: 0.4, information: 0.4, optics: 0.2 }, channels: { targeting: 1, computing: 0.6, synthetic_neural: 0.4 } },
  fab:      { module: 'works', name: 'Fabricator',       icon: '⚒', base: 'Forge',   recipe: { fabrication: 0.5, materials: 0.25, energy: 0.25 }, channels: { manufacturing: 1, labor_efficiency: 0.6, power_efficiency: 0.4 } },   // the ship's fabricator (his call, 2026-10-30) — the WORKS family is the colony's districts
  sensors:  { name: 'Sensors',          icon: '◉', base: 'Argus',   recipe: { optics: 0.45, information: 0.35, electrics: 0.2 }, channels: { sensor_range: 1, sensor_resolution: 0.6 } },
  farms:    { name: 'Farms',            icon: '🌾', base: 'Harvest', recipe: { life: 0.6, thermal: 0.2, materials: 0.2 }, level: 'food' },
  // THE CLIMATE'S CROPS (his call 2026-10-23) were families of their own (farms_cold / _hot / _rad); since 2026-10-31 they are the farms'
  // tier-2 AVENUES (avenues.js) — an older game's generations move there (ensureAvenues)
  homes:    { name: 'Homes',            icon: '⌂', base: 'Hearth',  recipe: { materials: 0.4, life: 0.3, information: 0.3 }, level: 'housing' },
  works:    { name: 'Works',            icon: '⚙', base: 'Foundry', recipe: { fabrication: 0.5, electrics: 0.3, materials: 0.2 }, level: 'industry' },
  labs:     { name: 'Labs',             icon: '🔬', base: 'Lyceum',  recipe: { information: 0.5, electrics: 0.3, optics: 0.2 }, level: 'science' },
};
// THE WRITTEN DESCRIPTION (his ask, 2026-10-23: "a little paragraph — wherever there is a value, an icon, so you can read it or just
// look at the icons"): per family a few openings, one per generation in turn; {0} {1} {2} are its benefits in the order of its
// channels (the main one first) — the UI puts the icon and the number there. CHANNEL_ICON: which icon (techicons.js) a channel shows
const T3 = (...t) => t;
const TEXT = {
  beam:     T3('Tighter focusing coils and a cooler lens: the new emitter hits {0} harder, reaches {1} further and fires {2} faster.', 'A second resonance chamber feeds the beam: {0} more punch, {1} more reach, and the capacitors refill {2} quicker.', 'Phase-locked emitters fire as one: {0} damage, {1} range, {2} rate of fire.'),
  gun:      T3('Denser slugs and a longer rail: shells bite {0} deeper, land {1} truer and cycle {2} faster.', 'A recoil-damped breech: {0} more penetration, {1} tighter groups, {2} quicker reloads.', 'Self-forging rounds: {0} penetration, {1} accuracy, {2} rate of fire.'),
  drones:   T3('Smarter hulls on the little craft: every drone of this kind is {0} bigger and draws {1} less.', 'Longer-legged drones: {0} size, {1} less power.', 'A swarm that thinks: {0} size, {1} efficiency.'),
  missile:  T3('A richer charge and a leaner motor: warheads hit {0} harder, fly {1} further, and the seeker locks {2} better.', 'Staged boosters and a shaped charge: {0} yield, {1} reach, {2} sharper terminal guidance.', 'A smarter swarm: {0} yield, {1} range, {2} lock.'),
  armor:    T3('Layered plate with a soft core: armour holds {0} more, shrugs off {1} more of every hit, and the frame behind it is {2} tougher.', 'Graded alloys from skin to spine: {0} plate strength, {1} deflection, {2} hull.', 'Plates that spread a blow across the hull: {0} integrity, {1} deflection, {2} frame.'),
  shield:   T3('A tighter field lattice: shields hold {0} more, recover {1} faster and stretch {2} further over the hull.', 'Overlapping emitters: {0} capacity, {1} recovery, {2} reach.', 'A field that hardens where it is struck: {0} capacity, {1} recovery, {2} coverage.'),
  reactor:  T3('Hotter, cleaner burns: reactors give {0} more power, store {1} more, and everything aboard draws {2} less.', 'A denser core: {0} output, {1} reserve, {2} efficiency.', 'Magnetic bottling: {0} output, {1} storage, {2} less draw.'),
  drive:    T3('A smoother fold in the star drive: a ship with it crosses {0} faster between the stars and pushes {1} harder in battle.', 'A lighter drive core: {0} between the stars, {1} thrust.', 'A drive that drinks less: {0} star travel, {1} thrust.'),
  thruster: T3('Vectored nozzles: ships push {0} harder, turn {1} sharper and slip {2} more of the fire.', 'Pulse thrusters: {0} thrust, {1} agility, {2} evasion.', 'Thrust where it is needed: {0} thrust, {1} turn, {2} evasion.'),
  computer: T3('Faster fire control: guns pick their aim {0} better, the computer runs {1} more, and decides {2} more by itself.', 'Predictive tracking: {0} targeting, {1} computing, {2} autonomy.', 'A mind in the turret: {0} targeting, {1} computing, {2} autonomy.'),
  fab:      T3('Finer feed heads and a cleaner furnace: the fabricator turns out {0} more, wastes {1} less work and draws {2} less.', 'A fabricator that sorts its own scrap: {0} output, {1} less waste, {2} less power.', 'Assemblers small enough to reach inside a seam: {0} output, {1} efficiency, {2} less draw.'),
  sensors:  T3('Wider apertures and a cleaner signal: you see {0} further and {1} sharper.', 'Arrays that listen across the bands: {0} range, {1} resolution.', 'Quiet sensors: {0} range, {1} resolution.'),
  farms:    T3('New strains and closed soil cycles: every farm district feeds {0} more.', 'Layered fields under light: every farm district feeds {0} more.', 'Crops bred for the world they stand on: every farm district feeds {0} more.'),
  homes:    T3('Lighter frames and shared walls: every home district houses {0} more.', 'Towers that breathe: every home district houses {0} more.', 'Homes grown, not built: every home district houses {0} more.'),
  works:    T3('Better tooling on the lines: every works district turns out {0} more.', 'Lines that run themselves through the night: every works district turns out {0} more.', 'Machines that build machines: every works district turns out {0} more.'),
  farms_cold: T3('Frost-hardy strains and heated soil: farms on cold worlds feed {0} more.', 'Crops that sleep through the frost and wake with the light: farms on cold worlds feed {0} more.', 'Greenhouses that keep their own summer: farms on cold worlds feed {0} more.'),
  farms_hot:  T3('Deep-rooted, waxy-leaved strains: farms on hot worlds feed {0} more.', 'Shade lattices and night harvests: farms on hot worlds feed {0} more.', 'Crops that drink the heat: farms on hot worlds feed {0} more.'),
  farms_rad:  T3('Buried fields under a shield of rock and water: farms under open radiation feed {0} more.', 'Strains that mend their own seeds: farms under hard radiation feed {0} more.', 'A field lattice that turns the radiation aside: farms under open radiation feed {0} more.'),
  labs:     T3('Shared instruments and quicker methods: every lab district studies {0} more.', 'Labs that talk to each other: every lab district studies {0} more.', 'Thinking machines in every lab: every lab district studies {0} more.'),
};
export const CHANNEL_ICON = { beam_power: 'damage', kinetic_penetration: 'pierce', warhead_yield: 'damage', weapon_range: 'range', rate_of_fire: 'rate', accuracy: 'accuracy', targeting: 'accuracy',
  armor_integrity: 'armor', armor_deflection: 'armor', hull_integrity: 'hull', shield_capacity: 'shield', shield_recovery: 'recovery', shield_reach: 'shield',
  reactor_output: 'power', energy_storage: 'storage', power_efficiency: 'power', drive_efficiency: 'reach', thrust: 'speed', agility: 'evasion', evasion: 'evasion',
  computing: 'computing', synthetic_neural: 'computing', manufacturing: 'works', labor_efficiency: 'works', sensor_range: 'sensors', sensor_resolution: 'sensors', food: 'food', housing: 'homes', industry: 'works', science: 'labs',
  cold: 'cold', heat: 'heat', radiation: 'radiation', affordability: 'cost' };
// THE FOCUS AND THE PROJECTS (his call, 2026-10-23 — the sweep: the focus bent the chance finds but never the projects). A family's
// AFFINITY: how much its channels lean the focus's way (a civil family by the channel it stands for — farms food yield, homes
// habitability, works manufacturing, labs computing); the advisors favour it by that. And every finished project brings the FOCUS GIFT:
// a boost in each corner's own direction, by how much the focus leans there — cheaper to build, less power drawn, sensors that reach
// further, a truer aim (never instead of what you asked for; only with it)
const XS4 = ['expand', 'exploit', 'explore', 'exterminate'];
const STANDS_FOR = { farms: { food_yield: 1 }, farms_cold: { food_yield: 1 }, farms_hot: { food_yield: 1 }, farms_rad: { food_yield: 1 }, homes: { habitability: 1 }, works: { manufacturing: 1 }, labs: { computing: 1 } };
export function focusAffinity(S, fam) {
  const F = FAMILIES[fam], ch = F.channels || STANDS_FOR[fam] || {}; let a = 0, t = 0;
  for (const [c, w] of Object.entries(ch)) { const i = XS4.indexOf(CHANNEL_X[c]); if (i < 0) continue; a += w * ((S.focus || [])[i] ?? 0.25); t += w; }
  return t ? a / t : 0.25;
}
export const GIFT = { pct: 12, min: 2, ch: { expand: 'affordability', exploit: 'power_efficiency', explore: 'sensor_range', exterminate: 'accuracy' }, word: { affordability: 'cheaper to build', power_efficiency: 'less power drawn', sensor_range: 'sensors reach further', accuracy: 'a truer aim' } };
export function giftOf(S) { return XS4.map((x, i) => ({ x, channel: GIFT.ch[x], icon: CHANNEL_ICON[GIFT.ch[x]] || 'power', word: GIFT.word[GIFT.ch[x]], pct: Math.round(GIFT.pct * ((S.focus || [])[i] ?? 0.25)) })).filter(g => g.pct >= GIFT.min).sort((a, b) => b.pct - a.pct); }
// how much more a world under this hazard would farm if the crops' adaptation went from a to a2 (a full hazard)
export const adaptGain = (hazard, a, a2) => { const p = CLIMATE[hazard] || 0; return (1 - p * (1 - Math.min(1, a2))) / Math.max(1e-6, 1 - p * (1 - Math.min(1, a))) - 1; };
// what a generation would give, with the fields as they are: [{ channel, icon, pct }] in the family's order (the main one first)
export function benefitsOf(S, fields, fam, q = null) {
  const F = FAMILIES[fam]; if (q == null) q = qualityOf(S, fields, fam).q;
  if (F.level) return [{ channel: F.level, icon: CHANNEL_ICON[F.level], pct: Math.round((RESEARCH.level.base + RESEARCH.level.q * q) * 25) }];
  if (F.adapt) { const a = (S.adapt || {})[F.adapt] || 0, a2 = a + RESEARCH.adapt.base + RESEARCH.adapt.q * q; return [{ channel: F.adapt, icon: 'food', icon2: CHANNEL_ICON[F.adapt], pct: Math.max(1, Math.round(adaptGain(F.adapt, a, a2) * 100)) }]; }
  return Object.entries(F.channels).map(([channel, w]) => ({ channel, icon: CHANNEL_ICON[channel], pct: Math.max(1, Math.round((F.module ? RESEARCH.modelMag : RESEARCH.mag) * w * q)) }));
}
// the paragraph's text for a generation: the template with {i} still in it (the UI fills them)
export const textOf = (fam, gen) => { const t = TEXT[fam] || ['{0}']; return t[(Math.max(1, gen) - 1) % t.length]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const roman = n => { let s = '', v = Math.max(1, Math.floor(n)); for (const [a, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (v >= a) { s += r; v -= a; } return s; };
export const generationOf = (S, fam) => ((S.gens || {})[fam] || 0) + 1;
// THE COMPONENTS (2026-10-24): every model of a module kind the empire has developed, the newest last — of an AVENUE's models only its
// newest refinement (his ask, 2026-10-31: "they stack on each other as the same weapon's variant — less clutter"); the older ones stay
// in S.models for the designs and ships built with them
export const modelsOf = (S, kind) => { const l = (S.models || []).filter(m => m.kind === kind), last = new Map(); for (const m of l) if (m.av) last.set(m.fam + ':' + m.av, m); return l.filter(m => !m.av || last.get(m.fam + ':' + m.av) === m); };
export const newestModel = (S, kind) => { const l = modelsOf(S, kind); return l.length ? l[l.length - 1] : null; };
export const cheapOf = S => 1 - Math.min(CAPS.cheap, S.projCheap || 0);   // Simulation Labs (avenues.js): every project costs less research
export const needOf = (S, fam) => Math.round(RESEARCH.need * Math.pow(RESEARCH.growth, generationOf(S, fam) - 1) * cheapOf(S));
// a component's project has no name yet — the name comes with what it turns out to be (traits.js nameFor)
export const nameOf = (S, fam) => { const F = FAMILIES[fam], g = generationOf(S, fam); return F.module ? `A new ${F.name.toLowerCase()}` : `${F.base} Mk ${roman(g)}`; };
// WHAT WE EXPECT of a component under way (or one you might start): its traits from the fields as they fed it so far (p.feed), else as
// they are — the words, not the numbers; the physical form stays unknown until it is done
// THE SAME AGAIN: a component of the same character you already have (the same main trait and the same touch) — the same research makes
// the same thing (his quest: to get something different, study other fields)
export function sameAs(S, fam, traits) { const key = ts => ts.map(t => t.id).join('+'), k = key(traits); return k ? (S.models || []).find(m => m.fam === fam && m.traits && key(m.traits) === k) || null : null; }
export function expectOf(S, fields, fam, p = null) { const { q, ch } = qualityOf(S, fields, fam); return { q, traits: traitsFrom(fam, ch, p && p.feed, p && p.fed).map(t => ({ ...t, ...traitWords(fam, t) })), rare: rareChance(fam, ch, p && p.feed, p && p.fed) }; }   // rare: the chance of something extraordinary (the forecast says how likely, never what)
export const strengthOf = (potential, found, boosts = 0) => { const M = RESEARCH.strength; return M.base + M.potential * potential + M.perFind * Math.min(10, found) + M.booster * boosts; };

// a place's research split over the fields: what it has to give, plus a little of everything
export function placeProfile(pl) {
  const w = FIELD_IDS.map(f => RESEARCH.profileBase + (pl.mult?.[f] || 0) * (pl.fresh?.[f] ?? 1)), t = w.reduce((a, v) => a + v, 0) || 1;
  return Object.fromEntries(FIELD_IDS.map((f, i) => [f, w[i] / t]));
}
// a colony's own character: its districts, kind by kind
export function characterOf(G) {
  const out = Object.fromEntries(FIELD_IDS.map(f => [f, 0])); if (!G) return null; const n = counts(G); if (!n.total) return null;
  for (const k of Object.keys(CHARACTER)) for (const [f, w] of Object.entries(CHARACTER[k])) out[f] += w * n[k] / n.total;
  return out;
}
// WHERE THE RESEARCH GOES BY ITSELF: per field the research, and who sends it
export function naturalFlows(S, colonies, ships) {
  const by = Object.fromEntries(FIELD_IDS.map(f => [f, 0])), from = Object.fromEntries(FIELD_IDS.map(f => [f, []])), colAt = new Map(colonies.map(p => [p.pl.id, p]));
  const pour = (r, pl, G, label) => { if (!(r > 0) || !pl) return; const P = placeProfile(pl), C = G ? characterOf(G) : null, s = C ? RESEARCH.selfStudy : 0;
    for (const f of FIELD_IDS) { const v = r * ((1 - s) * P[f] + s * (C ? C[f] : 0)); if (v <= 1e-9) continue; by[f] += v; from[f].push({ label, v }); } };
  // THE LABS' AVENUES (avenues.js): Field Stations — a lab ship learns more where it parks (S.labShips); the Xenobiology Institute — an
  // anomaly teaches more to whoever studies it (S.xeno)
  const xeno = pl => pl && pl.kind === 'anomaly' ? 1 + (S.xeno || 0) : 1;
  for (const p of colonies) pour(p.research * xeno(p.pl), p.pl, p.G, p.pl.name);
  for (const { u, t } of ships) if (!u.dest && t.research > 0) { const pl = S.places.find(x => x.id === u.at), col = colAt.get(u.at); pour(t.research * (1 + (S.labShips || 0)) * xeno(pl), pl, col ? col.G : null, `${u.name} at ${pl ? pl.name : '?'}`); }
  for (const f of FIELD_IDS) from[f].sort((a, b) => b.v - a.v);
  return { by, from, total: FIELD_IDS.reduce((a, f) => a + by[f], 0) };
}
export const divertedOf = S => clamp((S.projects || []).reduce((a, p) => a + (p.inf || 0), 0) / 100, 0, 1);
// the finds a project would use as boosters: the newest ones of its recipe's fields nobody has used yet
export function boostersFor(S, fam) {
  const F = FAMILIES[fam], used = new Set(S.usedBoost || []);
  return S.breakthroughs.filter(b => !b.project && F.recipe[b.field] && !used.has(b.id)).sort((a, b) => (b.eon || 0) - (a.eon || 0)).slice(0, RESEARCH.strength.boosters);
}
// how good a project of this family would come out with the fields as they are (fields: compute()'s, with their potential). av: an
// AVENUE of the family (avenues.js) — its own recipe, and no finds boosting it (his call: the finds stay out of the research)
export function qualityOf(S, fields, fam, av = null) {
  const F = FAMILIES[fam], A = av && AVENUES[fam] ? AVENUES[fam][av] : null, recipe = A ? A.recipe : F.recipe, byId = new Map(fields.map(f => [f.id, f])), boosts = A || hasAvenues(fam) ? [] : boostersFor(S, fam);
  const fb = S.fieldBoost || {};   // the labs' avenues (avenues.js: a collider, gene labs…): a field stronger for every project
  const ch = Object.entries(recipe).map(([id, w]) => { const f = byId.get(id), nb = boosts.filter(b => b.field === id).length; return { id, w, nb, potential: f ? f.potential : 0, found: S.found[id] || 0, strength: strengthOf(f ? f.potential : 0, S.found[id] || 0, nb) + (fb[id] || 0) }; });
  return { q: ch.reduce((a, x) => a + x.w * x.strength, 0), ch, boosts };
}
// ---------------------------------------------------------------- THE AVENUES (avenues.js, his design 2026-10-31, stage 1: farms, guns)
// an older game: its generations of the farms, the climate's crops and the guns become refinements of their avenues; a project on a
// climate family becomes a project on its avenue. Breakthrough gains already in S.slotLevels / S.adapt stay where they are
export function ensureAvenues(S) {
  if (S.avV === 2) return; S.av = S.av || {}; S.offers = S.offers || []; S.refine = S.refine || {}; S.adaptR = S.adaptR || {};
  const g = S.gens || {}, put = (fam, id, n) => { if (!n) return; const h = (S.av[fam] = S.av[fam] || {}); if (!h[id]) h[id] = { n, gain: {}, eon: S.eon, old: true }; };
  if (!S.avV) { put('farms', 'farming', g.farms); put('farms', 'cold', g.farms_cold); put('farms', 'heat', g.farms_hot); put('farms', 'rad', g.farms_rad); put('gun', 'driver', g.gun); }
  put('labs', 'basic', g.labs);   // v2 (2026-10-31): the labs' generations
  const OLD = { farms_cold: 'cold', farms_hot: 'heat', farms_rad: 'rad' };
  for (const p of S.projects || []) { if (OLD[p.fam]) { p.av = OLD[p.fam]; p.fam = 'farms'; } else if (hasAvenues(p.fam) && !p.av) p.av = baseAvenue(p.fam); }
  S.avV = 2;
}
export const heldOf = (S, fam, av) => ((S.av || {})[fam] || {})[av] || null;
// the avenue a project of the family takes when none is named: an offer first (the oldest), else the highest tier held, else the base
export function defaultAv(S, fam) {
  const o = (S.offers || []).find(x => x.fam === fam); if (o) return o.av;
  const held = Object.keys((S.av || {})[fam] || {}).sort((a, b) => AVENUES[fam][b].tier - AVENUES[fam][a].tier); return held[0] || baseAvenue(fam);
}
export const offered = (S, fam, av) => (S.offers || []).some(o => o.fam === fam && o.av === av);
// what it is called: the base avenue by its refinements (Driver III), any other by its name, then II, III… as it is refined
export const avName = (fam, av, n) => { const A = AVENUES[fam][av]; return A.tier === 1 ? `${A.name} ${roman(Math.max(1, n))}` : n <= 1 ? A.name : `${A.name} ${roman(n)}`; };
export const avNeed = (S, fam, av) => { const A = AVENUES[fam][av], h = heldOf(S, fam, av); return Math.round(AV_NEED.base * Math.pow(AV_NEED.tier, A.tier - 1) * (1 + AV_NEED.per * ((h && h.n) || 0)) * cheapOf(S)); };
// is the next research on it a breakthrough (the avenue's first) or a refinement (the r-th, 0 the first)?
export function nextStep(S, fam, av) { const A = AVENUES[fam][av], h = heldOf(S, fam, av), n = (h && h.n) || 0; return A.tier > 1 && !n ? { jump: true, r: 0, n } : { jump: false, r: A.tier === 1 ? n : n - 1, n }; }
// WHAT IT WOULD GIVE (the cards): [{ key, icon, icon2, pct, word }] — a breakthrough its leap, a refinement its share of the small gain
// (a gun's over damage / reach / rate by the fields: strengths { field: strength })
export function avGains(S, fam, av, q, strengths = {}) {
  const A = AVENUES[fam][av], st = nextStep(S, fam, av), k = qFactor(q), out = [], hz = { cold: 'cold', heat: 'heat', radiation: 'radiation' };
  const fieldWord = f => ({ motion: 'fields & motion', life: 'life & chemistry' }[f] || f);
  if (st.jump && A.jump) {
    if (A.jump.food) out.push({ key: 'food', icon: 'food', pct: Math.round(A.jump.food * k), word: 'food from every farm' });
    if (A.jump.science) out.push({ key: 'science', icon: 'labs', pct: Math.round(A.jump.science * k), word: 'research from every lab' });   // the labs (avenues.js)
    if (A.jump.shipsci) out.push({ key: 'shipsci', icon: 'labs', pct: Math.round(A.jump.shipsci * k * 100), word: 'research from lab ships' });
    if (A.jump.bt) out.push({ key: 'bt', icon: 'labs', pct: Math.round(A.jump.bt * k * 100), word: 'chance of breakthroughs' });
    if (A.jump.cheap) out.push({ key: 'cheap', icon: 'cost', pct: Math.round(A.jump.cheap * k * 100), word: 'less research for every project' });
    if (A.jump.xeno) out.push({ key: 'xeno', icon: 'labs', pct: Math.round(A.jump.xeno * k * 100), word: 'research from anomalies' });
    for (const [f, v] of Object.entries(A.jump.fields || {})) out.push({ key: 'field:' + f, icon: 'computing', pct: Math.round(v * k * 100), word: `${fieldWord(f)} stronger` });
    for (const [h, v] of Object.entries(A.jump.adapt || {})) out.push({ key: 'adapt:' + h, icon: 'food', icon2: hz[h], pct: Math.round(v * k * 100), word: `adapted to the ${h === 'heat' ? 'heat' : h}` });
    if (A.jump.water) out.push({ key: 'water', icon: 'water', pct: Math.round(A.jump.water * k * 100), word: 'less water needed' });
    for (const [s, v] of Object.entries(A.mul || {})) if (Math.abs(v - 1) > 0.01) out.push({ key: s, icon: s === 'damage' ? 'damage' : s === 'range' ? 'range' : 'rate', pct: Math.round((v - 1) * 100), word: s });
    return out;
  }
  const g = refineGain(st.r, q), step = A.step || '';
  if (step === 'food') out.push({ key: 'food', icon: 'food', pct: +g.toFixed(1), word: 'food from every farm' });
  else if (step.startsWith('adapt:')) { const h = step.slice(6); out.push({ key: step, icon: 'food', icon2: hz[h], pct: +(g * REFINE.adaptK).toFixed(1), word: `adapted to the ${h}` }); }
  else if (step === 'water') out.push({ key: 'water', icon: 'water', pct: +(g * REFINE.waterK).toFixed(1), word: 'less water needed' });
  else if (step === 'gun') { const sh = gunShares(A, strengths); for (const [s, w] of Object.entries(sh)) out.push({ key: s, icon: s === 'damage' ? 'damage' : s === 'range' ? 'range' : 'rate', pct: +(g * REFINE.gunK * w).toFixed(1), word: s === 'rate' ? 'rate of fire' : s }); }
  else if (step === 'science') out.push({ key: 'science', icon: 'labs', pct: +g.toFixed(1), word: 'research from every lab' });
  else if (step === 'shipsci') out.push({ key: 'shipsci', icon: 'labs', pct: +(g * REFINE.shipK).toFixed(1), word: 'research from lab ships' });
  else if (step === 'bt') out.push({ key: 'bt', icon: 'labs', pct: +(g * REFINE.btK).toFixed(1), word: 'chance of breakthroughs' });
  else if (step === 'cheap') out.push({ key: 'cheap', icon: 'cost', pct: +(g * REFINE.cheapK).toFixed(1), word: 'less research for every project' });
  else if (step === 'xeno') out.push({ key: 'xeno', icon: 'labs', pct: +(g * REFINE.xenoK).toFixed(1), word: 'research from anomalies' });
  else if (step.startsWith('fields:')) for (const f of step.slice(7).split(',')) out.push({ key: 'field:' + f, icon: 'computing', pct: +(g * REFINE.fieldK).toFixed(1), word: `${fieldWord(f)} stronger` });
  return out;
}
// a gun avenue's component: its avenue's own character (mul, fx) and every refinement's gain on top — a new version each time (no
// retrofit: the designs and ships built keep the version they have)
function avModel(S, fam, av, q) {
  const A = AVENUES[fam][av], h = heldOf(S, fam, av), F = FAMILIES[fam], mul = { ...(A.mul || {}) };
  for (const s of Object.keys(h.gain || {})) mul[s] = +((mul[s] || 1) * (1 + h.gain[s] / 100)).toFixed(4);
  const id = `av${S.eon}${fam}${av}${h.n}`, look = lookOf(fam, [], mul, id); look.trait = A.look || null;
  return { id, fam, av, kind: F.module, name: avName(fam, av, h.n), gen: A.tier, n: h.n, traits: [], mul, fx: { ...(A.fx || {}) }, look, eon: S.eon, q: +q.toFixed(2) };
}
// a project on an avenue is through: its breakthrough or its refinement, into the empire
function applyAvenue(S, pl, rep) {
  const fam = pl.fam, av = pl.av, A = AVENUES[fam][av], st = nextStep(S, fam, av), k = qFactor(pl.q), fams = (S.av[fam] = S.av[fam] || {});
  const strengths = Object.fromEntries(pl.ch.map(x => [x.id, x.strength])), gains = avGains(S, fam, av, pl.q, strengths), h = fams[av] || (fams[av] = { n: 0, gain: {}, eon: S.eon });
  if (st.jump) {
    if (A.jump && A.jump.food) { S.slotLevels = S.slotLevels || {}; S.slotLevels.food = (S.slotLevels.food || 1) + A.jump.food * k / 25; }   // a level = +25 % (colony.js UNIT.levelGain): new technology, refitted into the districts
    for (const [hz, v] of Object.entries((A.jump && A.jump.adapt) || {})) { S.adapt = S.adapt || {}; S.adapt[hz] = Math.min(1, (S.adapt[hz] || 0) + v * k); }
    if (A.jump && A.jump.water) S.water = Math.min(0.8, (S.water || 0) + A.jump.water * k);
    const J = A.jump || {};   // the labs' breakthroughs (avenues.js)
    if (J.science) { S.slotLevels = S.slotLevels || {}; S.slotLevels.science = (S.slotLevels.science || 1) + J.science * k / 25; }   // new technology: refitted into the lab districts
    if (J.shipsci) S.labShips = (S.labShips || 0) + J.shipsci * k;
    if (J.bt) S.btBonus = (S.btBonus || 0) + J.bt * k;
    if (J.cheap) S.projCheap = Math.min(CAPS.cheap, (S.projCheap || 0) + J.cheap * k);
    if (J.xeno) S.xeno = (S.xeno || 0) + J.xeno * k;
    for (const [f, v] of Object.entries(J.fields || {})) { S.fieldBoost = S.fieldBoost || {}; S.fieldBoost[f] = +((S.fieldBoost[f] || 0) + v * k).toFixed(4); }
    S.offers = (S.offers || []).filter(o => !(o.fam === fam && o.av === av));
  } else {
    const g = refineGain(st.r, pl.q), step = A.step || '';
    if (step === 'food') S.refine.food = (S.refine.food || 0) + g / 100;
    else if (step.startsWith('adapt:')) { const hz = step.slice(6); S.adaptR[hz] = Math.min(0.6, (S.adaptR[hz] || 0) + g * REFINE.adaptK / 100); }
    else if (step === 'water') S.waterR = Math.min(0.5, (S.waterR || 0) + g * REFINE.waterK / 100);
    else if (step === 'gun') for (const x of gains) h.gain[x.key] = +((h.gain[x.key] || 0) + x.pct).toFixed(2);
    else if (step === 'science') S.refine.science = (S.refine.science || 0) + g / 100;   // practice: counts in every lab at once
    else if (step === 'shipsci') S.labShips = (S.labShips || 0) + g * REFINE.shipK / 100;
    else if (step === 'bt') S.btBonus = (S.btBonus || 0) + g * REFINE.btK / 100;
    else if (step === 'cheap') S.projCheap = Math.min(CAPS.cheap, (S.projCheap || 0) + g * REFINE.cheapK / 100);
    else if (step === 'xeno') S.xeno = (S.xeno || 0) + g * REFINE.xenoK / 100;
    else if (step.startsWith('fields:')) for (const f of step.slice(7).split(',')) { S.fieldBoost = S.fieldBoost || {}; S.fieldBoost[f] = +((S.fieldBoost[f] || 0) + g * REFINE.fieldK / 100).toFixed(4); }
  }
  if (st.jump) h.jumpGains = gains; else if (A.step !== 'gun' && gains[0]) h.sum = +((h.sum || 0) + gains[0].pct).toFixed(2);   // what it has given, for its card in the tree
  h.n = (h.n || 0) + 1; h.eon = S.eon; h.q = +pl.q.toFixed(2);
  let model = null; if (FAMILIES[fam].module) { model = avModel(S, fam, av, pl.q); S.models = S.models || []; S.models.push(model); }
  const name = avName(fam, av, h.n), research = { fam, gen: A.tier, av, n: h.n, jump: st.jump, name, gains, model: model ? model.id : null };
  rep.push({ kind: 'breakthrough', research, text: `Research done: ${name} — ${st.jump ? 'a breakthrough: ' : 'refined: '}${gains.map(x => `${x.word} +${x.pct} %`).join(', ')}${model ? ' — fit it on new designs' : ''}` });
  S.techs = S.techs || []; S.techs.push({ fam, gen: A.tier, av, n: h.n, name, eon: S.eon, q: +pl.q.toFixed(2), pcts: gains.map(x => x.pct), model: model ? model.id : null });
}
// THE DISCOVERY (his rule: "it just happens"): every eon, for each avenue that could come (avenues.js candidates), a chance — when the
// fields it leans on are strong (quality ≥ BT.at) by how far past it they are, plus while you research what it grows from, by how far
// that went this eon × its quality² (effort with weak fields gets there, slowly); at most BT.cap, one a family an eon. Its own dice
export function avChance(S, fields, fam, av, plans = []) {
  const A = AVENUES[fam][av], q = qualityOf(S, fields, fam, av).q;
  let p = q >= BT.at ? BT.passive * (q - BT.at + 0.1) : 0;
  for (const pl of plans) if (pl.fam === fam && pl.av && A.from.includes(pl.av) && pl.gain > 0) p += BT.effort * (pl.gain / pl.need) * q * q;
  return { p: Math.min(BT.cap, p * (1 + (S.btBonus || 0))), q };   // Specimen Archives (avenues.js labs): breakthroughs come more often
}
export function discoverAvenues(S, fields, plans, rep) {
  if (!fields) return [];
  const found = [];
  for (const fam of Object.keys(AVENUES)) {
    const list = candidates(S, fam).map(av => ({ av, ...avChance(S, fields, fam, av, plans) })).filter(x => x.p > 0).sort((a, b) => b.p - a.p);
    for (const x of list) {
      if (die(`${S.seed}|${S.eon}|bt|${fam}|${x.av}`) >= x.p) continue;
      const A = AVENUES[fam][x.av]; S.offers = S.offers || []; S.offers.push({ fam, av: x.av, eon: S.eon }); found.push({ fam, av: x.av });
      rep.push({ kind: 'breakthrough', offer: { fam, av: x.av }, text: `A breakthrough in ${FAMILIES[fam].name.toLowerCase()}: your scientists found ${A.name} — ${A.text} Research it whenever you like.` });
      break;
    }
  }
  return found;
}
// is any breakthrough within reach in this family (its fields strong enough)? — a hint, never which one
export const avHint = (S, fields, fam) => !!fields && candidates(S, fam).some(av => qualityOf(S, fields, fam, av).q >= BT.at);
// every project this eon: its research, its quality, how far, how long
export function projectPlans(S, fields, research) {
  ensureAvenues(S);
  return (S.projects || []).map((p, i) => {
    const F = FAMILIES[p.fam]; if (!F) return null;
    if (hasAvenues(p.fam)) {                                                         // an avenue: its own recipe, its own price, its own name
      if (!p.av || !AVENUES[p.fam][p.av]) p.av = defaultAv(S, p.fam);
      const A = AVENUES[p.fam][p.av], { q, ch } = qualityOf(S, fields, p.fam, p.av), flow = research * (p.inf || 0) / 100, gain = flow * q, need = avNeed(S, p.fam, p.av), left = Math.max(0, need - (p.prog || 0)), st = nextStep(S, p.fam, p.av);
      return { i, p, fam: p.fam, av: p.av, A, F, jump: st.jump, name: avName(p.fam, p.av, st.n + 1), gen: A.tier, q, ch, boosts: [], flow, gain, need, done: (p.prog || 0) / need, eons: gain > 1e-9 ? Math.ceil(left / gain - 1e-9) : Infinity };
    }
    const { q, ch, boosts } = qualityOf(S, fields, p.fam), flow = research * (p.inf || 0) / 100, gain = flow * q, need = needOf(S, p.fam), left = Math.max(0, need - (p.prog || 0));
    return { i, p, fam: p.fam, F, name: nameOf(S, p.fam), gen: generationOf(S, p.fam), q, ch, boosts, flow, gain, need, done: (p.prog || 0) / need, eons: gain > 1e-9 ? Math.ceil(left / gain - 1e-9) : Infinity };
  }).filter(Boolean);
}
// the orders: start one, set its influence (the others give way if the total would pass 100 %), drop one. av: which avenue (an
// avenue family: one held, the base, or one offered) — two projects may run in one family on different avenues
export function startProject(S, fam, inf = null, av = null) {
  if (!FAMILIES[fam]) return 'No such research'; S.projects = S.projects || []; ensureAvenues(S);
  if (hasAvenues(fam)) {
    av = av || defaultAv(S, fam); const A = AVENUES[fam][av]; if (!A) return 'No such avenue';
    if (A.tier > 1 && !heldOf(S, fam, av) && !offered(S, fam, av)) return 'That has not been discovered';
    if (S.projects.some(p => p.fam === fam && p.av === av)) return 'That is already under way';
  } else if (S.projects.some(p => p.fam === fam)) return 'That is already under way';
  const free = 100 - S.projects.reduce((a, p) => a + (p.inf || 0), 0);
  S.projects.push({ fam, ...(hasAvenues(fam) ? { av } : {}), inf: 0, prog: 0, eon: S.eon }); return setInfluence(S, S.projects.length - 1, inf ?? (free >= 20 ? free : 50));
}
export function setInfluence(S, i, inf) {
  const P = S.projects || [], p = P[i]; if (!p) return 'No such project'; p.inf = Math.round(clamp(+inf || 0, 0, 100));
  const others = P.filter(x => x !== p), rest = others.reduce((a, x) => a + (x.inf || 0), 0), room = 100 - p.inf;
  if (rest > room) { const k = room / rest; for (const x of others) x.inf = Math.floor((x.inf || 0) * k); }
  return null;
}
export function dropProject(S, i) { const P = S.projects || []; if (!P[i]) return 'No such project'; P.splice(i, 1); return null; }
// ONE EON: every project takes its research; one that is through becomes its family's next generation — an AVENUE's project its
// breakthrough or its refinement (applyAvenue); then the avenues that may come are rolled for (discoverAvenues; fields: compute()'s)
export function advanceProjects(S, plans, rep, fields = null) {
  ensureAvenues(S);
  const finished = [];
  for (const pl of plans) {
    pl.p.prog = (pl.p.prog || 0) + pl.gain;
    if (pl.F.module && !pl.av && pl.flow > 0) { pl.p.fed = (pl.p.fed || 0) + pl.flow; pl.p.feed = pl.p.feed || {}; for (const x of pl.ch) pl.p.feed[x.id] = (pl.p.feed[x.id] || 0) + pl.flow * x.w * x.strength; }   // what each field gave it, as strong as it was then (its traits come from this)
    if (pl.p.prog >= pl.need - 1e-6) finished.push(pl);
  }
  for (const pl of finished.filter(x => x.av)) { applyAvenue(S, pl, rep); S.gens = S.gens || {}; S.gens[pl.fam] = Math.max(S.gens[pl.fam] || 0, pl.gen); }
  for (const pl of finished.filter(x => !x.av)) {
    S.gens = S.gens || {}; S.gens[pl.fam] = pl.gen; S.usedBoost = [...(S.usedBoost || []), ...pl.boosts.map(b => b.id)];
    const F = pl.F, top = Object.entries(F.recipe).sort((a, b) => b[1] - a[1])[0][0], ben = benefitsOf(S, null, pl.fam, pl.q);
    const gift = giftOf(S), giftProp = gift.length ? { name: 'Focus gift', rarity: 'common', what: "what the empire's focus brought with it", channels: gift.map(g => ({ channel: g.channel, pct: g.pct, x: CHANNEL_X[g.channel], how: `${pl.name}: ${g.word}`, prog: 100 })) } : null;
    const research = { fam: pl.fam, gen: pl.gen, name: pl.name, pcts: ben.map(b => b.pct), boosts: pl.boosts.map(b => b.name), gift: gift.map(g => ({ icon: g.icon, pct: g.pct, word: g.word })) };   // the report draws the paragraph with its icons from this
    if (giftProp && (F.adapt || F.level)) S.breakthroughs.unshift({ id: `pj${S.eon}${pl.fam}g`, name: `${pl.name} (focus gift)`, field: top, fieldName: DOMAINS[top].name, eon: S.eon, origin: 'a research project', under: null, project: pl.fam, props: [giftProp] });
    if (F.adapt) {
      S.adapt = S.adapt || {}; S.adapt[F.adapt] = Math.min(1, (S.adapt[F.adapt] || 0) + RESEARCH.adapt.base + RESEARCH.adapt.q * pl.q);
      rep.push({ kind: 'breakthrough', research, text: `Research done: ${pl.name} — farms on ${F.adapt === 'cold' ? 'cold' : F.adapt === 'heat' ? 'hot' : 'radiation-exposed'} worlds feed ${ben[0].pct} % more (quality ${Math.round(pl.q * 100)} %)` });
    } else if (F.module) {
      // A COMPONENT OF ITS OWN (his call, 2026-10-24: "a brand new energy weapon — it does something different, not an upgrade"): its
      // TRAITS from the fields that fed it (traits.js), a name of its own, its physical form (look); fitted on new designs only
      // and maybe SOMETHING EXTRAORDINARY (traits.js RARE, his rule 2026-10-30): a chance that grows with how strong its fields were
      S.models = S.models || []; const traits = traitsFrom(pl.fam, pl.ch, pl.p.feed, pl.p.fed), mk = makeup(pl.fam, traits), mul = mk.mul, id = `md${S.eon}${pl.fam}${pl.gen}`;
      const rare = rollRare(pl.fam, pl.ch, pl.p.feed, pl.p.fed, `${S.seed}|${S.eon}|${pl.fam}|${pl.gen}`), rw = rare ? rareWords(pl.fam, rare) : null, fx = rare ? { ...mk.fx, ...rareFx(pl.fam, rare) } : mk.fx, look = lookOf(pl.fam, traits, mul, id);
      if (rw) { look.col = rw.col; look.rare = rare.id; }
      const model = { id, fam: pl.fam, kind: F.module, name: nameFor(S, pl.fam, traits, F.base, rw ? rw.adj : null), gen: pl.gen, traits, mul, fx, look, eon: S.eon, q: +pl.q.toFixed(2), ...(rare ? { rare } : {}) };
      S.models.push(model); Object.assign(research, { model: model.id, name: model.name, traits, look: model.look, rare });
      if (giftProp) S.breakthroughs.unshift({ id: `pj${S.eon}${pl.fam}g`, name: `${model.name} (focus gift)`, field: top, fieldName: DOMAINS[top].name, eon: S.eon, origin: 'a research project', under: null, project: pl.fam, props: [giftProp] });
      rep.push({ kind: 'breakthrough', research, text: `Research done: ${model.name} — a new ${F.name.toLowerCase()} of its own: ${traits.map(t => { const w = traitWords(pl.fam, t); return w ? `${w.good}, but ${w.bad}` : t.id; }).join('; ')}${rw ? ` — and something EXTRAORDINARY: it ${rw.good}` : ''} — fit it on new designs` });
    } else if (F.level) {
      const up = RESEARCH.level.base + RESEARCH.level.q * pl.q; S.slotLevels = S.slotLevels || {}; S.slotLevels[F.level] = (S.slotLevels[F.level] || 1) + up;
      rep.push({ kind: 'breakthrough', research, text: `Research done: ${pl.name} — every ${F.level === 'food' ? 'farm' : F.level === 'housing' ? 'home' : F.level === 'industry' ? 'works' : 'lab'} district gives ${ben[0].pct} % more (quality ${Math.round(pl.q * 100)} %)` });
    } else {
      const chans = ben.map(b => ({ channel: b.channel, pct: b.pct, x: CHANNEL_X[b.channel], how: `${pl.name}, built into every ${F.name.toLowerCase()}`, prog: 100 }));
      S.breakthroughs.unshift({ id: `pj${S.eon}${pl.fam}`, name: pl.name, field: top, fieldName: DOMAINS[top].name, eon: S.eon, origin: 'a research project', under: null, project: pl.fam,
        props: [{ name: `${F.name}, generation ${pl.gen}`, rarity: 'common', what: 'developed on purpose', channels: chans }, ...(giftProp ? [giftProp] : [])] });
      rep.push({ kind: 'breakthrough', research, text: `Research done: ${pl.name} — ${chans.map(c => `${c.channel.replace(/_/g, ' ')} +${c.pct} %`).join(', ')} on every ${F.name.toLowerCase()} (quality ${Math.round(pl.q * 100)} %)` });
    }
    S.techs = S.techs || []; S.techs.push({ fam: pl.fam, gen: pl.gen, name: research.name, eon: S.eon, q: +pl.q.toFixed(2), pcts: research.pcts, model: research.model || null });   // the tree (techTree)
  }
  if (finished.length) S.projects = (S.projects || []).filter(p => !finished.some(f => f.p === p));
  discoverAvenues(S, fields, plans, rep);
  return finished;
}
// THE TREE (his ask, 2026-10-31: "the tech tree evolving from left to right, tiers in columns"): every technology the empire has
// developed — a family's generation is its TIER. S.techs keeps each as it came out (advanceProjects); an older game has only its
// generation counts (S.gens) and its components (S.models): those fill in, a plain one with no numbers kept
export function techTree(S) {
  const out = [], have = new Set();
  for (const t of S.techs || []) { if (!FAMILIES[t.fam]) continue; out.push(t); have.add(t.fam + ':' + t.gen); }
  for (const [fam, n] of Object.entries(S.gens || {})) {
    const F = FAMILIES[fam]; if (!F) continue;
    for (let g = 1; g <= n; g++) {
      if (have.has(fam + ':' + g)) continue; const m = F.module ? (S.models || []).find(x => x.fam === fam && x.gen === g) : null;
      out.push({ fam, gen: g, name: m ? m.name : `${F.base} Mk ${roman(g)}`, eon: m ? m.eon : null, q: m ? m.q : null, pcts: null, model: m ? m.id : null });
    }
  }
  return out.sort((a, b) => a.gen - b.gen);
}
// THE ADVISORS: what the empire needs, read from the game — each with its reason, and how it would come out with the fields you have
export function advisors(S, c) {
  ensureAvenues(S);
  // an AVENUE family is suggested avenue by avenue (avenues.js): `av` names which — one held, the base, or one offered
  const busy = new Set((S.projects || []).map(p => p.fam + ':' + (p.av || ''))), out = [];
  const pickAv = fam => { if (!hasAvenues(fam)) return ''; const o = (S.offers || []).find(x => x.fam === fam && !busy.has(fam + ':' + x.av)); if (o) return o.av; const d = defaultAv(S, fam); return busy.has(fam + ':' + d) ? baseAvenue(fam) : d; };
  const q = (fam, av = pickAv(fam)) => qualityOf(S, c.fields, fam, av || null).q;
  const lean = fam => 0.7 + 1.2 * focusAffinity(S, fam);   // the focus's own families weigh more (2026-10-23)
  const dup = fam => FAMILIES[fam].module && !hasAvenues(fam) && !!sameAs(S, fam, traitsFrom(fam, qualityOf(S, c.fields, fam).ch));   // it would only make one more of what you have
  const add = (fam, why, score0, av = null) => {
    av = hasAvenues(fam) ? (av || pickAv(fam)) : ''; if (busy.has(fam + ':' + av)) return;
    const score = score0 * lean(fam) * (dup(fam) ? 0.35 : 1), o = out.find(x => x.fam === fam && (x.av || '') === av);
    if (o) { if (score > o.score) { o.why = why; o.score = score; } return; } out.push({ fam, ...(av ? { av } : {}), why, score, q: q(fam, av) });
  };
  const names = list => list.slice(0, 2).map(p => p.pl.name).join(', ') + (list.length > 2 ? ` and ${list.length - 2} more` : '');
  for (const o of S.offers || []) add(o.fam, `your scientists found ${AVENUES[o.fam][o.av].name} — research it`, 3.2, o.av);   // a breakthrough waiting for you
  const hungry = c.colonies.filter(p => p.water && p.fed < 0.98); if (hungry.length) add('farms', `${names(hungry)} ${hungry.length > 1 ? 'are' : 'is'} hungry — food feeds ${Math.round(Math.min(...hungry.map(p => p.fed)) * 100)} %`, 3, heldOf(S, 'farms', 'hydro') ? 'hydro' : 'farming');
  for (const [hazard, av, word] of [['cold', 'cold', 'cold'], ['heat', 'heat', 'hot'], ['radiation', 'rad', 'open to radiation (thin or no air)']]) {   // the climate cuts the farms (districts.js) — only an avenue you have can be refined
    if (!heldOf(S, 'farms', av) || ((S.adapt || {})[hazard] || 0) + ((S.adaptR || {})[hazard] || 0) >= 0.999) continue; const hit = c.colonies.filter(p => p.climate && p.climate.parts.some(x => x.hazard === hazard && x.cut > 0.02) && p.cap.food > 0);
    if (hit.length) add('farms', `${names(hit)} ${hit.length > 1 ? 'are' : 'is'} ${word} — ${hit.length > 1 ? 'their' : 'its'} farms give ${Math.round(Math.min(...hit.map(p => p.climate.mul)) * 100)} % of what they would`, hit.some(p => p.water ? p.fed < 0.98 : p.waterNeed > 0) ? 2.8 : 1.9 + (1 - Math.min(...hit.map(p => p.climate.mul))), av);   // hungry: urgent; else as much as the climate cuts
  }
  const crowded = c.colonies.filter(p => p.P.people > 0.9 * p.housing); if (crowded.length) add('homes', `${names(crowded)} ${crowded.length > 1 ? 'are' : 'is'} crowded — ${Math.round(crowded[0].P.people)} of ${Math.round(crowded[0].housing)} M homes taken`, 2.6);
  const idle = c.colonies.filter(p => p.people.industry > p.cap.industry * 1.1); if (idle.length) add('works', `${Math.round(idle.reduce((a, p) => a + p.people.industry - p.cap.industry, 0))} M hands have no works to work in (${names(idle)})`, 2.2);
  const idleR = c.colonies.filter(p => p.people.research > p.cap.science * 1.1); if (idleR.length) add('labs', `${Math.round(idleR.reduce((a, p) => a + p.people.research - p.cap.science, 0))} M researchers have no labs (${names(idleR)})`, 2);
  const broke = (S.derelicts || []).filter(d => S.eon - (d.eon ?? S.eon) <= 40).length; if (broke) add('drive', `${broke} ship${broke > 1 ? 's' : ''} broke down between the stars lately`, 2.4);
  const hostile = (S.hostiles || []).length;
  if (hostile) {
    const weap = ['beam', 'gun', 'missile'].sort((a, b) => q(b) - q(a))[0], def = ['shield', 'armor'].sort((a, b) => q(b) - q(a))[0];
    add(weap, `${hostile} system${hostile > 1 ? 's are' : ' is'} held by hostile fleets — of the weapons, your fields favour this one`, 1.8);
    add(def, `to survive them: of shields and armour your fields favour this one`, 1.5);
  }
  for (const b of S.breakthroughs.filter(b => !b.project && S.eon - (b.eon || 0) <= 40 && !(S.usedBoost || []).includes(b.id)).slice(0, 3)) {
    const fam = Object.keys(FAMILIES).filter(k => FAMILIES[k].recipe[b.field]).sort((a, b2) => FAMILIES[b2].recipe[b.field] - FAMILIES[a].recipe[b.field] || q(b2) - q(a))[0];
    if (fam) add(fam, `a new find in ${b.fieldName} — ${b.name} — would carry it`, 2.1);
  }
  const free = Object.keys(FAMILIES).filter(k => !busy.has(k + ':' + pickAv(k)));
  const best = free.slice().sort((a, b) => q(b) - q(a))[0]; if (best) add(best, `your fields favour it most: it would come out at ${Math.round(q(best) * 100)} %`, 1);
  const fx = (S.focus || []).indexOf(Math.max(...(S.focus || [0.25]))), fName = ['Expansion', 'Exploitation', 'Exploration', 'Extermination'][fx];
  const mine = free.slice().sort((a, b) => focusAffinity(S, b) - focusAffinity(S, a) || q(b) - q(a))[0]; if (mine && (S.focus || [])[fx] > 0.3) add(mine, `your focus is ${fName} — it leans that way`, 1.4);
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
