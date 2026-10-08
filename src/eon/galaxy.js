// THE GALAXY — star systems scattered over a flat, round disc, every one of them grown from a seed.
// The same seed always gives the same galaxy: where the stars are, what they are called, what
// circles them and what there is to learn at each place. Nothing here touches the game's own dice.
//
// EVERY PLACE has all nine research fields: most at 5%, two or three at 30%, one higher. A
// remarkable place has one field at 80% or two at 60% instead. What a place IS (a blue giant, an
// ice world, an anomaly…) only makes some fields likelier to be the high ones.
import { DOMAINS } from '../data/properties.js';

export const GALAXY = { count: 50, radius: 100, minGap: 13, shape: 'round' };
const FIELD_IDS = Object.keys(DOMAINS);
const perField = v => Object.fromEntries(FIELD_IDS.map(f => [f, v]));

// `likes` = which fields this kind of place tends to be good for; `cool` = chance it is remarkable;
// `life` = how friendly the star is to living worlds; `planets` = the most worlds it can hold.
export const STARS = {
  yellow:  { name: 'yellow star',  color: '#ffd06a', size: 1.0,  weight: 30, cool: 0.10, life: 1.0, planets: 5, likes: { energy: 4, optics: 2, thermal: 2 } },
  orange:  { name: 'orange star',  color: '#ffab5e', size: 0.9,  weight: 22, cool: 0.10, life: 1.0, planets: 5, likes: { thermal: 3, energy: 3, life: 1 } },
  red:     { name: 'red dwarf',    color: '#ff7a5c', size: 0.7,  weight: 26, cool: 0.08, life: 0.5, planets: 4, likes: { thermal: 4, electrics: 2, motion: 1 } },
  white:   { name: 'white dwarf',  color: '#eef2ff', size: 0.6,  weight: 10, cool: 0.30, life: 0.1, planets: 3, likes: { materials: 4, optics: 3, thermal: 1 } },
  blue:    { name: 'blue giant',   color: '#8fc4ff', size: 1.45, weight: 8,  cool: 0.60, life: 0.2, planets: 3, likes: { energy: 5, optics: 3, fabrication: 1 } },
  neutron: { name: 'neutron star', color: '#b9a8ff', size: 0.5,  weight: 4,  cool: 1.00, life: 0,   planets: 2, likes: { motion: 5, electrics: 4, energy: 2 } },
};
export const WORLDS = {
  hot:     { name: 'hot rocky world', kind: 'planet',  landable: true,  color: '#d9825b', cool: 0.12, likes: { thermal: 4, materials: 3, energy: 2 } },
  barren:  { name: 'barren rock',     kind: 'planet',  landable: true,  color: '#a79c8e', cool: 0.12, likes: { materials: 4, fabrication: 3, motion: 1 } },
  living:  { name: 'living world',    kind: 'planet',  landable: true,  color: '#5fc48a', cool: 0.15, likes: { life: 5, information: 2, fabrication: 1 } },
  ocean:   { name: 'ocean world',     kind: 'planet',  landable: true,  color: '#4fa3ff', cool: 0.12, likes: { life: 3, motion: 3, thermal: 1 } },
  ice:     { name: 'ice world',       kind: 'planet',  landable: true,  color: '#bfe6ff', cool: 0.12, likes: { electrics: 3, optics: 3, thermal: 2 } },
  giant:   { name: 'gas giant',       kind: 'giant',   landable: false, color: '#c9a86b', cool: 0.12, likes: { motion: 4, electrics: 3, thermal: 2, energy: 1 } },
  moon:    { name: 'moon',            kind: 'moon',    landable: true,  color: '#b8c4d8', cool: 0.20, likes: { materials: 4, fabrication: 3, optics: 2 } },
  anomaly: { name: 'anomaly',         kind: 'anomaly', landable: false, color: '#cf89ff', cool: 1.00, likes: { optics: 3, electrics: 3, information: 3, energy: 2, motion: 2 } },
};
const PLANET_COUNT = [[0, 8], [1, 18], [2, 26], [3, 24], [4, 16], [5, 8]];
const ANOMALY_CHANCE = 0.16;
const ANOMALIES = [['Rift', 'a tear in space nobody can explain'], ['Lantern', 'a knot of light that does not move'], ['Hush', 'a region where clocks disagree'],
  ['Choir', 'a cloud that answers radio with radio'], ['Shroud', 'a shell of something older than the star'], ['Seam', 'a line where two skies do not quite meet']];
