// THE EON LOOP — one turn of the empire, as pure data (no DOM).
//
// PLACES. The system is a handful of places: the star, planets, a moon, an anomaly. Every place has
// a research potential for each of the nine fields — mostly 5%, two or three at 30%, one high.
// A place only counts while someone is studying it: a colony's researchers on the ground (full
// weight), a ship or station with a lab in orbit (less), and the star is also studied by every lab
// in the system. Working a place wears its potential down — never to nothing.
//
// BREAKTHROUGHS are never chosen and there is no bar to watch. Each field has a POTENTIAL made of
// every place you are studying. Each eon a field has a chance — potential × the share of attention
// you give it — to make one hidden step forward; ten steps make a breakthrough. Leave a place and
// the steps stay but the chance drops. Move the empire's focus and some steps are lost.
// The focus (Expansion / Exploitation / Exploration / Extermination) decides what a find is good for.
//
// INTEGRATION. What you find is slowly worked into what everyone simply knows: about 1% an eon,
// faster with a steady focus, with more research anywhere in the empire, and each time a later
// find carries the same kind of boost.
import { PROPERTIES, DOMAINS, CHANNEL_X, RARITY } from '../data/properties.js';
import { designStats, allCapsules, passiveOf, dockFit, fleetWarp } from './modules.js';
import { generateGalaxy } from './galaxy.js';

export const XS = ['expand', 'exploit', 'explore', 'exterminate'];
export const X_INFO = {
  expand:      { name: 'Expansion',     color: '#7ef3b0' },
  exploit:     { name: 'Exploitation',  color: '#ffd26a' },
  explore:     { name: 'Exploration',   color: '#6db7ff' },
  exterminate: { name: 'Extermination', color: '#ff7979' },
};
export const FIELD_IDS = Object.keys(DOMAINS);

export const T = {
  foodPerSocial: 1.6, foodPerSpare: 0.4, foodPerHead: 0.5, growthPerFood: 0.25, starvePerFood: 0.2,
  cohesionPerSocial: 0.08, focusCost: 30,
  attention: 10,           // points of research attention to hand out between the nine fields
  steps: 10,               // hidden steps a field needs for one breakthrough
  wear: 0.6,               // a place keeps this much of a field's potential after each find taken from it
  floor: 0.03,             // …but never less than this
  orbit: 0.6,              // weight of studying a place from orbit instead of from the ground
  starShare: 0.3,          // every lab in the system also studies the star, at this weight
  focusSetback: 4,         // steps lost in every field per full centre-to-corner move of the focus
  baseMag: { common: 8, uncommon: 12, rare: 17, exotic: 26 },
  integrate: 1,            // % of a capsule integrated per eon, before bonuses
  steadyBonus: 0.1,        // +10% per eon the focus has stood still, up to ten eons
  reinforce: 5,            // % added to an older capsule when a later find carries the same boost
  startIntegrated: 20,     // % already integrated in what you start the game knowing
  travel: { starship: 1, platform: 4 },   // eons between two places of one system
  starSpeed: 12,           // distance a plain star drive covers between stars in one eon (the galaxy is 200 across)
  sectionEons: 1,          // a hull too big for the gantry: eons spent joining it, for every extra section
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let seq = 0;
export const uid = p => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

// ---------------- the pyramid ----------------
export const CORNERS = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
export const CENTER = [0.25, 0.25, 0.25, 0.25];
export const posOf = w => [0, 1, 2].map(k => w[0] * CORNERS[0][k] + w[1] * CORNERS[1][k] + w[2] * CORNERS[2][k] + w[3] * CORNERS[3][k]);
export function weightsOf(p) {
  const w = CORNERS.map(v => Math.max(0, (1 + p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) / 4));
  const s = w.reduce((a, b) => a + b, 0) || 1;
  return w.map(x => x / s);
}
export function focusDistance(a, b) { const pa = posOf(a), pb = posOf(b); return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) / Math.sqrt(3); }
export function limitMove(w, w0, reach) {
  const d = focusDistance(w0, w);
  if (d <= reach || d === 0) return w;
  const p0 = posOf(w0), p = posOf(w), k = Math.max(0, reach) / d;
  return weightsOf(p0.map((v, i) => v + (p[i] - v) * k));
}

