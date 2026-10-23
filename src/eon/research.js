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

export const FIELD_IDS = Object.keys(DOMAINS);
export const FIELD_COL = { materials: '#c9a27a', fabrication: '#ffb347', energy: '#ffd84f', electrics: '#7fd8ff', optics: '#c79bff', thermal: '#ff7a59', motion: '#5fe0b4', life: '#8fd16a', information: '#4fa3ff' };
export const RESEARCH = {
  need: 1500, growth: 1.5,                   // research a family's first generation takes; × growth for every generation after
  strength: { base: 0.55, potential: 0.6, perFind: 0.04, booster: 0.06, boosters: 3 },   // a field's strength for a project; at most 3 finds boost one project
  mag: 10,                                   // % a generation adds to its family's main channel at quality 1 (the other channels by their weight)
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
  { id: 'military', name: 'Military', fams: ['beam', 'gun', 'missile', 'armor'] },
  { id: 'energy', name: 'Energy', fams: ['shield', 'reactor'] },
  { id: 'propulsion', name: 'Propulsion', fams: ['drive', 'thruster'] },
  { id: 'information', name: 'Information', fams: ['computer', 'sensors'] },
  { id: 'civil', name: 'Civil', fams: ['farms', 'farms_cold', 'farms_hot', 'farms_rad', 'homes', 'works', 'labs'] },
];
export const FAMILIES = {
  beam:     { name: 'Energy weapon',    icon: '⚡', base: 'Lance',   recipe: { energy: 0.4, optics: 0.35, thermal: 0.25 }, channels: { beam_power: 1, weapon_range: 0.6, rate_of_fire: 0.6 } },
  gun:      { name: 'Kinetic gun',      icon: '⦿', base: 'Driver',  recipe: { materials: 0.35, fabrication: 0.35, motion: 0.3 }, channels: { kinetic_penetration: 1, accuracy: 0.6, rate_of_fire: 0.6 } },
  missile:  { name: 'Missile',          icon: '➹', base: 'Viper',   recipe: { fabrication: 0.35, materials: 0.25, life: 0.2, motion: 0.2 }, channels: { warhead_yield: 1, weapon_range: 0.6, targeting: 0.4 } },
  armor:    { name: 'Armour',           icon: '⛨', base: 'Plate',   recipe: { materials: 0.45, fabrication: 0.35, thermal: 0.2 }, channels: { armor_integrity: 1, armor_deflection: 0.6, hull_integrity: 0.4 } },
  shield:   { name: 'Shield',           icon: '◎', base: 'Aegis',   recipe: { motion: 0.4, energy: 0.25, electrics: 0.2, fabrication: 0.15 }, channels: { shield_capacity: 1, shield_recovery: 0.6, shield_reach: 0.4 } },
  reactor:  { name: 'Reactor',          icon: '☢', base: 'Heart',   recipe: { energy: 0.5, thermal: 0.3, materials: 0.2 }, channels: { reactor_output: 1, energy_storage: 0.6, power_efficiency: 0.4 } },
  drive:    { name: 'Star drive',       icon: '➶', base: 'Strider', recipe: { motion: 0.4, energy: 0.35, thermal: 0.25 }, channels: { drive_efficiency: 1, thrust: 0.4 } },
  thruster: { name: 'Thrusters',        icon: '⇶', base: 'Swift',   recipe: { motion: 0.5, fabrication: 0.25, electrics: 0.25 }, channels: { thrust: 1, agility: 0.6, evasion: 0.4 } },
  computer: { name: 'Weapons computer', icon: '▣', base: 'Oracle',  recipe: { electrics: 0.4, information: 0.4, optics: 0.2 }, channels: { targeting: 1, computing: 0.6, synthetic_neural: 0.4 } },
  sensors:  { name: 'Sensors',          icon: '◉', base: 'Argus',   recipe: { optics: 0.45, information: 0.35, electrics: 0.2 }, channels: { sensor_range: 1, sensor_resolution: 0.6 } },
  farms:    { name: 'Farms',            icon: '🌾', base: 'Harvest', recipe: { life: 0.6, thermal: 0.2, materials: 0.2 }, level: 'food' },
  // THE CLIMATE'S CROPS (his call 2026-10-23): each generation ADAPTS the farms to one hazard (districts.js CLIMATE) — the cut it makes shrinks
  farms_cold: { name: 'Frost-hardy crops', icon: '❄', base: 'Rime',   recipe: { life: 0.5, thermal: 0.3, materials: 0.2 }, adapt: 'cold' },
  farms_hot:  { name: 'Heat-proof crops',  icon: '☀', base: 'Ember',  recipe: { life: 0.45, thermal: 0.35, fabrication: 0.2 }, adapt: 'heat' },
  farms_rad:  { name: 'Shielded farms',    icon: '☢', base: 'Mantle', recipe: { life: 0.4, materials: 0.3, motion: 0.3 }, adapt: 'radiation' },
  homes:    { name: 'Homes',            icon: '⌂', base: 'Hearth',  recipe: { materials: 0.4, life: 0.3, information: 0.3 }, level: 'housing' },
  works:    { name: 'Works',            icon: '⚙', base: 'Foundry', recipe: { fabrication: 0.5, electrics: 0.3, materials: 0.2 }, level: 'industry' },
  labs:     { name: 'Labs',             icon: '🔬', base: 'Lyceum',  recipe: { information: 0.5, electrics: 0.3, optics: 0.2 }, level: 'science' },
};
// THE WRITTEN DESCRIPTION (his ask, 2026-10-23: "a little paragraph — wherever there is a value, an icon, so you can read it or just
// look at the icons"): per family a few openings, one per generation in turn; {0} {1} {2} are its benefits in the order of its
// channels (the main one first) — the UI puts the icon and the number there. CHANNEL_ICON: which icon (techicons.js) a channel shows
const T3 = (...t) => t;
const TEXT = {
  beam:     T3('Tighter focusing coils and a cooler lens: every energy weapon hits {0} harder, reaches {1} further and fires {2} faster.', 'A second resonance chamber feeds the beam: {0} more punch, {1} more reach, and the capacitors refill {2} quicker.', 'Phase-locked emitters fire as one: {0} damage, {1} range, {2} rate of fire.'),
  gun:      T3('Denser slugs and a longer rail: shells bite {0} deeper, land {1} truer and cycle {2} faster.', 'A recoil-damped breech: {0} more penetration, {1} tighter groups, {2} quicker reloads.', 'Self-forging rounds: {0} penetration, {1} accuracy, {2} rate of fire.'),
  missile:  T3('A richer charge and a leaner motor: warheads hit {0} harder, fly {1} further, and the seeker locks {2} better.', 'Staged boosters and a shaped charge: {0} yield, {1} reach, {2} sharper terminal guidance.', 'A smarter swarm: {0} yield, {1} range, {2} lock.'),
  armor:    T3('Layered plate with a soft core: armour holds {0} more, shrugs off {1} more of every hit, and the frame behind it is {2} tougher.', 'Graded alloys from skin to spine: {0} plate strength, {1} deflection, {2} hull.', 'Plates that spread a blow across the hull: {0} integrity, {1} deflection, {2} frame.'),
  shield:   T3('A tighter field lattice: shields hold {0} more, recover {1} faster and stretch {2} further over the hull.', 'Overlapping emitters: {0} capacity, {1} recovery, {2} reach.', 'A field that hardens where it is struck: {0} capacity, {1} recovery, {2} coverage.'),
  reactor:  T3('Hotter, cleaner burns: reactors give {0} more power, store {1} more, and everything aboard draws {2} less.', 'A denser core: {0} output, {1} reserve, {2} efficiency.', 'Magnetic bottling: {0} output, {1} storage, {2} less draw.'),
  drive:    T3('A smoother fold in the star drive: fleets cross {0} faster between the stars and push {1} harder in battle.', 'A lighter drive core: {0} between the stars, {1} thrust.', 'A drive that drinks less: {0} star travel, {1} thrust.'),
  thruster: T3('Vectored nozzles: ships push {0} harder, turn {1} sharper and slip {2} more of the fire.', 'Pulse thrusters: {0} thrust, {1} agility, {2} evasion.', 'Thrust where it is needed: {0} thrust, {1} turn, {2} evasion.'),
  computer: T3('Faster fire control: guns pick their aim {0} better, the computer runs {1} more, and decides {2} more by itself.', 'Predictive tracking: {0} targeting, {1} computing, {2} autonomy.', 'A mind in the turret: {0} targeting, {1} computing, {2} autonomy.'),
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
  computing: 'computing', synthetic_neural: 'computing', sensor_range: 'sensors', sensor_resolution: 'sensors', food: 'food', housing: 'homes', industry: 'works', science: 'labs',
  cold: 'cold', heat: 'heat', radiation: 'radiation' };
