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
import { DISTRICT, FACTORS, gridOf, employed } from './districts.js';
import { newSurface, capsOf, building, developStep, creepFillet, isFull, SLOT, DEV, FILLET, LEVEL1, KIND_WORD } from './colony.js';
import { sizeFatigue, createBattle, shipFromDesign, rng32 } from './battle.js';
import { composePlan, buildPlan, naturalShips, planStrip, TACTIC_IDS, TACTICS } from './fleetplan.js';

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
  // COHESION (his spec, 2026-10-16) runs 0–100 and climbs an asymptote: each eon adds rate × (1 − c/100)^curve — 85 comes in a
  // reasonable time (~30 eons), 95 takes twice that, 100 (a hive mind) never quite. The reach of the focus is c/100 of the centre-to-corner distance; a move
  // spends 100 × its length (exhausting the sphere leaves the floor, 3 %) and shocks the people by the share of the sphere it used
  cohesionRate: 8, cohesionCurve: 1.3, cohesionFloor: 3, moveShock: 60,
  // POLLUTION, per world: a share held past half for long builds one up — industrial (people sicken, fewer), docile (a soft
  // society: industry and research slacken), aloof (a bookish one: the social share slackens); easing off cleans it up
  pol: { rate: 10, max: 0.33, sicken: 0.01 },
  // UPKEEP (his ask, 2026-10-16), paid from the EXCESS — the industry that flows to the reserves — and then from the reserves:
  // military (a share of the fleet's worth an eon), social (per million people), research (per point). Unpaid, the fleet wears,
  // people grumble and research slows, each by the unpaid share. Structures' own upkeep stays what it was: industry on the spot.
  upkeep: { military: 0.002, social: 0.01, research: 0.03, wear: 10, grumble: 20, slow: 0.3 },
  ground: { militia: 0.01, ratio: 5, mood: 20 },     // CONQUEST (his rule, 2026-10-16): a colony's militia = 1 in 100 of its people; a trooper landed is worth 5 of them (his 5:1); a blockade sours the mood by 20
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
  starSpeed: 5.4,          // map distance a plain star drive covers between stars in one eon = 1.2 light years (VOY.speed × LY; was 12)
  sectionEons: 1,          // a hull too big for the gantry: eons spent joining it, for every extra section
  // a NEW COLONY's natural room (millions of people) before any habitat is built: a living world takes many, a harsh one few
  room: { living: 60, ocean: 30, ice: 15, other: 5 },
  // HIS ECONOMY (2026-10-16): the social share feeds everyone first and what is left of it builds ROOM (no habitats to order), up
  // to the world's cap — "a thousand" on a living world; a harsh world's bubbles allow far less (placeholders until the bubbles
  // are designed). The industry share builds the queue, then FACTORIES (one per pop at most, each a flat trickle of industry),
  // then RESERVES — stored industry, the empire's money. A big society must keep industry and research at work for its own sake
  // (SUSTAIN): nothing to 100 M, 30 % / 20 % of its pops' worth at 500 M and past; short of it, unrest.
  housePerSocial: 0.5,     // room (M) a million social people build in an eon, once everyone is fed
  cap: { living: 1000, ocean: 800, ice: 300, other: 100 },
  factoryCost: 10, factoryOut: 1,
  sustain: { from: 100, to: 500, industry: 0.3, research: 0.2, unrest: 0.03 },
};
// WATER: farms grow only where there is water — living, ocean and ice worlds, and some moons (a moon's water is rolled at
// birth; an older save's moons draw it from their id, so the same moon always answers the same)
export const waterOf = pl => { const w = worldOf(pl); if (w === 'living' || w === 'ocean' || w === 'ice') return true; if (pl.kind !== 'moon') return false; if (pl.water != null) return !!pl.water; let h = 0; for (const ch of String(pl.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 5 < 2; };
// PEOPLE are counted in MILLIONS on a world. A habitat on a SHIP holds a thousandth of a planet's (his call, 2026-10-15: "a
// habitat on a planet, one unit is a million people; on a ship, a thousand"); a ship that LANDS as a colony's first building
// works at an outpost's scale — its fabricators and labs at a hundredth, its habitats at a thousandth — and at the GRADE it
// arrived in (the stamina it had left: a hard crossing lands people and equipment worn).
export const SCALE = { shipHousing: 1 / 1000, landed: { industry: 1 / 100, research: 1 / 100, social: 1 / 100, housing: 1 / 1000 } };
const WORLD_BY_COLOR = { '#5fc48a': 'living', '#4fa3ff': 'ocean', '#bfe6ff': 'ice' };
export const worldOf = pl => WORLD_BY_COLOR[pl.color] || 'other';

// STAR TRAVEL (his design, 2026-10-15). Distances between stars in LIGHT YEARS (LY map units each — a neighbouring star is
// about 3–4). Every starship has a RANGE: its drive's margin over its bulk (√, up to ×2), shorter the bigger and dearer it
// is (the battle's size fatigue), longer with drive breakthroughs. A FLEET sent together shares one range: the mass-weighted
// average of its ships — a big capable ship carries the others, a big weak one drags them. Within range a crossing is a stroll
// (its CHANCE is range ÷ distance, 140 % and up). Past it the chance falls — 90 % one light year out, 70 % two, 40 % three,
// 10 % four, 1 % beyond — and the ship CRAWLS (speed × 1 − (out/5)²). Every eon spent past its range, each ship rolls:
// it loses (100 − the chance where it is) × (1 − the roll) of its STAMINA — a perfect roll costs nothing, the worst costs it
// all. At 0 stamina the ship is a DERELICT where it stands. People aboard die with the stamina they lose. A fleet can be
// called back at any time: the way back counts on the same voyage, so past halfway turning round is as dear as going on.
// Stamina comes back only in a star system, never in between: a little a turn, more with a fabricator aboard, more again
// where you have a colony.
export const LY = 4.5;
export const VOY = { range: 4, speed: 1.2, fall: 0.1, pow: 1.585, floor: 0.01, slow: 5, minSpeed: 0.1, marginMax: 4 };
// THE SPHERE OF INFLUENCE (his mechanic, 2026-10-16): every colony throws a bubble — blue inside ZONE.radius(people) light years,
// then green, yellow, orange, red a light year each — and the bubbles merge into your region. Inside it a resting ship RESTOCKS
// (stamina an eon: blue all of it, green 25, yellow 15, orange 8, red 3; a fabricator aboard ×1.5) and its STRAIN heals; in open
// space neither. Flight in the blue is free, in the green half of it counts, from the yellow out every light year counts — and
// the strain STACKS from hop to hop outside: no star out there resets it. Range extenders and cohesion may widen it later.
export const ZONE = { band: 1, radius: people => 2 + 1.2 * Math.log(1 + Math.max(0, people) / 10), recover: [100, 25, 15, 8, 3, 0], heal: [Infinity, 2, 1, 0.5, 0.25, 0], strain: [0, 0.5, 1, 1, 1, 1],
  names: ['blue', 'green', 'yellow', 'orange', 'red', 'open space'], colors: ['#4da3ff', '#7ef3b0', '#ffd26a', '#ffb347', '#ff7979'] };
// A CACHE PER STATE (2026-10-17: a 150-star, five-empire simulation crawled — every distance looked a star up by a linear scan,
// every zone rebuilt the bubbles, every crossing sampled 24 zones): what never changes (stars by id, star distances) is kept
// for the state's life; the bubbles and the crossings' strain are kept while the colonies' people stand (they move at the eon's end,
// a settlement or a capture). A WeakMap: nothing is written on the state, so a save stays a save.
const CACHE = new WeakMap();
const cacheOf = S => { let c = CACHE.get(S); if (!c || c.systems !== S.systems) { c = { systems: S.systems, byId: new Map(S.systems.map(s => [s.id, s])), dist: new Map(), bubSig: null, bubbles: null, eff: new Map() }; CACHE.set(S, c); } return c; };
export const sysById = (S, id) => cacheOf(S).byId.get(id);
const bubSigOf = S => { let n = 0, sum = 0; for (const p of S.places) if (p.colony) { n++; sum += p.colony.people; } return S.eon + ':' + n + ':' + Math.round(sum * 1000); };
export const bubbles = S => {
  const c = cacheOf(S), sig = bubSigOf(S); if (c.bubSig === sig) return c.bubbles;
  c.bubSig = sig; c.eff.clear();
  return c.bubbles = S.places.filter(p => p.colony).map(p => { const s = c.byId.get(p.sys); return s ? { sys: p.sys, x: s.x, y: s.y, r: ZONE.radius(p.colony.people) } : null; }).filter(Boolean);
};
export function zoneAt(S, x, y) {                    // 0 blue … 4 red, 5 open space — at a point of the map (map units)
  let best = 5;
  for (const b of bubbles(S)) { const d = Math.hypot(x - b.x, y - b.y) / LY - b.r, z = d <= 0 ? 0 : Math.min(5, Math.ceil(d / ZONE.band)); if (z < best) best = z; }
  return best;
}
export const zoneOfSys = (S, sysId) => { const s = sysById(S, sysId); return s ? zoneAt(S, s.x, s.y) : 5; };
// the light years of STRAIN a crossing between two stars costs (the flight sampled along the line: free in the blue, half in the green)
export function effectiveLy(S, a, b) {
  const c = cacheOf(S); bubbles(S);                  // (refreshes the bubbles, and empties this memo when they moved)
  const key = a + '|' + b, had = c.eff.get(key); if (had !== undefined) return had;
  const A = c.byId.get(a), B = c.byId.get(b); if (!A || !B) return 0;
  const d = Math.hypot(A.x - B.x, A.y - B.y) / LY, N = 24; let eff = 0;
  for (let i = 0; i < N; i++) { const k = (i + 0.5) / N; eff += ZONE.strain[zoneAt(S, A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k)]; }
  const v = d * eff / N; c.eff.set(key, v); return v;
}
export const shipRange = (t, warp = 1) => t.klass !== 'starship' || t.underDriven ? 0 : VOY.range * Math.sqrt(clampN(t.lift / Math.max(1, t.volume), 1, VOY.marginMax)) * (1 - sizeFatigue(t.cost)) * warp;
// the chance at `x` light years travelled on a range of `R` (above 1 = a stroll); the speed there, as a share of full
export const chanceAt = (x, R) => x <= R ? (R > 0 ? R / Math.max(x, 0.01) : 0) : Math.max(VOY.floor, 1 - VOY.fall * Math.pow(x - R, VOY.pow));
export const speedAt = (x, R) => x <= R ? 1 : Math.max(VOY.minSpeed, 1 - Math.pow((x - R) / VOY.slow, 2));
// what a crossing will be like, before it is made: eons, the chance at the far end, stamina left on the way in — expected
// (every roll a middling one) and at worst (every roll the worst)
// `effShare`: how much of the way counts as strain (effectiveLy / the distance — inside the bubble less than all of it)
export function forecast(R, left, warp = 1, travelled = 0, st = 100, effShare = 1) {
  let x = travelled, need = left, eons = 0, exp = 0, worst = 0;
  while (need > 1e-9 && eons < 400) { const step = Math.min(need, VOY.speed * warp * speedAt(x, R)); x += step * effShare; need -= step; eons++; const F = 100 * Math.max(0, 1 - chanceAt(x, R)); exp += F / 2; worst += F; }
  return { eons, chance: chanceAt(x, R), expected: Math.max(0, st - exp), worst: Math.max(0, st - worst), lost: worst >= st };
}
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
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
// a shuffle that draws exactly n−1 dice whatever the engine (never `sort(() => r() - 0.5)`: the comparator-call count is the sort's business)
export function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function rand(S) {
  let t = (S.seed + Math.imul(0x6D2B79F5, ++S.rolls)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const perField = v => Object.fromEntries(FIELD_IDS.map(f => [f, typeof v === 'function' ? v(f) : v]));
// a colony: its people, the room it was born with, the planet's triangle (industry / research / DEVELOPMENT), the production line —
// and its SURFACE (colony.js): the world's cells of four slots, the development focus, the fillet (`home`: the homeworld's old city)
export const newColony = (people, baseHousing = 0, pl = null, home = false) => ({ people, baseHousing, split: [1 / 3, 1 / 3, 1 / 3], happiness: 60, queue: [], structures: [], factories: 0, surface: pl ? surfaceFor(pl, home) : null });
export function surfaceFor(pl, home = false) { const g = gridOf(pl); return g ? newSurface({ w: g.w, h: g.h, seed: pl.id + '|ground', home, water: waterOf(pl) }) : null; }
// an OLDER colony gets a surface (2026-10-18 morning: cells developed to district designs — each becomes four slots by its design's
// mix, largest remainders first; before that: no cells — a fresh surface); the development queue of the old designs is dropped
const LEGACY_MIX = { 'dist-mixed': [0.25, 0.25, 0.25, 0.25], 'dist-housing': [0, 0.3, 0.7, 0], 'dist-farms': [0, 0.7, 0.3, 0], 'dist-foundry': [0.7, 0, 0.3, 0], 'dist-campus': [0, 0, 0.3, 0.7] };   // industry, food, housing, science
function migrateColony(S, pl) {
  const P = pl.colony, g = gridOf(pl); if (P.surface !== undefined && P.surface !== null) return P.surface; if (!g) return null;
  if (!Array.isArray(P.cells)) { P.surface = surfaceFor(pl, pl.id === (S.homePlace || 'home')); delete P.develop; return P.surface; }
  const G = newSurface({ w: g.w, h: g.h, seed: pl.id + '|ground', water: waterOf(pl) }); G.cells.forEach(c => { c.slots = []; });
  let first = -1;
  P.cells.forEach((cell, i) => {
    if (!cell || !cell.design || i >= G.cells.length) return;
    const d = (S.districts || []).find(x => x.id === cell.design), mix = d ? FACTORS.map(f => d.mix[f] || 0) : LEGACY_MIX[cell.design] || LEGACY_MIX['dist-mixed'];
    const t = mix.reduce((a, v) => a + v, 0) || 1, raw = mix.map(v => v / t * SLOT.per), n = raw.map(Math.floor), r = SLOT.per - n.reduce((a, v) => a + v, 0);
    raw.map((v, k) => [v - n[k], k]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, r).forEach(([, k]) => n[k]++);
    FACTORS.forEach((f, k) => { for (let m = 0; m < n[k]; m++) G.cells[i].slots.push(f); });
    if (first < 0) first = i;
  });
  if (first >= 0) G.landing = first; else G.cells[G.landing].slots = waterOf(pl) ? ['housing', 'food'] : ['housing', 'industry'];
  delete P.cells; delete P.develop; P.surface = G; return G;
}
const surfaceOf = (S, pl) => migrateColony(S, pl);    // a world snapshot from before the slots meets the engine here (upgrade() does it for a save)

// a starting design: a silhouette and a list of modules ({ kind, n?, w/h for a gantry, k for a reactor })
function design(name, hull, kinds) {
  return { id: uid('d'), name, hull, modules: kinds.map(k => { const o = typeof k === 'string' ? { kind: k } : k; return { id: uid('m'), caps: [], n: 1, ...o }; }) };
}
export const cloneDesign = d => ({ id: d.id, name: d.name, hull: d.hull, modules: d.modules.map(m => ({ ...m, caps: [...m.caps] })) });

export function newState(seed = 7, o = {}) {           // o.galaxy: { count, radius } for a bigger sector (galaxy.js galaxyOf)
  const G = generateGalaxy(seed, o.galaxy || {});       // the same seed always gives the same galaxy
  const S = {
    version: 9, seed, rolls: 0, eon: 1, derelicts: [], galaxy: { count: G.count, radius: G.radius },
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
  spawnHostiles(S);
  S.slotLevels = { ...LEVEL1 };                         // the empire's four slot kinds, one global design each (colony.js); breakthroughs will raise them
  const home = S.places.find(p => p.id === 'home');
  home.colony = newColony(100, 120, home, true);
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

  // the focus this eon: how far cohesion lets it move, how far it has, what that costs, and the shock to the people
  const reach = clamp(S.cohesion / 100, 0, 1), moveDist = focusDistance(S.focusStart, S.focus), moveCost = Math.min(S.cohesion, moveDist * 100);
  const moved = moveDist > 0.005, shock = moved && reach > 1e-6 ? clamp(moveDist / reach, 0, 1) : 0;
  // colonies
  const colonies = S.places.filter(pl => pl.colony).map(pl => {
    const P = pl.colony, [si, sr, sd] = P.split, mp = P.people, factor = clamp(0.5 + P.happiness / 120, 0.5, 1.25);
    // pollution's drag (a share held past half for long builds its own up): industrial — people sicken; docile (the development
    // corner) — industry and research slacken; aloof (the research corner) — the builders slacken
    const pol = P.pol || { industry: 0, research: 0, social: 0 }, docile = 1 - T.pol.max * pol.social / 100, aloof = 1 - T.pol.max * pol.research / 100;
    const flat = { industry: 0, research: 0, social: 0, upkeep: 0, housing: 0 }, gantries = [];
    // the gantries here: the colony's own docks, and any dock of yours parked in orbit
    for (const u of P.structures) {
      const t = designStats(S, u.design, caps).t, L = u.landed ? SCALE.landed : null, grade = u.landed ? clamp(u.grade ?? 1, 0.05, 1) : 1;   // a landed ship works at an outpost's scale and its arrival grade
      for (const k in flat) flat[k] += (t[k] || 0) * (L ? (L[k] ?? 1) * grade : 1);
      for (const gt of t.gantries) gantries.push({ ...gt, of: u.name, at: pl.name });
    }
    for (const { u, t } of ships) if (!u.dest && u.at === pl.id) for (const gt of t.gantries) gantries.push({ ...gt, of: u.name, at: pl.name });
    const people = { industry: mp * si, research: mp * sr, development: mp * sd };
    // THE SURFACE (his design, 2026-10-18 — colony.js): cells of four slots, industry / food / housing / science. The slots are the
    // CAPACITY — works and labs that employ the triangle's hands (the rest work at idle), homes, farms that feed; the triangle is the
    // EFFORT, and its third corner, DEVELOPMENT, builds the next slot toward the colony's development focus. A pure cell takes the focus shock.
    const G = surfaceOf(S, pl), water = waterOf(pl), grid = gridOf(pl), cellsAll = grid ? grid.w * grid.h : 0;
    const { cap, perCell } = G ? capsOf(G, { levels: S.slotLevels || LEVEL1, shock }) : { cap: { industry: 0, food: 0, housing: 0, science: 0, cells: 0, scienceShare: 0, pure: 0, slots: 0 }, perCell: [] };
    // FOOD from the farms (the M people they feed; a landed ship's social systems add theirs) — only where there is water (his spec,
    // 2026-10-16): without it the settlers live on their stores — no food, no growth, no famine — until supply lines exist (later)
    const eat = mp * T.foodPerHead, food = water ? cap.food * T.foodPerHead + flat.social * T.foodPerSocial : 0, surplus = water ? food - eat : 0;
    const fed = water ? clamp(food / Math.max(1e-9, eat), 0, 1) : 1, hungry = 1 - DISTRICT.hunger * (1 - fed);   // a hungry planet works worse (his strain)
    const industry = Math.max(0, employed(people.industry, cap.industry) * factor * docile * hungry + flat.industry + (P.factories || 0) * T.factoryOut - flat.upkeep);   // the factories: a flat trickle each
    const research = employed(people.research, cap.science) * factor * docile * hungry + flat.research;
    const housing = P.baseHousing + flat.housing + cap.housing;
    const blockaded = P.blockaded || 0;              // BLOCKADED by another empire's fleet (world.js): nothing gets built, nothing reaches the reserves, nobody grows, the mood sours
    const dev = blockaded ? 0 : people.development * DEV.perM * aloof * hungry;   // the builders' points this eon
    // THE PRODUCTION LINE (his ask, 2026-10-18): the top item takes the industry; a unit paid for leaves the rest to the next unit of the
    // same item (an item is N of one design), then to the next item; what nobody needs makes factories, then reserves
    let left = blockaded ? 0 : industry, ahead = 0; const done = [], queue = [];
    for (const item of P.queue) {
      const d = S.designs.find(x => x.id === item.designId);
      if (!d) { queue.push({ item, gone: true }); continue; }
      // anything with an engine is put together in a gantry: whole if it fits, in sections (dearer) if not
      const ds = designStats(S, d, caps).t, fit = ds.klass === 'structure' ? null : dockFit(gantries, ds.hull.area), noDock = ds.klass !== 'structure' && !fit;
      const sections = fit ? fit.sections : 1, cost = ds.cost * (fit ? fit.mult : 1), count = Math.max(1, Math.round(item.count || 1));
      // …and slower: once paid for, the sections still have to be joined — eons that cost nothing but time (one unit at a time)
      const joinNeed = (sections - 1) * T.sectionEons, joinLeft = joinNeed - Math.min(item.joined || 0, joinNeed);
      const need = Math.max(0, cost - (item.progress || 0)), aheadBefore = ahead;
      let p = item.progress || 0, j = item.joined || 0, built = 0, spend = 0, joining = false;
      if (!noDock) for (let k = 0; k < count; k++) {
        const nd = Math.max(0, cost - p), jl = joinNeed - Math.min(j, joinNeed);
        if (nd <= 1e-6 && jl > 0) { joining = true; j++; if (jl <= 1) { built++; p = 0; j = 0; } break; }   // joining takes the eon
        const put = Math.min(left, nd); left -= put; spend += put; p += put;
        if (p < cost - 1e-6 || jl > 0) break;        // not paid yet, or paid and the joining starts next eon
        built++; p = 0; j = 0;                       // a whole unit: the next one starts on what is left
      }
      if (!noDock) ahead += need + cost * (count - 1);
      const eta = noDock ? Infinity : need <= 1e-6 ? Math.max(1, joinLeft) : industry > 0 ? Math.max(1, Math.ceil((aheadBefore + need) / industry - 1e-9)) + joinLeft : Infinity;
      const etaAll = noDock ? Infinity : industry > 0 ? Math.max(1, Math.ceil(ahead / industry - 1e-9)) + joinLeft + joinNeed * (count - 1) : Infinity;
      queue.push({ item, d, ds, noDock, fit, sections, cost, count, need, spend, joining, joinNeed, joinLeft, built, finishes: built > 0, eta, etaAll, progressAfter: p, joinedAfter: j });
      for (let k = 0; k < built; k++) done.push({ item, d, ds, sections });
    }
    // ROOM: the homes on the surface (and the room the colony was born with); a world of homes is the ceiling
    const roomCap = P.baseHousing + flat.housing + cellsAll * SLOT.per * SLOT.cap.housing, houses = 0;
    // the industry nothing in the line needed builds FACTORIES (one per pop at most), and past that it piles up RESERVES — stored industry, the empire's money
    const spare = left, canBuild = Math.max(0, Math.floor(mp) - (P.factories || 0)), newFactories = Math.min(canBuild, Math.floor(spare / T.factoryCost)), toReserves = spare - newFactories * T.factoryCost;
    // SUSTAIN: a big society needs industry and research at work for its own sake; short of it, unrest — people leave, the mood sours
    const ramp = Math.pow(clamp((mp - T.sustain.from) / (T.sustain.to - T.sustain.from), 0, 1), 2), needI = ramp * T.sustain.industry * mp, needR = ramp * T.sustain.research * mp;
    const short = Math.max(0, needI > 0 ? 1 - industry / needI : 0, needR > 0 ? 1 - research / needR : 0);
    let dPeople = surplus >= 0 ? surplus * T.growthPerFood * (1 + DISTRICT.health * cap.scienceShare) : surplus * T.starvePerFood;   // science across the cells = health: faster growth
    const full = mp >= housing - 1e-6;
    if (dPeople > 0) dPeople = Math.max(0, Math.min(dPeople, housing - mp));        // nowhere to live = no growth
    if (mp > housing + 0.5) dPeople = Math.min(dPeople, -1);                        // overcrowded
    dPeople -= mp * short * T.sustain.unrest + mp * pol.industry / 100 * T.pol.sicken;   // unrest, and the sick of an industrial world
    if (blockaded && dPeople > 0) dPeople = 0;
    // the MOOD: science across the cells is also health, care, learning, entertainment (his words) — 25 % of it sits where a third of
    // the people in the social corner sat before (60)
    const happyTarget = clamp(20 + 160 * cap.scienceShare - 60 * short - T.moveShock * shock - 0.3 * pol.industry - T.upkeep.grumble * clamp(S.unpaid || 0, 0, 1) - (blockaded ? T.ground.mood : 0), 0, 100), happiness = P.happiness + (happyTarget - P.happiness) * 0.3;
    const polNext = { industry: clamp(pol.industry + (si - 0.5) * T.pol.rate, 0, 100), research: clamp(pol.research + (sr - 0.5) * T.pol.rate, 0, 100), social: clamp(pol.social + (sd - 0.5) * T.pol.rate, 0, 100) };
    // THE FILLET's targets and what the colony is SHORT of (colony.js): idle works and labs, hunger and empty homes, a surplus nobody eats
    const staffed = { industry: cap.industry > 0 ? Math.min(1, people.industry / cap.industry) : 1, science: cap.science > 0 ? Math.min(1, people.research / cap.science) : 1 };
    const want = { industry: staffed.industry, science: staffed.science, housing: fed * Math.min(1, mp * FILLET.empty / Math.max(1, housing)), food: water && food > 0 ? Math.min(1, eat / food) : 1 };
    const lack = { food: water && food < eat, housing: housing < mp, industry: people.industry > cap.industry, science: people.research > cap.science };
    const next = G && !blockaded ? building(G, { noFood: !water, lack }) : null;
    return { pl, P, people, factor, flat, industry, research, food, gantries, housing, full, queue, done, spare, eat, surplus, fed, hungry, dPeople, happiness, happyTarget,
      water, roomCap, houses, factories: P.factories || 0, newFactories, toReserves, needI, needR, short, pol, polNext, blockaded, cap, perCell, grid, cellsAll, G, dev, staffed, want, lack, next };
  });
  // who is studying what: research power on the ground and in orbit, place by place
  const ground = {}, orbit = {}, sysResearch = {}, sysOfPlace = Object.fromEntries(S.places.map(p => [p.id, p.sys]));
  const inSys = (sys, v) => { sysResearch[sys] = (sysResearch[sys] || 0) + v; };
  for (const c of colonies) { ground[c.pl.id] = c.research; inSys(c.pl.sys, c.research); }
  for (const { u, t } of ships) if (!u.dest && t.research > 0) { orbit[u.at] = (orbit[u.at] || 0) + t.research; inSys(sysOfPlace[u.at], t.research); }
  const unpaid = clamp(S.unpaid || 0, 0, 1);         // last eon's upkeep went unpaid by this share: research slows, people grumble (above), the fleet wears (endEon)
  const research = (colonies.reduce((a, c) => a + c.research, 0) + ships.reduce((a, s) => a + (s.u.dest ? 0 : s.t.research), 0)) * (1 - T.upkeep.slow * unpaid);
  // the UPKEEP of the eon against the excess that flows to the reserves, and what is left after the reserves have covered the rest
  const fleetWorth = ships.reduce((a, s) => a + s.t.cost, 0), pops0 = colonies.reduce((a, p) => a + p.P.people, 0);
  const upkeep = { military: fleetWorth * T.upkeep.military, social: pops0 * T.upkeep.social, research: research * T.upkeep.research };
  upkeep.total = upkeep.military + upkeep.social + upkeep.research;
  const income = colonies.reduce((a, p) => a + p.toReserves, 0), net = income - upkeep.total, after = (S.reserves || 0) + net;
  const shortNext = after < 0 && upkeep.total > 0 ? clamp(-after / upkeep.total, 0, 1) : 0;
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

  // COHESION grows faster with science across the cells (care, learning — his words: science is also health and social care); 25 % of
  // it counts as the third of the people in the social corner did before
  const pops = colonies.reduce((a, p) => a + p.P.people, 0), sciShare = pops > 0 ? colonies.reduce((a, p) => a + p.P.people * p.cap.scienceShare, 0) / pops : 0.25;
  const cohesionGain = T.cohesionRate * (0.5 + sciShare * 4 / 3) * Math.pow(1 - clamp(S.cohesion / 100, 0, 1), T.cohesionCurve);
  const steadyNext = moved ? 0 : (S.steady || 0) + 1;
  const setback = Math.floor(moveDist * T.focusSetback);
  const speed = T.integrate * (1 + Math.min(steadyNext, 10) * T.steadyBonus) * clamp(Math.sqrt(research / 33), 0.5, 3);
  for (const s of ships) s.range = shipRange(s.t, fleetWarp(passive));               // STAR TRAVEL: each ship's reach between stars, light years
  return { colonies, ships, studied, research, sysResearch, fields, points, warp: fleetWarp(passive), free: T.attention - points, cohesionGain, reach, moveDist, moveCost, moved, shock, steadyNext, setback, speed, upkeep, income, net, shortNext, unpaid,
    people: colonies.reduce((a, c) => a + c.P.people, 0) + S.ships.reduce((a, u) => a + (u.people || 0), 0), passive, caps };
}

// ---------------- orders ----------------
// eons a plain star drive (full range) needs to cross between two stars — for the screens that show a place, not a ship
export const starEons = (dist, warp = 1) => forecast(VOY.range * warp, dist / LY, warp).eons;
export function sysDistance(S, a, b) {
  const c = cacheOf(S), key = a + '|' + b, had = c.dist.get(key); if (had !== undefined) return had;
  const A = c.byId.get(a), B = c.byId.get(b), v = A && B ? Math.hypot(A.x - B.x, A.y - B.y) : 0; c.dist.set(key, v); return v;
}
// every other star, nearest first, with the light years to it — for the heads' path searches (kept for the state's life)
export function starsNear(S, sysId) {
  const c = cacheOf(S); if (!c.near) c.near = new Map();
  let list = c.near.get(sysId); if (list) return list;
  const A = c.byId.get(sysId); list = A ? S.systems.filter(s => s.id !== sysId).map(s => ({ id: s.id, ly: Math.hypot(A.x - s.x, A.y - s.y) / LY })).sort((p, q) => p.ly - q.ly || (p.id < q.id ? -1 : 1)) : [];
  c.near.set(sysId, list); return list;
}
export const lyBetween = (S, a, b) => sysDistance(S, a, b) / LY;
// the range a group of ships shares: their reaches weighted by their bulk (STAR TRAVEL)
export function fleetRange(S, ships, caps = allCapsules(S)) {
  const warp = fleetWarp(passiveOf(caps)); let m = 0, r = 0;
  for (const u of ships) { const t = shipStats(S, u, caps); m += t.volume; r += t.volume * shipRange(t, warp); }
  return m ? r / m : 0;
}
// Inside a system: a star drive arrives next eon, thrusters crawl. Between stars: star drives only — a VOYAGE (STAR TRAVEL).
// Ships sent together leave as one FLEET: one shared range, one speed, each ship rolling its own fate.
export function sendFleet(S, shipIds, placeId) {
  const to = S.places.find(p => p.id === placeId), ships = shipIds.map(id => S.ships.find(x => x.id === id)).filter(Boolean);
  if (!to || !ships.length) return 'Nowhere to go';
  const at = ships[0].at, from = S.places.find(p => p.id === at), sysOfP = id => (S.places.find(p => p.id === id) || {}).sys;
  if (ships.some(u => u.dest || sysOfP(u.at) !== from.sys)) return 'They must be at rest in the same system to leave as one fleet';   // a fleet may gather from several places of one system (the galaxy's view)
  if (from.sys === to.sys) {                                                       // inside a system: as before, ship by ship
    if (ships.every(u => u.at === placeId)) return 'They are already there';
    for (const u of ships) { if (u.at === placeId) continue; const eta = T.travel[u.klass]; if (!eta) return `${u.name} has no engine`; u.dest = placeId; u.eta = eta; u.trip = eta; }
    return null;
  }
  const caps = allCapsules(S), warp = fleetWarp(passiveOf(caps));
  for (const u of ships) {
    if (u.klass !== 'starship') return `${u.name} has no star drive: it cannot leave the system`;
    if (shipStats(S, u, caps).underDriven) return `${u.name}'s star drive is too small for its bulk: it cannot leave the system`;
  }
  const R = fleetRange(S, ships, caps), dist = lyBetween(S, from.sys, to.sys), fid = ships.length > 1 ? uid('f') : null, eff = dist > 0 ? effectiveLy(S, from.sys, to.sys) / dist : 1;
  for (const u of ships) {
    u.st = u.st ?? 100;
    u.voy = { from: u.at, to: placeId, travelled: u.strain || 0, left: dist, total: dist, range: R, fleet: fid, back: false, A: from.sys, B: to.sys, D: dist, pos: 0 };   // A → B, pos 0…1: where it is on the line between the two stars; the strain it set out with counts from the first eon
    u.dest = placeId; u.eta = u.trip = forecast(R, dist, warp, u.strain || 0, u.st, eff).eons;
  }
  return null;
}
export const sendShip = (S, shipId, placeId) => sendFleet(S, [shipId], placeId);
// Call back: inside a system the ship simply stays; between stars the whole fleet turns round — the way back is what it has
// covered, on the same voyage (the light years keep adding up: past halfway, turning round is as dear as going on)
export function recallShip(S, shipId) {
  const u = S.ships.find(x => x.id === shipId); if (!u || !u.dest) return;
  if (!u.voy) { u.dest = null; u.eta = 0; return; }
  const mates = u.voy.fleet ? S.ships.filter(x => x.voy && x.voy.fleet === u.voy.fleet) : [u], warp = fleetWarp(passiveOf(allCapsules(S)));
  for (const x of mates) {
    const V = x.voy, covered = V.total - V.left;
    if (covered < 1e-6) { x.dest = null; x.eta = 0; delete x.voy; continue; }     // it had not left yet
    [V.from, V.to] = [V.to, V.from]; V.total = V.left = covered; V.back = !V.back;
    x.dest = V.to; x.eta = forecast(V.range, V.left, warp, V.travelled, x.st ?? 100).eons;
  }
}
// A ship that carries people founds a colony where it lands: the ship itself becomes the first building — at an outpost's
// scale and at the grade it arrived in. The world gives the settlers their first room (a living world much, a harsh one little).
export function settle(S, shipId) {
  const u = S.ships.find(x => x.id === shipId), pl = u && S.places.find(p => p.id === u.at);
  if (!u || u.dest || !pl) return 'The ship is not there yet';
  if (!pl.landable) return `Nothing can land on ${pl.name}`;
  if (pl.colony) return `${pl.name} is already settled`;
  if (!(u.people > 0)) return 'There are no people on board';
  pl.colony = newColony(u.people, T.room[worldOf(pl)] ?? T.room.other, pl);   // the landing site: a home and a farm (a dry world: a home and a works)
  pl.colony.structures.push({ id: uid('u'), name: 'Landed ' + u.name, klass: 'structure', design: u.design, eon: S.eon, landed: true, grade: Math.max(0.05, (u.st ?? 100) / 100) });
  S.ships = S.ships.filter(x => x !== u);
  return null;
}
// people, as a word: millions on a world, thousands on a ship
export const peopleWord = v => v >= 1 ? `${v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? 0 : 1)} M` : v > 0 ? `${Math.max(1, Math.round(v * 1000))} k` : '0';
// an old save (version 8) brought up to date: people aboard ships to a ship's scale, crossings into voyages, landed ships marked
export function upgrade(S) {
  S.cohesion = Math.min(100, S.cohesion || 0);                                   // cohesion runs 0–100 now (2026-10-16); an older save may hold more
  // THE SURFACE (2026-10-18): every colony gets its cells of four slots (an older one's district designs turned into slots); the
  // district designs themselves are gone — the four slot kinds are the empire's designs now
  if (!S.slotLevels) S.slotLevels = { ...LEVEL1 };
  for (const pl of S.places) if (pl.colony) migrateColony(S, pl);
  delete S.districts;
  if (S.version >= 9) { if (!S.hostiles) spawnHostiles(S); return S; }
  const caps = allCapsules(S);
  for (const u of S.ships) {
    u.st = u.st ?? 100; if (u.people) u.people *= SCALE.shipHousing;
    const from = S.places.find(p => p.id === u.at), to = u.dest && S.places.find(p => p.id === u.dest);
    if (from && to && from.sys !== to.sys) { const dist = lyBetween(S, from.sys, to.sys), covered = dist * clamp(1 - u.eta / (u.trip || u.eta || 1), 0, 1); u.voy = { from: u.at, to: u.dest, travelled: covered, left: dist - covered, total: dist, range: fleetRange(S, [u], caps), fleet: null, back: false, A: from.sys, B: to.sys, D: dist, pos: dist ? covered / dist : 0 }; }
  }
  for (const pl of S.places) if (pl.colony) for (const u of pl.colony.structures) if (/^Landed /.test(u.name)) { u.landed = true; u.grade = u.grade ?? 1; }
  S.derelicts = S.derelicts || []; S.version = 9; if (!S.hostiles) spawnHostiles(S); return S;
}

// HOSTILE FLEETS (his ask, 2026-10-15: "spawn a couple of random fleets all over the place — the further away from home, the
// stronger"). About a third of the other systems hold one: its price is HOSTILE.perLy for every light year from home (give or
// take a quarter, never under HOSTILE.min), its tactics one or two drawn at random, its ships at their natural sizes (the
// Fleet Generator's own planner). They hold their system and do not move. Your ships that rest in that system at the end of an
// eon FIGHT it — with the battle's own engine, your breakthroughs in your ships, and the stamina they came in with — every eon
// until one side is gone or yours leave. What dies is gone; what lives keeps the stamina the fight left it.
export const HOSTILE = { share: 0.3, perLy: 100, spread: 0.25, min: 250 };
const NO_TECH = { breakthroughs: [] };
const HOSTILE_NAMES = ['Raiders', 'Wardens', 'Reavers', 'Swarm', 'Picket', 'Host', 'Marauders', 'Sentinels', 'Corsairs', 'Watch'];
export function spawnHostiles(S) {
  S.hostiles = [];
  const others = S.systems.filter(x => x.id !== S.homeSys).map(x => ({ x, r: rand(S) })).sort((a, b) => a.r - b.r).map(o => o.x);
  for (const sys of others.slice(0, Math.round(others.length * HOSTILE.share))) {
    const ly = lyBetween(S, S.homeSys, sys.id), budget = Math.max(HOSTILE.min, Math.round(HOSTILE.perLy * ly * (1 - HOSTILE.spread + 2 * HOSTILE.spread * rand(S)) / 10) * 10);
    const ids = shuffle(TACTIC_IDS.slice(), () => rand(S)), mix = (rand(S) < 0.5 ? ids.slice(0, 1) : ids.slice(0, 2)).map(id => ({ id, share: 0.5 + rand(S) }));   // a Fisher-Yates shuffle: a sort with a random comparator drew a different NUMBER of dice in Chrome than in node (V8's TimSort), and every replay across engines diverged from eon 1 (2026-10-17)
    const plan = composePlan({ budget, n: naturalShips(budget, mix), mix, seed: Math.floor(rand(S) * 1e6), name: pick(S, HOSTILE_NAMES) + ' of ' + sys.name });
    S.hostiles.push({ id: uid('h'), sys: sys.id, plan: planStrip(plan), budget });
  }
  return S.hostiles;
}
export const hostileIn = (S, sysId) => (S.hostiles || []).find(h => h.sys === sysId) || null;
export const hostileWorth = H => Math.round(H.plan.ships.reduce((a, p) => a + p.cost, 0));
// a hostile fleet in words: name, ships, its worth, its tactics
export const hostileWord = H => H.plan.name + ' — ' + H.plan.ships.length + ' ship' + (H.plan.ships.length === 1 ? '' : 's') + ', worth ' + hostileWorth(H) + ' · ' + (H.plan.mix || []).map(m => TACTICS[m.id] ? TACTICS[m.id].name : m.id).join(' + ');
// the fight in a system: your resting ships there against its hostile fleet (one battle an eon)
// Every fight is KEPT for watching (S.battles, this eon's; his ask 2026-10-16 "when there's a battle, show me the battle"): the
// hostile plan as it stood, your ships' designs as they were, each one's stamina, and the dice — the lab's arena replays it
function fightHostiles(S, caps, rep) {
  const sysOf = id => (S.places.find(p => p.id === id) || {}).sys;
  S.battles = [];
  for (const H of [...(S.hostiles || [])]) {
    const mine = S.ships.filter(u => !u.dest && sysOf(u.at) === H.sys); if (!mine.length) continue;
    const A = mine.map(u => { const sh = shipFromDesign(S, u.design, caps); sh.name = u.name; sh.en0 = (u.st ?? 100) / 100; return sh; });
    const plan = { ...H.plan, ships: H.plan.ships.map(p => ({ ...p })) }, B = buildPlan(NO_TECH, plan).ships;
    if (!B.length) { S.hostiles = S.hostiles.filter(x => x !== H); continue; }
    const seed = Math.floor(rand(S) * 1e9), battleId = uid('b');
    S.battles.push({ id: battleId, eon: S.eon, sys: H.sys, seed, foe: planStrip(plan), mine: mine.map((u, i) => ({ name: u.name, en0: A[i].en0, strain: u.strain || 0, design: { ...cloneDesign(u.design), paint: u.design.paint } })) });
    const bt = createBattle(A, B, rng32(seed), { record: 1e9 }); while (!bt.done) bt.step(); const r = bt.result();
    const lostMine = [], lostTheirs = new Set();
    mine.forEach((u, i) => { const sh = bt.ships[i]; if (sh.dead) lostMine.push(u); else u.st = Math.max(1, Math.round(Math.max(0, sh.en) * 100)); });
    B.forEach((sh, i) => { if (bt.ships[mine.length + i].dead) lostTheirs.add(sh.plan); });
    S.ships = S.ships.filter(u => !lostMine.includes(u));
    H.plan.ships = H.plan.ships.filter((p, k) => !lostTheirs.has(plan.ships[k]));
    const where = (S.systems.find(x => x.id === H.sys) || {}).name || '?', gone = !H.plan.ships.length;
    if (gone) S.hostiles = S.hostiles.filter(x => x !== H);
    const verdict = gone ? 'you swept them away' : r.winner === 0 ? 'you won the field' : r.winner === 1 ? 'they held the field' : 'neither side gave way';
    rep.push({ kind: lostMine.length ? 'bad' : 'battle', battle: battleId, text: 'Battle at ' + where + ': your ' + mine.length + ' ship' + (mine.length > 1 ? 's' : '') + ' against ' + H.plan.name + ' — ' + verdict
      + (lostMine.length ? '; you lost ' + lostMine.map(u => u.name).join(', ') : '') + '; they lost ' + lostTheirs.size + ' of ' + B.length + (gone ? '' : ', ' + H.plan.ships.length + ' remain') });
  }
}


// ---------------- end the eon ----------------
export function endEon(S) {
  const c = compute(S), rep = [];
  for (const pc of c.colonies) {
    const P = pc.P, name = pc.pl.name;
    for (const q of pc.queue) if (!q.gone) { q.item.progress = q.progressAfter; q.item.joined = q.joinedAfter; if (q.built) q.item.count = q.count - q.built; }   // a unit built: one fewer of the item left
    for (const { d, ds, sections } of pc.done) {
      const unit = { id: uid('u'), name: d.name, klass: ds.klass, design: cloneDesign(d), eon: S.eon };
      if (sections > 1) unit.sections = sections;                 // put together from sections — the hull remembers
      if (ds.klass === 'structure') P.structures.push(unit);
      else {
        unit.at = pc.pl.id; unit.dest = null; unit.eta = 0; unit.st = 100;
        unit.people = ds.housing > 0 ? Math.max(0, Math.min(ds.housing * SCALE.shipHousing, P.people - 5)) : 0;     // settlers leave with the ship — a ship's habitat holds a thousandth of a world's
        P.people -= unit.people;
        S.ships.push(unit);
      }
      rep.push({ kind: 'build', text: `${name}: built ${d.name}` + (sections > 1 ? ` in ${sections} sections` : '') + (unit.people ? ` — ${peopleWord(unit.people)} people went aboard` : '') });
    }
    P.queue = P.queue.filter(q => (q.count ?? 1) > 0 && S.designs.some(d => d.id === q.designId));
    for (const q of pc.queue) if (q.noDock && !q.item.warned) { q.item.warned = true; rep.push({ kind: 'bad', text: `${name}: ${q.d.name} cannot be built — there is no space dock here` }); }
    const before = P.people;
    P.people = Math.max(1, P.people + pc.dPeople);
    if (pc.surplus < 0) rep.push({ kind: 'bad', text: `${name}: not enough food — ${(before - P.people).toFixed(1)} people lost` });
    if (pc.short > 0.05) rep.push({ kind: 'bad', text: `${name}: unrest — a society of ${peopleWord(before)} needs ${Math.round(pc.needI)} industry and ${Math.round(pc.needR)} research at work and is ${Math.round(pc.short * 100)} % short` });
    P.happiness = pc.happiness;
    // THE SURFACE (colony.js): the builders' points buy slots toward the development focus (a full world tears one down and builds
    // the new kind the next eon); the fillet creeps toward what each corner can support. A district completed is reported.
    if (pc.G) {
      const wasFull = isFull(pc.G), log = developStep(pc.G, pc.dev, { noFood: !pc.water, lack: pc.lack });
      for (const e of log) if (e.kind === 'slot' && e.done) { const n = {}; for (const k of pc.G.cells[e.cell].slots) n[k] = (n[k] || 0) + 1; rep.push({ kind: 'build', text: `${name}: a district completed — ${Object.entries(n).map(([k, v]) => `${v} ${KIND_WORD[k]}`).join(', ')}` }); }
      if (!wasFull && isFull(pc.G)) rep.push({ kind: 'build', text: `${name}: the whole world is developed — from now on the builders re-make it toward the focus, one slot at a time` });
      creepFillet(pc.G, pc.want);
    }
    if (pc.newFactories > 0) { P.factories = (P.factories || 0) + pc.newFactories; rep.push({ kind: 'build', text: `${name}: ${pc.newFactories} factor${pc.newFactories === 1 ? 'y' : 'ies'} built with the industry nothing in the queue needed` }); }
  }

  // ships: at rest they get their stamina back (only in a star system); under way inside a system they count down; between
  // stars they sail the voyage, rolling for every eon spent past their range (STAR TRAVEL)
  const statsOf = new Map(c.ships.map(s => [s.u.id, s.t])), sysOf = id => (S.places.find(p => p.id === id) || {}).sys, placeName = id => (S.places.find(p => p.id === id) || {}).name || '?';
  S.derelicts = S.derelicts || [];
  for (const u of [...S.ships]) {
    if (!u.dest) {
      const t = statsOf.get(u.id) || {}, z = zoneOfSys(S, sysOf(u.at)), fab = t.industry > 0 ? 1.5 : 1;   // RESTOCKING: only inside the sphere, by its zone
      if ((u.st ?? 100) < 100 && ZONE.recover[z] > 0) u.st = Math.min(100, (u.st ?? 100) + ZONE.recover[z] * fab);
      if (u.strain > 0) u.strain = Math.max(0, u.strain - ZONE.heal[z] * fab);
      if (c.unpaid > 0 && u.klass !== 'structure') u.st = Math.max(1, (u.st ?? 100) - T.upkeep.wear * c.unpaid);   // an unpaid fleet wears
      continue;
    }
    if (!u.voy) { if (--u.eta <= 0) { u.at = u.dest; u.dest = null; rep.push({ kind: 'move', text: `${u.name} arrived at ${placeName(u.at)}` }); } continue; }
    const V = u.voy, step = Math.min(V.left, VOY.speed * c.warp * speedAt(V.travelled, V.range));
    const SA = S.systems.find(s => s.id === V.A), SB = S.systems.find(s => s.id === V.B), zHere = SA && SB ? zoneAt(S, SA.x + (SB.x - SA.x) * (V.pos ?? 0), SA.y + (SB.y - SA.y) * (V.pos ?? 0)) : 5;
    V.travelled += step * ZONE.strain[zHere]; V.left -= step; if (V.D) V.pos = clamp((V.pos ?? 0) + (V.back ? -1 : 1) * step / V.D, 0, 1);   // the strain of the eon: none in the blue, half in the green, all of it beyond
    const F = 100 * Math.max(0, 1 - chanceAt(V.travelled, V.range));
    if (F > 0) {                                                                    // past its range: the roll
      const st0 = u.st ?? 100, loss = F * (1 - rand(S)); u.st = st0 - loss;
      if (u.people) u.people *= Math.max(0, u.st) / st0;                           // people aboard die with the stamina lost
      if (u.st <= 0) {                                                              // a derelict where it stands
        S.derelicts.push({ id: u.id, name: u.name, design: u.design, A: V.A, B: V.B, pos: V.pos ?? 0, eon: S.eon });
        S.ships = S.ships.filter(x => x !== u);
        rep.push({ kind: 'bad', text: `${u.name} broke down between ${placeName(V.from)} and ${placeName(V.to)}, ${(V.travelled - V.range).toFixed(1)} light years past its range — a derelict now` });
        continue;
      }
      if (loss >= 1) rep.push({ kind: 'bad', text: `${u.name}: a hard eon past its range — stamina ${Math.round(st0)} → ${Math.round(u.st)} %${u.people ? ` (${peopleWord(u.people)} people left aboard)` : ''}` });
    }
    if (V.left <= 1e-9) { u.at = V.to; u.dest = null; u.strain = V.travelled; delete u.voy; rep.push({ kind: 'move', text: `${u.name} arrived at ${placeName(u.at)}${(u.st ?? 100) < 99.5 ? ` with ${Math.round(u.st)} % stamina` : ''}${u.strain > 0.05 ? `, ${u.strain.toFixed(1)} light years of strain` : ''}` }); }   // the strain stays with the ship: it heals only inside the sphere
    else u.eta = forecast(V.range, V.left, c.warp, V.travelled, u.st ?? 100).eons;
  }

  // hostile fleets: your ships resting in their system fight them
  fightHostiles(S, c.caps, rep);

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

  // the reserves: the eon's excess in, the upkeep out; what the reserves cannot cover goes unpaid and bites next eon
  S.reserves = Math.max(0, (S.reserves || 0) + c.net); S.unpaid = c.shortNext;
  if (c.shortNext > 0.005) rep.push({ kind: 'bad', text: `The reserves ran dry: ${Math.round(c.shortNext * 100)} % of the upkeep (military ${Math.round(c.upkeep.military)}, social ${Math.round(c.upkeep.social)}, research ${Math.round(c.upkeep.research)}) went unpaid — the fleet wears, people grumble, research slows` });
  S.cohesion = clamp(S.cohesion + c.cohesionGain - c.moveCost, c.moved ? T.cohesionFloor : 0, 100);
  if (c.moved) rep.push({ kind: 'focus', text: `Society shifted its focus (−${c.moveCost.toFixed(1)} cohesion${c.shock > 0.5 ? ', a shock to the people' : ''})` + (c.setback ? ` — ${c.setback} step${c.setback > 1 ? 's' : ''} of research lost in every field` : '') });
  for (const pc of c.colonies) { const was = pc.pol, now = pc.polNext; pc.P.pol = now; for (const [k, word] of [['industry', 'industrial pollution — people sicken'], ['social', 'a docile society — industry and research slacken'], ['research', 'an aloof society — the builders slacken']]) if (now[k] >= 50 && was[k] < 50) rep.push({ kind: 'bad', text: `${pc.pl.name}: ${word}` }); }
  S.focusStart = [...S.focus];
  S.report = rep; S.eon++;
  return rep;
}

// THE COLONY'S ORDERS (his pop-up, 2026-10-18): the triangle, the development focus (the dot on the rectangle), a cell's plan, and the
// production line — add N of a design, change how many, move an item up or down the line
const colonyAt = (S, placeId) => (S.places.find(p => p.id === placeId) || {}).colony || null;
export function setSplit(S, placeId, split) {
  const P = colonyAt(S, placeId); if (!P) return 'No colony there';
  const v = (split || []).slice(0, 3).map(x => Math.max(0, +x || 0)), t = v.reduce((a, x) => a + x, 0); if (v.length !== 3 || !(t > 0)) return 'A split is three shares';
  P.split = v.map(x => x / t); return null;
}
export function setDevFocus(S, placeId, x, y) {
  const P = colonyAt(S, placeId); if (!P || !P.surface) return 'No colony there';
  P.surface.dot = { x: clamp(+x || 0, 0, 1), y: clamp(+y || 0, 0, 1) }; return null;
}
export function planCell(S, placeId, cell, plan) {
  const P = colonyAt(S, placeId), G = P && P.surface; if (!G) return 'No colony there';
  if (!(cell >= 0 && cell < G.cells.length)) return 'No such cell';
  if (plan != null && (!Array.isArray(plan) || !plan.length || plan.some(k => !FACTORS.includes(k)))) return 'A plan is a list of slot kinds';
  G.cells[cell].plan = plan ? [...new Set(plan)] : null; return null;
}
export function queueAdd(S, placeId, designId, n = 1) {
  const P = colonyAt(S, placeId); if (!P) return 'No colony there'; if (!S.designs.some(d => d.id === designId)) return 'No such design';
  P.queue.push({ id: uid('q'), designId, progress: 0, count: clamp(Math.round(n) || 1, 1, 99) }); return null;
}
export function queueCount(S, placeId, itemId, n) {
  const it = (colonyAt(S, placeId)?.queue || []).find(q => q.id === itemId); if (!it) return 'Nothing like that in the line';
  it.count = clamp(Math.round(+n) || 1, 1, 99); return null;
}
export function queueMove(S, placeId, itemId, to) {
  const Q = colonyAt(S, placeId)?.queue; if (!Q) return 'No colony there'; const from = Q.findIndex(q => q.id === itemId); if (from < 0) return 'Nothing like that in the line';
  const [it] = Q.splice(from, 1); Q.splice(clamp(Math.round(to) || 0, 0, Q.length), 0, it); return null;
}
export function queueDrop(S, placeId, itemId) { const P = colonyAt(S, placeId); if (!P) return 'No colony there'; P.queue = P.queue.filter(q => q.id !== itemId); return null; }
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