// ---------------- state ----------------
function rand(S) {
  let t = (S.seed + Math.imul(0x6D2B79F5, ++S.rolls)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const perField = v => Object.fromEntries(FIELD_IDS.map(f => [f, typeof v === 'function' ? v(f) : v]));
const newColony = (people, baseHousing = 0) => ({ people, baseHousing, split: [1 / 3, 1 / 3, 1 / 3], happiness: 60, queue: [], structures: [] });

// a starting design: a silhouette and a list of modules ({ kind, n?, w/h for a gantry, k for a reactor })
function design(name, hull, kinds) {
  return { id: uid('d'), name, hull, modules: kinds.map(k => { const o = typeof k === 'string' ? { kind: k } : k; return { id: uid('m'), caps: [], n: 1, ...o }; }) };
}
export const cloneDesign = d => ({ id: d.id, name: d.name, hull: d.hull, modules: d.modules.map(m => ({ ...m, caps: [...m.caps] })) });

export function newState(seed = 7) {
  const G = generateGalaxy(seed);                       // the same seed always gives the same galaxy
  const S = {
    version: 8, seed, rolls: 0, eon: 1,
    focus: [...CENTER], focusStart: [...CENTER], cohesion: 6, steady: 0,
    attention: perField(0), steps: perField(0), found: perField(0),
    breakthroughs: [], report: [], ships: [],
    systems: G.systems, homeSys: G.home, places: G.places,
    designs: [
      design('Corvette', 'dart', ['stardrive', { kind: 'reactor', k: 1.5 }, 'shield', 'armor', { kind: 'weapon_system', k: 0.5 }, { kind: 'weapon_energy', n: 2 }]),
      design('Survey ship', 'needle', ['stardrive', { kind: 'reactor', k: 0.5 }, 'lab']),
      design('Colony ship', 'wedge', ['stardrive', { kind: 'reactor', k: 0.75 }, 'habitat', 'lab']),
      design('Research station', 'saucer', ['thruster', { kind: 'reactor', k: 0.5 }, { kind: 'lab', n: 2 }]),
      design('Space dock', 'cradle', [{ kind: 'gantry', w: 4, h: 2 }, { kind: 'reactor', k: 0.25 }]),
      design('Workshop', 'hall', ['works', { kind: 'reactor', k: 0.25 }]),
      design('Research post', 'tower', ['lab', { kind: 'reactor', k: 0.25 }]),
      design('Commons', 'block', ['habitat', { kind: 'reactor', k: 0.25 }]),
    ],
  };
  const home = S.places.find(p => p.id === 'home');
  home.colony = newColony(100, 120);
  home.fresh = perField(0.9);                          // two thousand years of looking at the same sky
  // the standard space dock: a 4 × 2 gantry — whatever fits inside it can be built
  home.colony.structures.push({ id: uid('u'), name: 'Space dock', klass: 'structure', design: cloneDesign(S.designs.find(d => d.name === 'Space dock')), eon: 0 });
  S.attention.life = 4; S.attention.energy = 3; S.attention.materials = 3;
  // what your people already know
  for (const f of ['life', 'materials', 'energy']) {
    S.found[f] = 1;
    const b = rollBreakthrough(S, f, 40, 'Home', 0);
    for (const p of b.props) for (const ch of p.channels) ch.prog = T.startIntegrated;
    S.breakthroughs.push(b);
  }
  return S;
}

// ---------------- the hidden tech tree: field × focus ----------------
const focusMult = (channel, focus) => 0.4 + 2.4 * focus[XS.indexOf(CHANNEL_X[channel])];
export function leanOf(field, focus) {
  const sum = Object.fromEntries(XS.map(x => [x, 0]));
  for (const p of PROPERTIES) {
    if (p.domain !== field) continue;
    for (const a of p.affects) sum[CHANNEL_X[a.channel]] += RARITY[p.rarity].weight * T.baseMag[p.rarity] * focusMult(a.channel, focus);
  }
  const tot = XS.reduce((a, x) => a + sum[x], 0) || 1;
  return XS.map(x => sum[x] / tot);
}

const SYL_A = ['Tes', 'Vael', 'Orr', 'Kyn', 'Sol', 'Mar', 'Ith', 'Dra', 'Qel', 'Nov', 'Ash', 'Bry', 'Cor', 'Zan', 'Lum', 'Ery', 'Hal', 'Ost', 'Pyr', 'Ren'];
const SYL_B = ['sin', 'um', 'ar', 'eth', 'ix', 'on', 'ara', 'ius', 'el', 'ine', 'ach', 'or'];
const NOUNS = {
  materials: ['Lattice', 'Weave', 'Alloy', 'Grain', 'Shell'], fabrication: ['Die', 'Forge', 'Cast', 'Gauge'],
  energy: ['Flame', 'Core', 'Ember', 'Well'], electrics: ['Current', 'Coil', 'Arc', 'Cell'],
  optics: ['Prism', 'Lens', 'Glint', 'Mirror'], thermal: ['Frost', 'Kiln', 'Sink', 'Char'],
  motion: ['Drift', 'Field', 'Pulse', 'Tide'], life: ['Bloom', 'Spore', 'Culture', 'Root'],
  information: ['Cipher', 'Signal', 'Loom', 'Echo'],
};
const pick = (S, list) => list[Math.floor(rand(S) * list.length)];

function rollBreakthrough(S, field, research, origin, eon = S.eon) {
  let n = 1;
  const p = Math.min(0.7, research / 150);                       // more researchers = richer finds (1 to 5 properties)
  while (n < 5 && rand(S) < p) n++;
  const pool = PROPERTIES.filter(x => x.domain === field), chosen = [];
  while (chosen.length < Math.min(n, pool.length)) {
    const left = pool.filter(x => !chosen.includes(x));
    let r = rand(S) * left.reduce((a, x) => a + RARITY[x.rarity].weight, 0);
    chosen.push(left.find(x => (r -= RARITY[x.rarity].weight) <= 0) || left[left.length - 1]);
  }
  const props = chosen.map(pr => {
    const rolled = pr.affects.map(a => ({ channel: a.channel, how: a.how, x: CHANNEL_X[a.channel],
      pct: T.baseMag[pr.rarity] * focusMult(a.channel, S.focus) * (0.7 + 0.6 * rand(S)) }));
    let shown = rolled.filter(c => c.pct >= 3);
    if (!shown.length) shown = [rolled.sort((a, b) => b.pct - a.pct)[0]];
    return { id: pr.id, name: pr.name, rarity: pr.rarity, what: pr.what, muted: rolled.length - shown.length,
      channels: shown.map(c => ({ ...c, pct: Math.max(3, Math.round(c.pct)), prog: 0, helped: 0 })).sort((a, b) => b.pct - a.pct) };
  });
  const top = XS[S.focus.indexOf(Math.max(...S.focus))], spread = Math.max(...S.focus) - Math.min(...S.focus);
  return { id: 'bt' + S.rolls, name: `${pick(S, SYL_A)}${pick(S, SYL_B)} ${pick(S, NOUNS[field])}`, field, fieldName: DOMAINS[field].name,
    eon, origin, under: spread < 0.08 ? null : top, props };
}

export const isIntegrated = b => b.props.every(p => p.channels.every(ch => ch.prog >= 100));
const eachChannel = (S, fn) => { for (const b of S.breakthroughs) b.props.forEach((p, pi) => p.channels.forEach(ch => fn(ch, b, pi))); };
export const shipStats = (S, u, caps) => designStats(S, u.design, caps).t;
const gain = power => clamp(0.4 + power / 50, 0, 2.5);            // how much the researchers on the spot bring out of a place

// ---------------- what this eon will do (nothing is changed here) ----------------
export function compute(S) {
  const caps = allCapsules(S), passive = passiveOf(caps);

  const ships = S.ships.map(u => ({ u, t: designStats(S, u.design, caps).t }));

  // colonies
  const colonies = S.places.filter(pl => pl.colony).map(pl => {
    const P = pl.colony, [si, sr, ss] = P.split, mp = P.people, factor = clamp(0.5 + P.happiness / 120, 0.5, 1.25);
    const flat = { industry: 0, research: 0, social: 0, upkeep: 0, housing: 0 }, gantries = [];
    // the gantries here: the colony's own docks, and any dock of yours parked in orbit
    for (const u of P.structures) { const t = designStats(S, u.design, caps).t; for (const k in flat) flat[k] += t[k] || 0; for (const gt of t.gantries) gantries.push({ ...gt, of: u.name, at: pl.name }); }
    for (const { u, t } of ships) if (!u.dest && u.at === pl.id) for (const gt of t.gantries) gantries.push({ ...gt, of: u.name, at: pl.name });
    const people = { industry: mp * si, research: mp * sr, social: mp * ss };
    const industry = Math.max(0, people.industry * factor + flat.industry - flat.upkeep);
    const research = people.research * factor + flat.research;
    const social = people.social + flat.social;
    const housing = P.baseHousing + flat.housing;
    let left = industry, ahead = 0; const done = [], queue = [];
    for (const item of P.queue) {
      const d = S.designs.find(x => x.id === item.designId);
      if (!d) { queue.push({ item, gone: true }); continue; }
      // anything with an engine is put together in a gantry: whole if it fits, in sections (dearer) if not
      const ds = designStats(S, d, caps).t, fit = ds.klass === 'structure' ? null : dockFit(gantries, ds.hull.area), noDock = ds.klass !== 'structure' && !fit;
      const sections = fit ? fit.sections : 1, cost = ds.cost * (fit ? fit.mult : 1);
      // …and slower: once it is paid for, the sections still have to be joined — eons that cost nothing but time
      const joinNeed = (sections - 1) * T.sectionEons, joinLeft = joinNeed - Math.min(item.joined || 0, joinNeed);
      const need = Math.max(0, cost - item.progress), joining = !noDock && need <= 1e-6 && joinLeft > 0;
      const spend = noDock ? 0 : Math.min(left, need);
      left -= spend; if (!noDock) ahead += need;
      const finishes = !noDock && spend >= need - 1e-6 && (joining ? joinLeft <= 1 : joinLeft <= 0);
      const eta = noDock ? Infinity : need <= 1e-6 ? Math.max(1, joinLeft) : industry > 0 ? Math.max(1, Math.ceil(ahead / industry - 1e-9)) + joinLeft : Infinity;
      queue.push({ item, d, ds, noDock, fit, sections, cost, need, spend, joining, joinNeed, joinLeft, finishes, eta });
      if (finishes) done.push({ item, d, ds, sections });
    }
    const spare = left;
    const food = social * T.foodPerSocial + spare * T.foodPerSpare, eat = mp * T.foodPerHead, surplus = food - eat;
    let dPeople = surplus >= 0 ? surplus * T.growthPerFood : surplus * T.starvePerFood;
    const full = mp >= housing - 1e-6;
    if (dPeople > 0) dPeople = Math.max(0, Math.min(dPeople, housing - mp));        // nowhere to live = no growth
    if (mp > housing + 0.5) dPeople = Math.min(dPeople, -1);                        // overcrowded
    const happyTarget = clamp(20 + 120 * ss, 0, 100), happiness = P.happiness + (happyTarget - P.happiness) * 0.3;
    return { pl, P, people, factor, flat, industry, research, social, gantries, housing, full, queue, done, spare, food, eat, surplus, dPeople, happiness, happyTarget };
  });

  // who is studying what: research power on the ground and in orbit, place by place
  const ground = {}, orbit = {}, sysResearch = {}, sysOfPlace = Object.fromEntries(S.places.map(p => [p.id, p.sys]));
  const inSys = (sys, v) => { sysResearch[sys] = (sysResearch[sys] || 0) + v; };
  for (const c of colonies) { ground[c.pl.id] = c.research; inSys(c.pl.sys, c.research); }
  for (const { u, t } of ships) if (!u.dest && t.research > 0) { orbit[u.at] = (orbit[u.at] || 0) + t.research; inSys(sysOfPlace[u.at], t.research); }
  const research = colonies.reduce((a, c) => a + c.research, 0) + ships.reduce((a, s) => a + (s.u.dest ? 0 : s.t.research), 0);
  // a star is also studied, from afar, by every other lab in its own system
  const power = pl => (ground[pl.id] || 0) + (orbit[pl.id] || 0) * T.orbit + (pl.kind === 'star' ? Math.max(0, (sysResearch[pl.sys] || 0) - (orbit[pl.id] || 0)) * T.starShare : 0);
  const studied = S.places.map(pl => ({ pl, power: power(pl), onGround: ground[pl.id] || 0, inOrbit: orbit[pl.id] || 0 }));

  // potential of each field = every place being studied, combined
  const points = FIELD_IDS.reduce((a, f) => a + (S.attention[f] || 0), 0);
  const fields = FIELD_IDS.map(f => {
    const sources = studied.filter(s => s.power > 0).map(s => ({ place: s.pl, c: Math.min(1, Math.max(T.floor, s.pl.mult[f] * s.pl.fresh[f] * gain(s.power))) }));
    const potential = 1 - sources.reduce((a, s) => a * (1 - s.c), 1);
    const share = (S.attention[f] || 0) / T.attention;
    return { id: f, name: DOMAINS[f].name, potential, stars: potential * 10, share, chance: potential * share, points: S.attention[f] || 0,
      sources: sources.sort((a, b) => b.c - a.c), lean: leanOf(f, S.focus) };
  });

  const cohesionGain = colonies.reduce((a, p) => a + p.social, 0) * T.cohesionPerSocial;
  const moveDist = focusDistance(S.focusStart, S.focus), moveCost = moveDist * T.focusCost;
  const moved = moveDist > 0.005, steadyNext = moved ? 0 : (S.steady || 0) + 1;
  const setback = Math.floor(moveDist * T.focusSetback);
  const speed = T.integrate * (1 + Math.min(steadyNext, 10) * T.steadyBonus) * clamp(Math.sqrt(research / 33), 0.5, 3);
  return { colonies, ships, studied, research, sysResearch, fields, points, warp: fleetWarp(passive), free: T.attention - points, cohesionGain, moveDist, moveCost, moved, steadyNext, setback, speed,
    people: colonies.reduce((a, c) => a + c.P.people, 0) + S.ships.reduce((a, u) => a + (u.people || 0), 0), passive, caps };
}

// ---------------- orders ----------------
// eons a star drive needs to cross between two stars
export const starEons = (dist, warp = 1) => Math.max(2, Math.ceil(dist / (T.starSpeed * Math.max(0.1, warp))));
export function sysDistance(S, a, b) { const A = S.systems.find(s => s.id === a), B = S.systems.find(s => s.id === b); return A && B ? Math.hypot(A.x - B.x, A.y - B.y) : 0; }
// Inside a system: a star drive arrives next eon, thrusters crawl. Between stars: star drives only, by distance.
export function sendShip(S, shipId, placeId) {
  const u = S.ships.find(x => x.id === shipId), to = S.places.find(p => p.id === placeId);
  if (!u || !to || u.at === placeId) return 'It is already there';
  const from = S.places.find(p => p.id === u.at);
  let eta = T.travel[u.klass];
  if (from.sys !== to.sys) {
    if (u.klass !== 'starship') return 'Only a star drive can leave the system';
    if (shipStats(S, u).underDriven) return 'Its star drive is too small for its bulk: it cannot leave the system';
    eta = starEons(sysDistance(S, from.sys, to.sys), fleetWarp(passiveOf(allCapsules(S))));   // the same speed for the whole fleet
  }
  if (!eta) return 'It has no engine';
  u.dest = placeId; u.eta = eta; u.trip = eta;
  return null;
}
export function recallShip(S, shipId) { const u = S.ships.find(x => x.id === shipId); if (u) { u.dest = null; u.eta = 0; } }
// A ship that carries people founds a colony where it lands: the ship itself becomes the first building.
export function settle(S, shipId) {
  const u = S.ships.find(x => x.id === shipId), pl = u && S.places.find(p => p.id === u.at);
  if (!u || u.dest || !pl) return 'The ship is not there yet';
  if (!pl.landable) return `Nothing can land on ${pl.name}`;
  if (pl.colony) return `${pl.name} is already settled`;
  if (!(u.people > 0)) return 'There are no people on board';
  pl.colony = newColony(u.people, 0);
  pl.colony.structures.push({ id: uid('u'), name: 'Landed ' + u.name, klass: 'structure', design: u.design, eon: S.eon });
  S.ships = S.ships.filter(x => x !== u);
  return null;
}

// ---------------- end the eon ----------------
export function endEon(S) {
  const c = compute(S), rep = [];
  for (const pc of c.colonies) {
    const P = pc.P, name = pc.pl.name;
    for (const q of pc.queue) if (!q.gone) { q.item.progress += q.spend; if (q.joining) q.item.joined = (q.item.joined || 0) + 1; }
    for (const { d, ds, sections } of pc.done) {
      const unit = { id: uid('u'), name: d.name, klass: ds.klass, design: cloneDesign(d), eon: S.eon };
      if (sections > 1) unit.sections = sections;                 // put together from sections — the hull remembers
      if (ds.klass === 'structure') P.structures.push(unit);
      else {
        unit.at = pc.pl.id; unit.dest = null; unit.eta = 0;
        unit.people = ds.housing > 0 ? Math.max(0, Math.min(ds.housing, P.people - 5)) : 0;     // settlers leave with the ship
        P.people -= unit.people;
        S.ships.push(unit);
      }
      rep.push({ kind: 'build', text: `${name}: built ${d.name}` + (sections > 1 ? ` in ${sections} sections` : '') + (unit.people ? ` — ${Math.round(unit.people)} people went aboard` : '') });
    }
    const doneIds = new Set(pc.done.map(x => x.item.id));
    P.queue = P.queue.filter(q => !doneIds.has(q.id) && S.designs.some(d => d.id === q.designId));
    for (const q of pc.queue) if (q.noDock && !q.item.warned) { q.item.warned = true; rep.push({ kind: 'bad', text: `${name}: ${q.d.name} cannot be built — there is no space dock here` }); }
    const before = P.people;
    P.people = Math.max(1, P.people + pc.dPeople);
    if (pc.surplus < 0) rep.push({ kind: 'bad', text: `${name}: not enough food — ${(before - P.people).toFixed(1)} people lost` });
    P.happiness = pc.happiness;
  }

  // ships under way
  for (const u of S.ships) {
    if (!u.dest) continue;
    if (--u.eta <= 0) { u.at = u.dest; u.dest = null; rep.push({ kind: 'move', text: `${u.name} arrived at ${S.places.find(p => p.id === u.at).name}` }); }
  }

  // integration
  S.steady = c.steadyNext;
  const done = [];
  eachChannel(S, (ch, b) => {
    if (ch.prog >= 100) return;
    ch.prog = Math.min(100, ch.prog + c.speed);
    if (ch.prog >= 100) done.push(`${ch.channel.replace(/_/g, ' ')} (${b.name})`);
  });
  if (done.length) {
    rep.push({ kind: 'integ', text: `Fully integrated: ${done.slice(0, 4).join(', ')}${done.length > 4 ? ` and ${done.length - 4} more` : ''}` });
    const dead = new Set(allCapsules(S).filter(x => x.done).map(x => x.id));
    const clean = d => { for (const m of d.modules) m.caps = m.caps.filter(id => !dead.has(id)); };
    S.designs.forEach(clean); S.ships.forEach(u => clean(u.design));
    for (const pl of S.places) if (pl.colony) pl.colony.structures.forEach(u => clean(u.design));
  }

  // the focus moved: some of what was half-understood is lost
  if (c.setback > 0) for (const f of FIELD_IDS) S.steps[f] = Math.max(0, S.steps[f] - c.setback);

  // research: every field you give attention to may take one hidden step
  for (const f of c.fields) {
    if (!(f.chance > 0) || rand(S) >= f.chance) continue;
    if (++S.steps[f.id] < T.steps) { rep.push({ kind: 'step', text: `Researchers report progress in ${f.name}` }); continue; }
    S.steps[f.id] = 0; S.found[f.id]++;
    // which place gave it up — and that place has a little less left to give
    let r = rand(S) * f.sources.reduce((a, s) => a + s.c, 0);
    const src = f.sources.find(s => (r -= s.c) <= 0) || f.sources[0];
    if (src) src.place.fresh[f.id] = Math.max(T.floor / Math.max(src.place.mult[f.id], 0.01), src.place.fresh[f.id] * T.wear);
    const b = rollBreakthrough(S, f.id, c.research, src ? src.place.name : 'Home');
    let helped = 0;
    const mine = new Set(b.props.flatMap(p => p.channels.map(ch => ch.channel)));
    eachChannel(S, ch => { if (mine.has(ch.channel) && ch.prog < 100) { ch.prog = Math.min(99.9, ch.prog + T.reinforce); ch.helped = (ch.helped || 0) + 1; helped++; } });
    S.breakthroughs.unshift(b);
    rep.push({ kind: 'breakthrough', text: `Breakthrough in ${f.name}, found at ${b.origin}: ${b.name}` + (helped ? ` — helps integrate ${helped} older capsule${helped > 1 ? 's' : ''}` : ''), id: b.id });
  }

  S.cohesion = Math.max(0, S.cohesion + c.cohesionGain - c.moveCost);
  if (c.moved) rep.push({ kind: 'focus', text: `Society shifted its focus (−${c.moveCost.toFixed(1)} cohesion)` + (c.setback ? ` — ${c.setback} step${c.setback > 1 ? 's' : ''} of research lost in every field` : '') });
  S.focusStart = [...S.focus];
  S.report = rep; S.eon++;
  return rep;
}

// hand one more point of attention to a field; with none left it is taken from the field that has the most
export function giveAttention(S, field, d) {
  const total = FIELD_IDS.reduce((a, f) => a + (S.attention[f] || 0), 0);
  if (d < 0) { S.attention[field] = Math.max(0, (S.attention[field] || 0) - 1); return; }
  if (total >= T.attention) {
    const from = FIELD_IDS.filter(f => f !== field && S.attention[f] > 0).sort((a, b) => S.attention[b] - S.attention[a])[0];
    if (!from) return;
    S.attention[from]--;
  }
  S.attention[field] = (S.attention[field] || 0) + 1;
}