// how much more a world under this hazard would farm if the crops' adaptation went from a to a2 (a full hazard)
export const adaptGain = (hazard, a, a2) => { const p = CLIMATE[hazard] || 0; return (1 - p * (1 - Math.min(1, a2))) / Math.max(1e-6, 1 - p * (1 - Math.min(1, a))) - 1; };
// what a generation would give, with the fields as they are: [{ channel, icon, pct }] in the family's order (the main one first)
export function benefitsOf(S, fields, fam, q = null) {
  const F = FAMILIES[fam]; if (q == null) q = qualityOf(S, fields, fam).q;
  if (F.level) return [{ channel: F.level, icon: CHANNEL_ICON[F.level], pct: Math.round((RESEARCH.level.base + RESEARCH.level.q * q) * 25) }];
  if (F.adapt) { const a = (S.adapt || {})[F.adapt] || 0, a2 = a + RESEARCH.adapt.base + RESEARCH.adapt.q * q; return [{ channel: F.adapt, icon: 'food', icon2: CHANNEL_ICON[F.adapt], pct: Math.max(1, Math.round(adaptGain(F.adapt, a, a2) * 100)) }]; }
  return Object.entries(F.channels).map(([channel, w]) => ({ channel, icon: CHANNEL_ICON[channel], pct: Math.max(1, Math.round(RESEARCH.mag * w * q)) }));
}
// the paragraph's text for a generation: the template with {i} still in it (the UI fills them)
export const textOf = (fam, gen) => { const t = TEXT[fam] || ['{0}']; return t[(Math.max(1, gen) - 1) % t.length]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const generationOf = (S, fam) => ((S.gens || {})[fam] || 0) + 1;
export const needOf = (S, fam) => Math.round(RESEARCH.need * Math.pow(RESEARCH.growth, generationOf(S, fam) - 1));
export const nameOf = (S, fam) => { const g = generationOf(S, fam); return `${FAMILIES[fam].base} Mk ${ROMAN[g] || g}`; };
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
  for (const p of colonies) pour(p.research, p.pl, p.G, p.pl.name);
  for (const { u, t } of ships) if (!u.dest && t.research > 0) { const pl = S.places.find(x => x.id === u.at), col = colAt.get(u.at); pour(t.research, pl, col ? col.G : null, `${u.name} at ${pl ? pl.name : '?'}`); }
  for (const f of FIELD_IDS) from[f].sort((a, b) => b.v - a.v);
  return { by, from, total: FIELD_IDS.reduce((a, f) => a + by[f], 0) };
}
export const divertedOf = S => clamp((S.projects || []).reduce((a, p) => a + (p.inf || 0), 0) / 100, 0, 1);
// the finds a project would use as boosters: the newest ones of its recipe's fields nobody has used yet
export function boostersFor(S, fam) {
  const F = FAMILIES[fam], used = new Set(S.usedBoost || []);
  return S.breakthroughs.filter(b => !b.project && F.recipe[b.field] && !used.has(b.id)).sort((a, b) => (b.eon || 0) - (a.eon || 0)).slice(0, RESEARCH.strength.boosters);
}
// how good a project of this family would come out with the fields as they are (fields: compute()'s, with their potential)
export function qualityOf(S, fields, fam) {
  const F = FAMILIES[fam], byId = new Map(fields.map(f => [f.id, f])), boosts = boostersFor(S, fam);
  const ch = Object.entries(F.recipe).map(([id, w]) => { const f = byId.get(id), nb = boosts.filter(b => b.field === id).length; return { id, w, nb, potential: f ? f.potential : 0, found: S.found[id] || 0, strength: strengthOf(f ? f.potential : 0, S.found[id] || 0, nb) }; });
  return { q: ch.reduce((a, x) => a + x.w * x.strength, 0), ch, boosts };
}
// every project this eon: its research, its quality, how far, how long
export function projectPlans(S, fields, research) {
  return (S.projects || []).map((p, i) => {
    const F = FAMILIES[p.fam]; if (!F) return null; const { q, ch, boosts } = qualityOf(S, fields, p.fam), flow = research * (p.inf || 0) / 100, gain = flow * q, need = needOf(S, p.fam), left = Math.max(0, need - (p.prog || 0));
    return { i, p, fam: p.fam, F, name: nameOf(S, p.fam), gen: generationOf(S, p.fam), q, ch, boosts, flow, gain, need, done: (p.prog || 0) / need, eons: gain > 1e-9 ? Math.ceil(left / gain - 1e-9) : Infinity };
  }).filter(Boolean);
}
// the orders: start one, set its influence (the others give way if the total would pass 100 %), drop one
export function startProject(S, fam, inf = null) {
  if (!FAMILIES[fam]) return 'No such research'; S.projects = S.projects || [];
  if (S.projects.some(p => p.fam === fam)) return 'That is already under way';
  const free = 100 - S.projects.reduce((a, p) => a + (p.inf || 0), 0);
  S.projects.push({ fam, inf: 0, prog: 0, eon: S.eon }); return setInfluence(S, S.projects.length - 1, inf ?? (free >= 20 ? free : 50));
}
export function setInfluence(S, i, inf) {
  const P = S.projects || [], p = P[i]; if (!p) return 'No such project'; p.inf = Math.round(clamp(+inf || 0, 0, 100));
  const others = P.filter(x => x !== p), rest = others.reduce((a, x) => a + (x.inf || 0), 0), room = 100 - p.inf;
  if (rest > room) { const k = room / rest; for (const x of others) x.inf = Math.floor((x.inf || 0) * k); }
  return null;
}
export function dropProject(S, i) { const P = S.projects || []; if (!P[i]) return 'No such project'; P.splice(i, 1); return null; }
// ONE EON: every project takes its research; one that is through becomes its family's next generation
export function advanceProjects(S, plans, rep) {
  const finished = [];
  for (const pl of plans) { pl.p.prog = (pl.p.prog || 0) + pl.gain; if (pl.p.prog >= pl.need - 1e-6) finished.push(pl); }
  for (const pl of finished) {
    S.gens = S.gens || {}; S.gens[pl.fam] = pl.gen; S.usedBoost = [...(S.usedBoost || []), ...pl.boosts.map(b => b.id)];
    const F = pl.F, top = Object.entries(F.recipe).sort((a, b) => b[1] - a[1])[0][0], ben = benefitsOf(S, null, pl.fam, pl.q);
    const research = { fam: pl.fam, gen: pl.gen, name: pl.name, pcts: ben.map(b => b.pct), boosts: pl.boosts.map(b => b.name) };   // the report draws the paragraph with its icons from this
    if (F.adapt) {
      S.adapt = S.adapt || {}; S.adapt[F.adapt] = Math.min(1, (S.adapt[F.adapt] || 0) + RESEARCH.adapt.base + RESEARCH.adapt.q * pl.q);
      rep.push({ kind: 'breakthrough', research, text: `Research done: ${pl.name} — farms on ${F.adapt === 'cold' ? 'cold' : F.adapt === 'heat' ? 'hot' : 'radiation-exposed'} worlds feed ${ben[0].pct} % more (quality ${Math.round(pl.q * 100)} %)` });
    } else if (F.level) {
      const up = RESEARCH.level.base + RESEARCH.level.q * pl.q; S.slotLevels = S.slotLevels || {}; S.slotLevels[F.level] = (S.slotLevels[F.level] || 1) + up;
      rep.push({ kind: 'breakthrough', research, text: `Research done: ${pl.name} — every ${F.level === 'food' ? 'farm' : F.level === 'housing' ? 'home' : F.level === 'industry' ? 'works' : 'lab'} district gives ${ben[0].pct} % more (quality ${Math.round(pl.q * 100)} %)` });
    } else {
      const chans = ben.map(b => ({ channel: b.channel, pct: b.pct, x: CHANNEL_X[b.channel], how: `${pl.name}, built into every ${F.name.toLowerCase()}`, prog: 100 }));
      S.breakthroughs.unshift({ id: `pj${S.eon}${pl.fam}`, name: pl.name, field: top, fieldName: DOMAINS[top].name, eon: S.eon, origin: 'a research project', under: null, project: pl.fam,
        props: [{ name: `${F.name}, generation ${pl.gen}`, rarity: 'common', what: 'developed on purpose', channels: chans }] });
      rep.push({ kind: 'breakthrough', research, text: `Research done: ${pl.name} — ${chans.map(c => `${c.channel.replace(/_/g, ' ')} +${c.pct} %`).join(', ')} on every ${F.name.toLowerCase()} (quality ${Math.round(pl.q * 100)} %)` });
    }
  }
  if (finished.length) S.projects = (S.projects || []).filter(p => !finished.some(f => f.p === p));
  return finished;
}
// THE ADVISORS: what the empire needs, read from the game — each with its reason, and how it would come out with the fields you have
export function advisors(S, c) {
  const out = [], q = fam => qualityOf(S, c.fields, fam).q, busy = new Set((S.projects || []).map(p => p.fam));
  const add = (fam, why, score) => { if (busy.has(fam)) return; const o = out.find(x => x.fam === fam); if (o) { if (score > o.score) { o.why = why; o.score = score; } return; } out.push({ fam, why, score, q: q(fam) }); };
  const names = list => list.slice(0, 2).map(p => p.pl.name).join(', ') + (list.length > 2 ? ` and ${list.length - 2} more` : '');
  const hungry = c.colonies.filter(p => p.water && p.fed < 0.98); if (hungry.length) add('farms', `${names(hungry)} ${hungry.length > 1 ? 'are' : 'is'} hungry — food feeds ${Math.round(Math.min(...hungry.map(p => p.fed)) * 100)} %`, 3);
  for (const [hazard, fam, word] of [['cold', 'farms_cold', 'cold'], ['heat', 'farms_hot', 'hot'], ['radiation', 'farms_rad', 'open to radiation (thin or no air)']]) {   // the climate cuts the farms (districts.js)
    if (((S.adapt || {})[hazard] || 0) >= 0.999) continue; const hit = c.colonies.filter(p => p.climate && p.climate.parts.some(x => x.hazard === hazard && x.cut > 0.02) && p.cap.food > 0);
    if (hit.length) add(fam, `${names(hit)} ${hit.length > 1 ? 'are' : 'is'} ${word} — ${hit.length > 1 ? 'their' : 'its'} farms give ${Math.round(Math.min(...hit.map(p => p.climate.mul)) * 100)} % of what they would`, hit.some(p => p.water ? p.fed < 0.98 : p.waterNeed > 0) ? 2.8 : 1.9 + (1 - Math.min(...hit.map(p => p.climate.mul))));   // hungry: urgent; else as much as the climate cuts
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
  const best = Object.keys(FAMILIES).filter(k => !busy.has(k)).sort((a, b) => q(b) - q(a))[0]; if (best) add(best, `your fields favour it most: it would come out at ${Math.round(q(best) * 100)} %`, 1);
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