const NA = ['Vael', 'Orr', 'Kyn', 'Tes', 'Mar', 'Ith', 'Dra', 'Qel', 'Nov', 'Ash', 'Bry', 'Cor', 'Zan', 'Lum', 'Ery', 'Hal', 'Ost', 'Pyr', 'Ren', 'Ul', 'Sar', 'Fen', 'Gol', 'Jun',
  'Kes', 'Myr', 'Nab', 'Oth', 'Rhi', 'Tal', 'Ves', 'Wyn', 'Xan', 'Yor', 'Zel', 'Aur', 'Bel', 'Cas', 'Dor', 'Eld'];
const NB = ['a', 'is', 'on', 'ar', 'us', 'eth', 'ia', 'or', 'um', 'en', 'ix', 'os', 'ara', 'iel', 'une'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// the galaxy's own dice — one stream per seed
function dice(seed) {
  let a = (seed ^ 0x9E3779B9) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pickW = (R, entries) => {
  const list = entries.filter(e => e[1] > 0);
  let r = R() * list.reduce((a, e) => a + e[1], 0);
  for (const e of list) if ((r -= e[1]) <= 0) return e[0];
  return list[list.length - 1][0];
};

// The shape of the galaxy = where one star may fall. More shapes later are one line each.
const SHAPES = {
  round: (R, radius) => { const r = radius * Math.pow(R(), 0.6), a = R() * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r]; },   // a disc, a little denser toward the middle
};

// what there is to learn at one place
function profile(R, likes, coolChance) {
  const mult = perField(0.05), free = new Set(FIELD_IDS);
  const take = () => { const f = pickW(R, [...free].map(id => [id, 1 + 3 * (likes[id] || 0)])); free.delete(f); return f; };   // any field can turn up
  const cool = R() < coolChance;
  if (cool) { if (R() < 0.5) mult[take()] = 0.8; else { mult[take()] = 0.6; mult[take()] = 0.6; } }
  else mult[take()] = R() < 0.5 ? 0.4 : 0.5;
  for (let n = R() < 0.5 ? 2 : 3; n > 0; n--) mult[take()] = 0.3;
  return { mult, cool };
}

function worldFor(R, t, star) {                     // t: 0 = closest to the star, 1 = farthest out
  const mid = c => Math.max(0, 1 - Math.abs(t - c) * 3);
  return pickW(R, [['hot', Math.max(0, 1 - 2.2 * t) * 4], ['barren', 1.6], ['living', 1.6 * mid(0.45) * star.life], ['ocean', 1.1 * mid(0.5) * star.life],
    ['ice', Math.max(0, 2.2 * t - 0.9) * 3], ['giant', 0.4 + 2.2 * t]]);
}

function buildSystem(R, sys, places) {
  const star = STARS[sys.type];
  const add = (name, W, note, likes, coolChance, o) => {
    const p = profile(R, likes, coolChance);
    const pl = { id: `${sys.id}.${places.filter(x => x.sys === sys.id).length}`, sys: sys.id, name, kind: W.kind, note, landable: W.landable, color: W.color,
      mult: p.mult, fresh: perField(1), colony: null, ...o };
    if (p.cool) pl.cool = true;
    places.push(pl); return pl;
  };
  sys.star = add(sys.name, { kind: 'star', landable: false, color: star.color }, `a ${star.name} — it can only be studied from orbit, or from afar by every lab in this system`,
    star.likes, star.cool, { r: 0, a: 0, size: star.size }).id;
  const n = Math.min(star.planets, pickW(R, PLANET_COUNT)), anomaly = R() < ANOMALY_CHANCE, slots = n + (anomaly ? 1 : 0);
  const anomalyAt = anomaly ? Math.floor(R() * slots) : -1, a0 = R() * Math.PI * 2;
  let pn = 0;
  for (let i = 0; i < slots; i++) {
    const t = slots === 1 ? 0.45 : i / (slots - 1), at = { r: Math.round((0.22 + 0.70 * t) * 1000) / 1000, a: a0 + i * 2.4 + (R() - 0.5) * 0.8 };
    if (i === anomalyAt) {
      const [word, what] = ANOMALIES[Math.floor(R() * ANOMALIES.length)];
      add(`${sys.name} ${word}`, WORLDS.anomaly, `${what} — it can only be studied from orbit`, WORLDS.anomaly.likes, WORLDS.anomaly.cool, at);
      continue;
    }
    const W = WORLDS[worldFor(R, t, star)], name = `${sys.name} ${ROMAN[pn++]}`;
    add(name, W, W.kind === 'giant' ? 'a gas giant — nothing can land, it can only be studied from orbit' : `a ${W.name}, never settled`, W.likes, W.cool, at);
    if (R() < (W.kind === 'giant' ? 0.5 : 0.25)) add(name + 'a', WORLDS.moon, `a moon of ${name}, never settled`, WORLDS.moon.likes, WORLDS.moon.cool, { ...at, moon: true });
  }
}

// the one system that is not random: where your people come from
function homePlaces(sys) {
  const hp = (id, name, kind, note, landable, color, high, o) => ({ id, sys, name, kind, note, landable, color, mult: { ...perField(0.05), ...high }, fresh: perField(1), colony: null, ...o });
  return [
    hp('sun', 'Sol', 'star', 'a yellow star — it can only be studied from orbit, or from afar by every lab in this system', false, '#ffd06a', { energy: 0.6, optics: 0.3, thermal: 0.3 }, { r: 0, a: 0, size: 1 }),
    hp('ember', 'Ember', 'planet', 'a hot rocky world, never settled', true, '#d9825b', { thermal: 0.6, materials: 0.3, energy: 0.3 }, { r: 0.24, a: 3.5 }),
    hp('home', 'Home', 'planet', 'the homeworld — your people have lived here for 2,000 years', true, '#4fa3ff', { life: 0.6, information: 0.3, fabrication: 0.3, materials: 0.3 }, { r: 0.44, a: 5.6 }),
    hp('shard', 'Shard', 'moon', 'an exotic moon of Home, never settled', true, '#b8c4d8', { materials: 0.8, fabrication: 0.3, optics: 0.3 }, { r: 0.44, a: 5.6, moon: true, cool: true }),
    hp('titan', 'Titan', 'giant', 'a gas giant — nothing can land, it can only be studied from orbit', false, '#c9a86b', { motion: 0.6, electrics: 0.3, thermal: 0.3 }, { r: 0.66, a: 1.6 }),
    hp('veil', 'The Veil', 'anomaly', 'a tear in space nobody can explain — it can only be studied from orbit', false, '#cf89ff', { optics: 0.8, electrics: 0.3, information: 0.3 }, { r: 0.9, a: 2.6, cool: true }),
  ];
}

export function generateGalaxy(seed, o = {}) {
  const { count, radius, minGap, shape } = { ...GALAXY, ...o }, R = dice(seed);
  const pts = [];
  for (let tries = 0; pts.length < count && tries < 40000; tries++) {
    const [x, y] = SHAPES[shape](R, radius), gap = tries < 20000 ? minGap : minGap * 0.6;
    if (pts.every(p => Math.hypot(p[0] - x, p[1] - y) >= gap)) pts.push([x, y]);
  }
  // home is the star nearest to halfway out
  const off = p => Math.abs(Math.hypot(p[0], p[1]) - radius * 0.55);
  let homeAt = 0; pts.forEach((p, i) => { if (off(p) < off(pts[homeAt])) homeAt = i; });
  const names = new Set(['Sol']), systems = [], places = [];
  pts.forEach(([x, y], i) => {
    const sys = { id: 's' + i, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    if (i === homeAt) { Object.assign(sys, { name: 'Sol', type: 'yellow', home: true, star: 'sun' }); places.push(...homePlaces(sys.id)); }
    else {
      do sys.name = NA[Math.floor(R() * NA.length)] + NB[Math.floor(R() * NB.length)]; while (names.has(sys.name));
      names.add(sys.name);
      sys.type = pickW(R, Object.entries(STARS).map(([k, s]) => [k, s.weight]));
      buildSystem(R, sys, places);
    }
    systems.push(sys);
  });
  return { systems, places, home: 's' + homeAt };
}
