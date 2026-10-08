// MODULES — what a design is made of — and how breakthroughs turn into numbers.
//
// A design (ship, platform or structure) is a list of modules, each placed one or more times.
// What it looks like is its SILHOUETTE (hull.js), which grows with everything put inside.
//
// THE NUMBERS. Every capsule (one boost of one breakthrough property) is INTEGRATED over the
// eons, from 0 to 100%:
//   · what everyone gets:  30% of the capsule at once, rising to 100% as it is integrated;
//   · putting the capsule on a module gives that module the rest right now — and makes the module
//     dearer and bulkier, less and less as the capsule becomes common knowledge;
//   · a fully integrated capsule is simply the standard: nothing left to place.
// A capsule can be used once per design. Miniaturization and Affordability fit any module.
//
// SHIELDS throw a round field of a fixed reach over the hull. The part of the hull outside every
// field is not covered: a big or stretched design needs a second shield.
//
// What a design IS follows from its engines: none → STRUCTURE (ground), thrusters → PLATFORM
// (bound to orbit), a star drive → STARSHIP.
//
// THE SPACE DOCK. Anything with an engine is put together inside a GANTRY — an open rectangle of
// squares that the player sizes himself, part of a design like any other module (give it power,
// works, guns, whatever). A hull whose box fits inside the gantry is built whole. A bigger one is
// cut into gantry-sized sections, and every extra section makes it dearer and slower.
//
// A REACTOR is sized to the need: its output is dialled from a quarter to four times the standard,
// and its cost and bulk follow.
import { CHANNELS } from '../data/properties.js';
import { hullOf, shieldSpots, coverage, hardPoints } from './hull.js';

export const PASSIVE = 0.30;
export const TRIANGLE = ['miniaturization', 'affordability'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const st = (k, label, unit, from, o = {}) => ({ k, label, unit, from, ...o });

const WEAPON_STATS = dmg => [st('damage', 'Damage per shot', 'HP', dmg), st('rate', 'Rate of fire', '/s', ['rate_of_fire'], { dec: 2 }),
  st('range', 'Range', 'u', ['weapon_range']), st('accuracy', 'Accuracy', '%', ['accuracy', 'targeting'], { max: 98 }),
  st('power', 'Power use', 'MW', ['weapon_efficiency'], { less: true })];
// `mount` = how much of a weapons computer one gun takes up: beams are small, missiles bulky
const W = (name, short, dmg, mount, base, volume = 20) => ({ group: 'Weapons', name, short, color: '#ff8a6b', mount, cost: 40, volume, base, stats: WEAPON_STATS(dmg) });

export const KINDS = {
  // the weapons computer runs the guns: every gun takes mounts; short of mounts, the guns fire slower
  weapon_system: { group: 'Weapons', name: 'Weapons computer', short: 'FIRE', color: '#ffc46b', cost: 40, volume: 15, base: { mounts: 4, bonus: 10, power: 15 },
    scale: { min: 0.5, max: 4, step: 0.5, stats: ['mounts'] },
    stats: [st('mounts', 'Mounts it can run', '', ['computing', 'synthetic_neural'], { dec: 1 }), st('bonus', 'Targeting bonus', '%', ['targeting', 'sensor_resolution'], { dec: 1 }), st('power', 'Power use', 'MW', ['power_efficiency'], { less: true })] },
  // reach: beams shortest, kinetics twice that, missiles ten times (his call)
  // accuracy (his call): beams are the precise weapon, shells are not, missiles are in between
  weapon_energy:  W('Energy weapon', 'BEAM', ['beam_power'], 1, { damage: 20, rate: 1.0, range: 200, accuracy: 90, power: 30 }, 12),   // light: a beam ship is a quick ship
  weapon_kinetic: W('Kinetic weapon', 'GUN', ['kinetic_penetration'], 2, { damage: 30, rate: 0.6, range: 400, accuracy: 40, power: 10 }),
  // missiles are CHARGES: a launcher carries so many and then it is dry — unless a fabricator aboard builds more
  weapon_missile: { ...W('Missile weapon', 'MSL', ['warhead_yield'], 3, { damage: 70, rate: 0.2, range: 2000, accuracy: 75, power: 5, charges: 10 }), charges: true,
    stats: [...WEAPON_STATS(['warhead_yield']), st('charges', 'Missiles carried', '', [])] },
  // a hangar launches DRONES: little craft that fly until they die, rebuilt by a fabricator aboard;
  // every drone IN THE AIR takes DRONE_CONTROL mounts of the weapons computer — a swarm needs a big one
  hangar: { group: 'Weapons', name: 'Hangar', short: 'HNGR', color: '#ffe08a', hangar: true, mount: 0.5, cost: 60, volume: 48, base: { craft: 4, size: 1, power: 10 },
    stats: [st('craft', 'Drones carried', '', []), st('size', 'Drone size', '×', ['structural_scale'], { dec: 2 }), st('power', 'Power use', 'MW', ['power_efficiency'], { less: true })] },
  weapon_orbital: { group: 'Weapons', name: 'Orbital weapon', short: 'ORB', color: '#ff6b9a', orbital: true, mount: 3, cost: 70, volume: 40,
    base: { damage: 400, rate: 0.05, accuracy: 60, power: 40 },
    stats: [st('damage', 'Damage to the ground', 'HP', ['warhead_yield', 'kinetic_penetration']), st('rate', 'Rate of fire', '/s', ['rate_of_fire'], { dec: 3 }),
            st('accuracy', 'Accuracy', '%', ['accuracy', 'targeting'], { max: 98 }), st('power', 'Power use', 'MW', ['weapon_efficiency'], { less: true })] },
  shield: { group: 'Defence', name: 'Shield', short: 'SHLD', color: '#cf89ff', cost: 35, volume: 15, base: { capacity: 150, recovery: 8, radius: 2.6, power: 20 },
    stats: [st('capacity', 'Capacity', 'HP', ['shield_capacity']), st('recovery', 'Recovery', 'HP/s', ['shield_recovery'], { dec: 1 }),
            st('radius', 'Field reach', 'squares', ['shield_reach'], { dec: 1 }), st('power', 'Power use', 'MW', ['power_efficiency'], { less: true })] },
  armor: { group: 'Defence', name: 'Armor', short: 'ARM', color: '#c9d4e8', cost: 25, volume: 20, base: { hp: 300, deflect: 3, repair: 0.5 },
    stats: [st('hp', 'Hit points', 'HP', ['armor_integrity', 'hull_integrity']), st('deflect', 'Shrugs off per hit', 'HP', ['armor_deflection'], { dec: 1 }), st('repair', 'Self-repair', 'HP/s', ['hull_regeneration'], { dec: 1 })] },
  thruster: { group: 'Engines', name: 'Thrusters', short: 'THR', color: '#7ef3b0', engine: 'thruster', cost: 30, volume: 15, base: { thrust: 100, evasion: 10, power: 20 },
    stats: [st('thrust', 'Battle thrust', '', ['thrust']), st('evasion', 'Evasion', '', ['agility', 'evasion']), st('power', 'Power use', 'MW', ['drive_efficiency'], { less: true })] },
  // the star drive is dialled to the hull: a ship needs enough drive for its bulk to leave the system at all
  stardrive: { group: 'Engines', name: 'Star drive', short: 'DRIVE', color: '#5fe3d0', engine: 'stardrive', cost: 60, volume: 25, base: { thrust: 80, evasion: 6, lift: 150, power: 35 },
    scale: { min: 0.5, max: 6, step: 0.5, stats: ['thrust', 'evasion', 'lift', 'power'] },
    stats: [st('lift', 'Moves a hull of', 'volume', ['thrust', 'drive_efficiency']), st('thrust', 'Battle thrust', '', ['thrust']), st('evasion', 'Evasion', '', ['agility', 'evasion']), st('power', 'Power use', 'MW', ['drive_efficiency'], { less: true })] },
  // the reactor is dialled: mod.k scales output, reserve, cost and bulk together
  reactor: { group: 'Power', name: 'Reactor', short: 'PWR', color: '#6db7ff', cost: 45, volume: 20, base: { output: 100, reserve: 100 },
    scale: { min: 0.25, max: 4, step: 0.25, stats: ['output', 'reserve'] },
    stats: [st('output', 'Power output', 'MW', ['reactor_output']), st('reserve', 'Reserve', 'MJ', ['energy_storage'])] },
  works: { group: 'Civilian', name: 'Fabricator', short: 'FAB', color: '#ffb347', cost: 50, volume: 30, base: { industry: 12, power: 15 },
    stats: [st('industry', 'Industry output', '/eon', ['manufacturing', 'mining_yield', 'labor_efficiency'], { dec: 1 }), st('power', 'Power use', 'MW', ['power_efficiency'], { less: true })] },
  lab: { group: 'Civilian', name: 'Lab', short: 'LAB', color: '#5fe3d0', cost: 50, volume: 20, base: { research: 10, power: 15 },
    stats: [st('research', 'Research output', '/eon', ['computing', 'research_ease', 'synthetic_neural'], { dec: 1 }), st('power', 'Power use', 'MW', ['power_efficiency'], { less: true })] },
  habitat: { group: 'Civilian', name: 'Habitat', short: 'HAB', color: '#f5a3c7', cost: 45, volume: 30, base: { housing: 40, social: 8, power: 10 },
    stats: [st('housing', 'Housing', 'people', ['habitability', 'structural_scale']), st('social', 'Social output', '/eon', ['growth', 'food_yield'], { dec: 1 }), st('power', 'Power use', 'MW', ['power_efficiency'], { less: true })] },
  // the gantry is a rectangle the player sizes (mod.w × mod.h); cost, volume and power are per square
  gantry: { group: 'Space dock', name: 'Gantry', short: 'GANTRY', color: '#e8c56b', rect: true, cost: 8, volume: 10, base: { overhead: 30, power: 2 },
    stats: [st('overhead', 'Extra cost per section', '%', ['synthetic_neural', 'labor_efficiency'], { less: true }), st('power', 'Power use', 'MW', ['power_efficiency'], { less: true })] },
};
export const GANTRY = { w: 4, h: 2, maxW: 12, maxH: 8 };      // the standard gantry, and how far one can be stretched
export const DRONE_CONTROL = 1;                                // mounts of the weapons computer one flying drone takes up (2 starved pure carriers to death — back to 1, 2026-10-07)
// ARMOUR is the shell outside the hull, a separate layer with its own points. Layers stack like onion
// rings: every layer out is bigger — the k-th costs (1 + 0.4(k−1)) of the first in volume, so four
// layers are 6.4× the bulk of one for 4× the points. Hull damage degrades the ship; fabricators patch it.
export const ARMOR = { ring: 0.4 };
export const HULL = { degradeFloor: 0.5, fabRepairPerIndustry: 0.05, fabRepairCap: 0.5 };
// mass vs agility (2026-10-08, his ask: "a massive ship should move slowly and turn on its axis slowly; a small one should dodge")
// ref = a corvette's volume; a drive-only 51-square ship turns ~7°/s (180° in ~26 s), a corvette ~70°/s; evasion ≈ 27% tiny, 12% corvette, 3–4% massive
export const MASS = { ref: 160, speedPow: 0.3, turnBase: 1750, turnMin: 3, turnMax: 180, evadeK: 3, evadePow: 0.6 };
// turrets have mass too (2026-10-08, his ask): a mount slews at base × kind / size^pow degrees a second, where
// size = the gun's volume against a standard gun of its kind (the dials make it heavier). A standard beam
// turret 117°/s, a point-defence beam ~210°/s, a capital gun (dmg ×4) ~19°/s — it cannot lay on a corvette
// crossing at 50°/s, which is the point: capital guns for capital ships. A launcher has no turret (missiles home).
export const TURRET = { base: 90, pow: 0.8, kind: { weapon_energy: 1.3, weapon_kinetic: 0.8, weapon_missile: 0 }, tol: 6 };
export const traverseOf = (kind, size) => (TURRET.kind[kind] || 0) * TURRET.base / Math.pow(Math.max(0.05, size || 1), TURRET.pow);   // at 0 hull a ship runs at 50%; a fabricator patches so many HP/s per industry, up to half the hull over a battle
export const armorBulk = n => n + ARMOR.ring * n * (n - 1) / 2;   // total volume of n layers, in units of one layer
export const KIND_IDS = Object.keys(KINDS);
export const CLASS_NAME = { structure: 'Structure', platform: 'Platform', starship: 'Starship' };
export const isRelevant = (kind, channel) => TRIANGLE.includes(channel) || KINDS[kind].stats.some(s => s.from.includes(channel));
export const scaleOf = mod => { const K = KINDS[mod.kind]; return K.scale ? clamp(mod.k || 1, K.scale.min, K.scale.max) : 1; };
// how far a gun reaches, in words and colour — to be tuned once battles show what matters
export const REACH = { short: 300, long: 900 };
// A GUN IS TUNED: damage, rate of fire and range are dials (×0.5 … ×4). Everything else follows and
// blows up fast: power, bulk, cost, how much of the weapons computer it eats, and how hard it is to aim.
export const GUN = { min: 0.5, max: 4, step: 0.5, power: [1.1, 1.0, 0.5], cost: [1.3, 1.0, 0.6], volume: [1.2, 0.4, 0.5], load: 0.4, aim: 0.15 };   // rate of fire costs its full share: a fast gun is not a free gun
// a weapon that fires charges: the magazine is a fourth dial, and every missile is a real thing to
// carry — bigger warheads, bigger missiles, bigger magazine (volume climbs fast, as he wanted)
// A FABRICATOR carries a STOCK of material (so much per unit of its volume) and spends it: a missile
// costs its share of the launcher's volume, a drone sortie its share of the hangar's. When the stock
// is gone, nothing more is built. Speed is separate: so many missiles / drones a second per industry.
export const FAB = { missilesPerIndustry: 0.02, dronesPerIndustry: 0.008, stockPerVolume: 4 };
export const SHIELD = { hard: 8 };                         // a shield shrugs off this much of every hit before it dents: small fast shots barely scratch it
export const DODGE = { weapon_missile: 2.5 };               // an agile ship shakes off missiles far more than beams or shells
export function gunTune(mod, K = KINDS[mod.kind]) {
  if (K?.hangar) {                                           // a hangar's dials: how many drones, how big each
    const n = clamp(mod.cnt || 1, GUN.min, GUN.max), s = clamp(mod.sz || 1, 0.5, 3), bulk = n * Math.pow(s, 1.2);
    return { cnt: n, sz: s, craft: n, size: s, power: 0.6 + 0.4 * bulk, cost: 0.4 + 0.6 * bulk, volume: 0.3 + 0.7 * bulk, load: Math.pow(n, 0.6) };
  }
  const d = clamp(mod.dmg || 1, GUN.min, GUN.max), r = clamp(mod.rof || 1, GUN.min, GUN.max), g = clamp(mod.rng || 1, GUN.min, GUN.max), c = K?.charges ? clamp(mod.chg || 1, GUN.min, GUN.max) : 1;
  const f = e => Math.pow(d, e[0]) * Math.pow(r, e[1]) * Math.pow(g, e[2]);
  const mag = K?.charges ? 0.5 + 0.8 * c * Math.pow(d, 0.6) : 1, magCost = K?.charges ? 0.7 + 0.3 * c * Math.pow(d, 0.5) : 1;   // magazines are bulky: a missile boat is a slow boat
  return { dmg: d, rof: r, rng: g, chg: c, damage: d, rate: r, range: g, charges: c, accuracy: Math.pow(d * g, -GUN.aim), power: f(GUN.power), cost: f(GUN.cost) * magCost, volume: f(GUN.volume) * mag, load: Math.pow(d * r * g, GUN.load) };
}
// PRESETS: a role picks the dials for you. Point defence is the one with its own behaviour: those
// guns turn on incoming missiles and drones first, and only then on the ship.
export const PRESETS = {
  standard:   { name: 'Standard',      dmg: 1,   rof: 1,   rng: 1,   role: 'ship', what: 'the plain gun' },
  sniper:     { name: 'Sniper',        dmg: 1.5, rof: 0.5, rng: 3,   role: 'ship', what: 'long reach, slow, hits hard' },
  capital:    { name: 'Capital',       dmg: 4,   rof: 0.5, rng: 1,   role: 'ship', what: 'huge shots for huge targets — bulky and hungry' },
  pd:         { name: 'Point defence', dmg: 0.5, rof: 3,   rng: 0.5, role: 'pd',   what: 'fast and light: shoots missiles and drones down, then the ship' },
  antishield: { name: 'Anti-shield',   dmg: 1,   rof: 2,   rng: 1,   role: 'ship', what: 'a hail of hits to burn a shield down' },
  antiarmor:  { name: 'Anti-armour',   dmg: 3,   rof: 0.5, rng: 1,   role: 'ship', what: 'few heavy hits that armour cannot shrug off' },
};
export function applyPreset(mod, id) {
  const p = PRESETS[id]; if (!p || KINDS[mod.kind]?.hangar) return;
  mod.preset = id; mod.dmg = p.dmg; mod.rof = p.rof; mod.rng = p.rng; mod.role = p.role;
}
export const roleOf = mod => mod.role || (mod.preset && PRESETS[mod.preset]?.role) || 'ship';
export const reachBand = range => range < REACH.short ? { name: 'short', color: '#ff7979' } : range < REACH.long ? { name: 'medium', color: '#ffb347' } : { name: 'long', color: '#7ef3b0' };
// speed between stars belongs to the whole fleet, not to a ship: common knowledge pushes it up
export const fleetWarp = passive => 1 + (passive.drive_efficiency || 0) / 100;

// ---------------------------------------------------------------------------
// Capsules and integration
// ---------------------------------------------------------------------------
// every boost of every property of every breakthrough = one capsule
export function allCapsules(S) {
  const out = [];
  for (const b of S.breakthroughs) b.props.forEach((p, pi) => p.channels.forEach(ch => {
    const a = clamp((ch.prog || 0) / 100, 0, 1);
    out.push({ id: `${b.id}|${pi}|${ch.channel}`, bt: b.id, btName: b.name, prop: p.name, channel: ch.channel,
      name: CHANNELS[ch.channel]?.name || ch.channel, pct: ch.pct, x: ch.x, how: ch.how,
      a, done: a >= 1, share: PASSIVE + (1 - PASSIVE) * a, left: Math.max(0, 100 - (ch.prog || 0)) });
  }));
  return out;
}
// what every module gets without anyone placing anything
export function passiveOf(caps) { const p = {}; for (const c of caps) p[c.channel] = (p[c.channel] || 0) + c.pct * c.share; return p; }

export function moduleStats(mod, capMap, passive) {
  const K = KINDS[mod.kind], k = scaleOf(mod), tune = K.mount ? gunTune(mod, K) : null;
  const rect = K.rect ? [clamp(mod.w || GANTRY.w, 1, GANTRY.maxW), clamp(mod.h || GANTRY.h, 1, GANTRY.maxH)] : null, area = rect ? rect[0] * rect[1] : 1;
  const mine = mod.caps.map(id => capMap.get(id)).filter(c => c && !c.done);
  const extra = ch => mine.reduce((a, c) => a + (c.channel === ch ? c.pct * (1 - c.share) : 0), 0);   // what placing it adds on top
  const stats = K.stats.map(s => {
    const pas = s.from.reduce((a, ch) => a + (passive[ch] || 0), 0), app = s.from.reduce((a, ch) => a + extra(ch), 0);
    const base = K.base[s.k] * (rect && s.k === 'power' ? area : 1) * (K.scale?.stats.includes(s.k) ? k : 1) * (tune ? tune[s.k] || 1 : 1), kStd = 1 + pas / 100, kNow = 1 + (pas + app) / 100;
    let std = s.less ? base / kStd : base * kStd, val = s.less ? base / kNow : base * kNow;
    if (s.max) { std = Math.min(s.max, std); val = Math.min(s.max, val); }
    return { ...s, base, std, val, boosted: app > 0.005 };
  });
  const burden = mine.reduce((a, c) => a + (TRIANGLE.includes(c.channel) ? 0 : c.pct * (1 - c.a)), 0);   // new tech is bulky and dear
  const shrink = 1 + ((passive.miniaturization || 0) + extra('miniaturization')) / 100;
  const cheapen = 1 + ((passive.affordability || 0) + extra('affordability')) / 100;
  const v = Object.fromEntries(stats.map(s => [s.k, s.val])), size = area * k;
  return { kind: mod.kind, K, k, tune, stats, v, mine, rect, load: K.mount ? K.mount * tune.load : 0,
    cost: K.cost * size * (tune ? tune.cost : 1) * (1 + burden / 100 * 0.8) / cheapen, volume: K.volume * size * (tune ? tune.volume : 1) * (1 + burden / 100 * 0.6) / shrink };
}

// The whole design, rolled up.
export function designStats(S, design, caps = allCapsules(S)) {
  const capMap = new Map(caps.map(c => [c.id, c])), passive = passiveOf(caps);
  const mods = design.modules.map(m => ({ mod: m, n: Math.max(1, m.n || 1), ...moduleStats(m, capMap, passive) }));
  const t = { cost: 0, volume: 0, powerOut: 0, powerUse: 0, reserve: 0, hp: 0, deflect: 0, repair: 0,
    shieldRaw: 0, shieldRec: 0, thrust: 0, evasionRaw: 0, lift: 0, dpsRaw: 0, ground: 0, range: 0, accSum: 0, weapons: 0, mounts: 0, mountsUsed: 0, bonus: 0,
    industry: 0, research: 0, social: 0, housing: 0, missiles: 0, drones: 0, fabStock: 0, missileVol: 0, droneVol: 0, armor: 0, gantries: [], engines: { thruster: 0, stardrive: 0 } };
  const radii = [], guns = [];
  for (const m of mods) {
    const n = m.n, v = m.v, g = m.K;
    const bulk = m.kind === 'armor' ? armorBulk(n) : n;                      // armour layers ring outward: each one bigger than the last
    t.cost += m.cost * n; t.volume += m.volume * bulk; t.powerUse += (v.power || 0) * n;
    if (m.kind === 'reactor') { t.powerOut += v.output * n; t.reserve += v.reserve * n; }
    if (m.kind === 'weapon_system') { t.mounts += v.mounts * n; t.bonus = Math.max(t.bonus, v.bonus); }
    if (m.kind === 'armor') { t.armor += v.hp * n; t.deflect = Math.max(t.deflect, v.deflect); t.repair += v.repair * n; }
    if (m.kind === 'shield') { t.shieldRaw += v.capacity * n; t.shieldRec += v.recovery * n; for (let i = 0; i < n; i++) radii.push(v.radius); }
    if (g.engine) { t.engines[g.engine] += n; t.thrust += v.thrust * n; t.evasionRaw += v.evasion * n; if (v.lift) t.lift += v.lift * n; }
    if (g.mount) { t.mountsUsed += m.load * n; guns.push({ modId: m.mod.id, kind: m.kind, n, pos: m.mod.pos, size: m.volume / g.volume, load: m.load, role: roleOf(m.mod) }); if (g.charges) { t.missiles += Math.round(v.charges) * n; t.missileVol += m.volume * n; } if (g.hangar) { t.drones += Math.round(v.craft) * n; t.droneVol += m.volume * n; } }
    if (m.kind === 'works') t.fabStock += m.volume * n * FAB.stockPerVolume;
    if (g.orbital) t.ground += v.damage * v.rate * v.accuracy / 100 * n;
    else if (g.mount && !g.hangar) { t.weapons += n; t.dpsRaw += v.damage * v.rate * v.accuracy / 100 * n; t.range = Math.max(t.range, v.range); t.accSum += v.accuracy * n; }
    if (m.kind === 'works') t.industry += v.industry * n;
    if (m.kind === 'lab') t.research += v.research * n;
    if (m.kind === 'habitat') { t.social += v.social * n; t.housing += v.housing * n; }
    if (m.kind === 'gantry') for (let i = 0; i < n; i++) t.gantries.push({ w: m.rect[0], h: m.rect[1], overhead: v.overhead });
  }
  t.dock = t.gantries.length > 0;
  t.klass = t.engines.stardrive ? 'starship' : t.engines.thruster ? 'platform' : 'structure';
  // the silhouette: it grows with the volume; a dock is at least a frame around its gantry
  t.hullClass = t.dock ? 'dock' : t.klass;
  const hull = hullOf(design.hull, t.volume, t.gantries.reduce((a, g) => a + g.w * g.h, 0) * 1.8, t.hullClass);
  t.hull = hull; t.bw = hull.w; t.bh = hull.h; t.squares = Math.round(hull.area * 10) / 10;
  // shield cover: how much of the hull lies under some field
  const shields = shieldSpots(hull, radii);
  t.cover = coverage(hull, shields);
  t.shield = t.shieldRaw * t.cover;                           // a field that misses part of the hull protects that much less
  t.powerFactor = t.powerUse <= 0 ? 1 : clamp(t.powerOut / t.powerUse, 0.25, 1);   // short of power = everything runs slower, nothing switches off
  t.fireFactor = t.mountsUsed <= 0 ? 1 : clamp(t.mounts / t.mountsUsed, 0.25, 1);   // short of mounts = the guns fire slower, none falls silent
  t.airCap = t.drones ? Math.floor(Math.max(0, t.mounts - t.mountsUsed) / DRONE_CONTROL) : 0;   // drones that can be in the air at once: what the computer has left over
  t.hp += t.volume * 2;                                        // the hull itself: the ship's structure, under the armour
  t.hullRepair = t.industry * HULL.fabRepairPerIndustry;        // what a fabricator aboard can patch per second
  // MASS: a star drive fitted to its hull gives every ship the same thrust per volume, so without this
  // a 50-square ship would run, turn and dodge like a corvette. Speed, turning and evasion therefore
  // fall with bulk against a corvette-sized reference (MASS.ref volume): speed mildly, turning as a
  // flywheel (∝ 1/volume), evasion in between. Thrusters buy them back — a big ship that wants to
  // turn on a dime needs a lot of them. `agility` = the engines' evasion points (thruster 10, drive 6×k).
  const bulk = t.volume ? MASS.ref / t.volume : 1;
  t.agility = t.evasionRaw;
  t.speed = t.volume ? t.thrust / t.volume * 120 * Math.pow(bulk, MASS.speedPow) * t.powerFactor : 0;
  t.turn = t.volume ? clamp(MASS.turnBase * t.agility / t.volume * bulk * t.powerFactor, MASS.turnMin, MASS.turnMax) : 0;   // degrees a second
  t.evasion = t.volume ? clamp(100 * MASS.evadeK * t.agility / t.volume * Math.pow(bulk, MASS.evadePow) * t.powerFactor, 0, 75) : 0;
  t.targeting = t.weapons ? Math.min(98, t.accSum / t.weapons + t.bonus) : 0;
  t.dps = t.dpsRaw * t.powerFactor * t.fireFactor; t.ground *= t.powerFactor * t.fireFactor;
  t.industry *= t.powerFactor; t.research *= t.powerFactor; t.social *= t.powerFactor;
  t.reload = t.missiles ? t.industry * FAB.missilesPerIndustry * 60 : 0;        // missiles a fabricator aboard builds per minute
  // what the stock buys: a missile costs its share of the magazine's volume, a drone sortie its share of the hangar's
  t.missileCost = t.missiles ? t.missileVol / t.missiles : 0; t.droneCost = t.drones ? t.droneVol / t.drones : 0;
  t.maxReloads = t.missileCost ? Math.floor(t.fabStock / t.missileCost) : 0;      // if the whole stock went on missiles
  t.maxSorties = t.droneCost ? Math.floor(t.fabStock / t.droneCost) : 0;          // if the whole stock went on drones
  t.upkeep = t.klass === 'structure' ? t.cost * 0.02 / (1 + (passive.maintenance || 0) / 100) : 0;
  t.underDriven = t.klass === 'starship' && t.lift < t.volume - 1e-6;     // too much hull for its star drive: it cannot leave the system
  // where the guns sit; the ones beyond what the weapons computer can run are marked
  const mounts = hardPoints(hull, guns);
  let left = t.mounts;                                       // the computer serves the guns in the order they were added: the newest go short
  for (const g of guns) { const mine = mounts.filter(m => m.modId === g.modId); for (const m of mine) { left -= g.load; m.over = left < -1e-9; } }
  return { mods, t, passive, hull, shields, mounts };
}

// ---------------------------------------------------------------------------
// Making it operational
// ---------------------------------------------------------------------------
const newId = () => 'm' + Math.random().toString(36).slice(2, 9);
// size one dialled module to what the rest of the design needs (reactor → power, weapons computer →
// mounts, star drive → bulk, which creeps up because the drive is part of the bulk it moves)
export function fitModule(S, design, modId, caps = allCapsules(S)) {
  const mod = design.modules.find(m => m.id === modId), K = mod && KINDS[mod.kind], sc = K?.scale;
  if (!sc) return false;
  const before = mod.k || 1, beforeN = mod.n || 1;
  // one module at the top of its dial is not always enough: a big ship carries several reactors,
  // computers, drives (a 4000 ship with fifty guns used to sit at ×4 and fire at a quarter rate)
  if (mod.kind === 'stardrive') {
    mod.k = sc.min; mod.n = 1;
    for (let i = 0; i < 40; i++) { if (!designStats(S, design, caps).t.underDriven) break; if (mod.k < sc.max - 1e-9) mod.k = clamp(mod.k + sc.step, sc.min, sc.max); else if (mod.n < 8) mod.n++; else break; }
  } else {
    const ds = designStats(S, design, caps), me = ds.mods.find(m => m.mod.id === modId), stat = sc.stats[0];
    const total = mod.kind === 'reactor' ? ds.t.powerUse : ds.t.mountsUsed + Math.min(ds.t.drones, 6) * DRONE_CONTROL;   // room for six drones in the air
    const other = ds.mods.filter(m => m.mod.id !== modId && m.kind === mod.kind).reduce((a, m) => a + m.v[stat] * m.n, 0);
    const perK = me.v[stat] / me.k, need = Math.max(0, total - other);
    mod.n = Math.max(1, Math.ceil(need / (perK * sc.max) - 1e-9));
    mod.k = clamp(Math.ceil(need / mod.n / perK / sc.step - 1e-9) * sc.step, sc.min, sc.max);
  }
  return Math.abs(mod.k - before) > 1e-9 || mod.n !== beforeN;
}
// Auto-fit the systems: a weapons computer and a reactor if they are missing, each dialled to the
// need, the star drive to the bulk, and more shields until the hull is covered. Repeats until it
// settles, since every change moves the bulk and the power. Returns what it touched.
export function autoFit(S, design, caps = allCapsules(S)) {
  const touched = new Set();
  for (let round = 0; round < 8; round++) {
    let changed = false;
    const ds = designStats(S, design, caps), t = ds.t, first = kind => design.modules.find(m => m.kind === kind);
    if (ds.mods.some(m => m.K.mount) && !first('weapon_system')) { design.modules.push({ id: newId(), kind: 'weapon_system', caps: [], n: 1, k: 0.5 }); touched.add('a weapons computer added'); changed = true; }
    if (t.powerUse > 0 && !first('reactor')) { design.modules.push({ id: newId(), kind: 'reactor', caps: [], n: 1, k: 0.5 }); touched.add('a reactor added'); changed = true; }
    for (const kind of ['stardrive', 'weapon_system', 'reactor']) { const m = first(kind); if (m && fitModule(S, design, m.id, caps)) { touched.add(KINDS[kind].name.toLowerCase() + ' sized'); changed = true; } }
    const sh = first('shield'), now = designStats(S, design, caps).t;
    if (sh && now.cover < 0.99 && (sh.n || 1) < 8) { sh.n = (sh.n || 1) + 1; touched.add('shields added'); changed = true; }
    if (!changed) break;
  }
  return [...touched];
}

// Which of these gantries builds a hull of `area` squares most cheaply. sections = 1 means it fits
// whole; otherwise the hull is cut into gantry-sized sections and every extra section adds that
// gantry's overhead to the cost. No gantry at all → null: it cannot be built. Shape does not count,
// only size: a wide ship is no harder to build than a long one.
export function dockFit(gantries, area) {
  let best = null;
  for (const gt of gantries) {
    const cap = gt.w * gt.h, sections = Math.max(1, Math.ceil(area / cap - 1e-9)), mult = 1 + (sections - 1) * gt.overhead / 100;
    if (!best || mult < best.mult - 1e-9 || (Math.abs(mult - best.mult) < 1e-9 && cap > best.cap)) best = { ...gt, cap, sections, mult };
  }
  return best;
}
