// THE COMPONENTS' CHARACTER (his call, 2026-10-24: "it's a brand new energy weapon — it does something different: more effective
// against shields, more effective at longer ranges… not an upgraded weapon"). A finished ship-family project makes a component that is
// its OWN THING: a main TRAIT — from the field of the family's recipe that fed it best — and, when a second field fed it well too, a
// lesser one. A trait has its GOOD side, as big as that field was rich (strength s 0…1: [lo, hi]), and its PRICE, always the same (a
// plain number). The component also has a LOOK — its physical form (weaponart.js draws it): long barrels reach far, many barrels fire
// fast, thick ones hit hard, and the colour says what it does. Pure, no DOM.
//
// mul: × on the module's own stats (modules.js KINDS: damage rate range accuracy power charges · craft size · capacity recovery radius ·
// hp deflect repair · thrust evasion lift · output reserve · mounts bonus), on its cost and volume, and `pace` (a star drive: between the
// stars). fx: what it does in battle (battle.js strike): sh / ar × the damage to a shield / to armour, pierce + share through the shield,
// burn + share of a hit burnt into armour and hull over BURN seconds, nod ignores armour's deflection, slip × the chance point defence
// hits it (a missile), seek × the target's evasion (a missile).
export const TRAITS = {
  beam: {
    energy:  { id: 'disruptor', adj: 'Disruptor', good: 'tears into shields', bad: 'weak on armour', fx: { sh: [1.35, 2.1], ar: 0.8 }, col: '#5aa8ff' },
    optics:  { id: 'long', adj: 'Long', good: 'reaches far and aims true', bad: 'fires slower', mul: { range: [1.4, 2.2], accuracy: [1.03, 1.1], rate: 0.8 }, col: '#e6fbff' },
    thermal: { id: 'ember', adj: 'Ember', good: 'burns through armour', bad: 'short reach', fx: { ar: [1.3, 1.8], burn: [0.15, 0.4] }, mul: { range: 0.75 }, col: '#ff7a29' },
  },
  gun: {
    materials:   { id: 'penetrator', adj: 'Penetrator', good: 'shrugs off armour plating', bad: 'shields stop more of it', fx: { ar: [1.2, 1.6], nod: 1, sh: 0.8 }, col: '#ffb347' },
    fabrication: { id: 'auto', adj: 'Auto', good: 'a hail of shells', bad: 'each one lighter', mul: { rate: [1.6, 2.4], damage: 0.7 }, col: '#ffe08a' },
    motion:      { id: 'rail', adj: 'Rail', good: 'long reach, part of it through shields', bad: 'slow to reload', mul: { range: [1.4, 2], rate: 0.75 }, fx: { pierce: [0.2, 0.4] }, col: '#7fd8ff' },
  },
  missile: {
    fabrication: { id: 'cluster', adj: 'Cluster', good: 'hard to shoot down', bad: 'carries fewer', fx: { slip: [0.6, 0.3] }, mul: { charges: 0.75 }, col: '#ffd84f' },
    materials:   { id: 'bunker', adj: 'Bunker', good: 'cracks armour', bad: 'shields catch more of it', fx: { ar: [1.4, 2], sh: 0.75 }, col: '#ff6b5b' },
    life:        { id: 'seeker', adj: 'Seeker', good: 'finds the slippery ships', bad: 'a smaller warhead', fx: { seek: [0.6, 0.25] }, mul: { damage: 0.85 }, col: '#8fd16a' },
    motion:      { id: 'salvo', adj: 'Salvo', good: 'launches twice as fast — a burst before they can answer', bad: 'a lighter warhead', mul: { rate: [1.5, 2.2], damage: 0.8 }, col: '#5fe0b4' },   // (more reach parked the ship at the arena's edge; more speed did nothing — point defence shoots a missile the moment it leaves)
  },
  drones: {
    information: { id: 'swarm', adj: 'Swarm', good: 'more drones in every bay', bad: 'smaller craft', mul: { craft: [1.3, 1.8], size: 0.85 } },
    motion:      { id: 'lean', adj: 'Lean', good: 'draws far less power', bad: 'a little smaller', mul: { power: [0.7, 0.45], size: 0.9 } },
    fabrication: { id: 'heavy', adj: 'Heavy', good: 'bigger, harder-hitting craft', bad: 'fewer of them', mul: { size: [1.25, 1.6], craft: 0.8 } },
  },
  armor: {
    materials:   { id: 'dense', adj: 'Dense', good: 'holds far more', bad: 'bulkier', mul: { hp: [1.3, 1.8], volume: 1.2 } },
    fabrication: { id: 'light', adj: 'Light', good: 'much less bulk', bad: 'holds a little less', mul: { volume: [0.75, 0.5], hp: 0.9 } },
    thermal:     { id: 'ablative', adj: 'Ablative', good: 'shrugs off far more of every hit', bad: 'holds less', mul: { deflect: [1.8, 3], hp: 0.85 } },
  },
  shield: {
    motion:      { id: 'wide', adj: 'Wide', good: 'covers more of the hull', bad: 'holds less', mul: { radius: [1.25, 1.7], capacity: 0.85 } },
    energy:      { id: 'deep', adj: 'Deep', good: 'holds far more', bad: 'recovers slower', mul: { capacity: [1.3, 1.9], recovery: 0.8 } },
    electrics:   { id: 'quick', adj: 'Quick', good: 'recovers fast', bad: 'holds less', mul: { recovery: [1.5, 2.4], capacity: 0.8 } },
    fabrication: { id: 'light', adj: 'Light', good: 'less bulk, cheaper', bad: 'draws more power', mul: { volume: [0.75, 0.55], cost: [0.85, 0.7], power: 1.2 } },
  },
  reactor: {
    energy:    { id: 'hot', adj: 'Hot', good: 'more power', bad: 'a smaller reserve', mul: { output: [1.3, 1.7], reserve: 0.8 } },
    thermal:   { id: 'buffer', adj: 'Buffered', good: 'a deep reserve', bad: 'a little less output', mul: { reserve: [1.6, 2.6], output: 0.9 } },
    materials: { id: 'compact', adj: 'Compact', good: 'much less bulk', bad: 'dearer', mul: { volume: [0.75, 0.5], cost: 1.15 } },
  },
  drive: {
    motion:  { id: 'swift', adj: 'Swift', good: 'faster and further between the stars', bad: 'moves a little less hull', mul: { pace: [1.25, 1.7], lift: 0.9 } },
    energy:  { id: 'heavy', adj: 'Heavy', good: 'moves much more hull', bad: 'a little slower between the stars', mul: { lift: [1.3, 1.8], pace: 0.92 } },
    thermal: { id: 'cool', adj: 'Cool', good: 'draws far less power', bad: 'less battle thrust', mul: { power: [0.7, 0.45], thrust: 0.85 } },
  },
  thruster: {
    motion:      { id: 'burst', adj: 'Burst', good: 'pushes harder', bad: 'draws more power', mul: { thrust: [1.3, 1.8], power: 1.2 } },
    electrics:   { id: 'vector', adj: 'Vector', good: 'dodges better', bad: 'a little less thrust', mul: { evasion: [1.3, 1.8], thrust: 0.9 } },
    fabrication: { id: 'light', adj: 'Light', good: 'much less bulk', bad: 'dearer', mul: { volume: [0.75, 0.5], cost: 1.15 } },
  },
  computer: {
    electrics:   { id: 'broad', adj: 'Broad', good: 'runs more guns', bad: 'aims a little worse', mul: { mounts: [1.3, 1.8], bonus: 0.8 } },
    information: { id: 'predictive', adj: 'Predictive', good: 'a truer aim', bad: 'runs fewer guns', mul: { bonus: [1.5, 2.5], mounts: 0.9 } },
    optics:      { id: 'quiet', adj: 'Quiet', good: 'draws far less power', bad: 'dearer', mul: { power: [0.7, 0.45], cost: 1.15 } },
  },
};
// the names: the main trait's word and a noun of the family's, the first one free
const NOUNS = { beam: ['Lance', 'Ray', 'Spear', 'Needle', 'Torch', 'Halo', 'Lash', 'Arc', 'Glaive', 'Pike'], gun: ['Driver', 'Cannon', 'Hammer', 'Bolt', 'Repeater', 'Maul', 'Rifle', 'Slug'],
  missile: ['Viper', 'Dart', 'Hornet', 'Javelin', 'Shrike', 'Kestrel', 'Harrier', 'Wyrm'], drones: ['Wasp', 'Gnat', 'Moth', 'Midge', 'Hornet'], armor: ['Plate', 'Mail', 'Shell', 'Hide', 'Bulwark'],
  shield: ['Aegis', 'Veil', 'Ward', 'Screen', 'Mantle'], reactor: ['Heart', 'Core', 'Kiln', 'Furnace'], drive: ['Strider', 'Fold', 'Leap', 'Wake'], thruster: ['Swift', 'Kick', 'Vane', 'Fin'], computer: ['Oracle', 'Mind', 'Eye', 'Loom'] };
export const SECOND = { k: 0.6, min: 0.4, share: 0.6 };      // a second trait: at k of its strength, its price at half; only when its field is at least min strong and fed share of the first
export const BURN = 4;                                        // seconds a burn takes to eat its share (battle.js)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
// a field's strength for a project (research.js strengthOf: 0.55 … ~1.7) → a trait's s, 0 … 1
export const sOf = st => clamp((st - 0.55) / 1.0, 0, 1);
// WHICH TRAITS: per field of the recipe its strength — what it averaged while it fed the project (feed / fed), or what it is now —
// weighted by its share; the best is the main trait, the next one a lesser trait when it is strong enough
export function traitsFrom(fam, chs, feed = null, fed = 0) {
  const T = TRAITS[fam]; if (!T) return [];
  const rows = chs.filter(c => T[c.id]).map(c => { const st = fed > 0 && feed && feed[c.id] > 0 ? feed[c.id] / (fed * c.w) : c.strength; return { field: c.id, st, score: c.w * st, s: sOf(st) }; }).sort((a, b) => b.score - a.score || (a.field < b.field ? -1 : 1));
  if (!rows.length) return [];
  const out = [{ id: T[rows[0].field].id, field: rows[0].field, s: +rows[0].s.toFixed(3), main: true }], r2 = rows[1];
  if (r2 && r2.s >= SECOND.min && r2.score >= SECOND.share * rows[0].score) out.push({ id: T[r2.field].id, field: r2.field, s: +r2.s.toFixed(3), main: false });
  return out;
}
// what the traits make: the multipliers and the battle effects together
export function makeup(fam, traits) {
  const mul = {}, fx = {}, T = TRAITS[fam] || {};
  for (const t of traits) {
    const D = T[t.field]; if (!D) continue; const k = t.main ? t.s : t.s * SECOND.k, soft = t.main ? 1 : 0.5;
    const val = v => Array.isArray(v) ? (t.main ? lerp(v[0], v[1], k) : 1 + (lerp(v[0], v[1], k) - 1) * SECOND.k) : 1 + (v - 1) * soft;   // the good side by strength; the price fixed (a second trait's at half)
    for (const [key, v] of Object.entries(D.mul || {})) mul[key] = (mul[key] || 1) * val(v);
    for (const [key, v] of Object.entries(D.fx || {})) {
      if (key === 'pierce' || key === 'burn') fx[key] = (fx[key] || 0) + (Array.isArray(v) ? lerp(v[0], v[1], k) : v) * (t.main ? 1 : SECOND.k);
      else if (key === 'nod') fx.nod = 1;
      else fx[key] = (fx[key] || 1) * val(v);
    }
  }
  for (const o of [mul, fx]) for (const key of Object.keys(o)) o[key] = +o[key].toFixed(3);
  return { mul, fx };
}
// THE PHYSICAL FORM (weaponart.js draws it): from the family, the traits and what they make — seen from above, the barrels forward
export function lookOf(fam, traits, mul, seed) {
  const main = traits[0], D = main && TRAITS[fam] ? TRAITS[fam][main.field] : null;
  const L = { fam, trait: main ? main.id : null, trait2: traits[1] ? traits[1].id : null, col: (D && D.col) || null, seed };
  if (fam === 'beam' || fam === 'gun' || fam === 'missile') {
    L.len = +clamp(0.85 + 0.75 * ((mul.range || 1) - 1), 0.6, 1.8).toFixed(2);
    L.thick = +clamp(1 + 0.6 * ((mul.damage || 1) - 1), 0.6, 1.5).toFixed(2);
    L.barrels = fam === 'gun' ? ((mul.rate || 1) >= 1.5 ? 3 : (mul.rate || 1) >= 1.15 ? 2 : 1) : fam === 'beam' ? ((mul.rate || 1) >= 1.15 ? 2 : 1) : 0;
    if (fam === 'missile') L.tubes = clamp(Math.round(4 * (mul.charges || 1) * (main && main.id === 'cluster' ? 2 : 1)), 2, 9);
  }
  return L;
}
// SOMETHING EXTRAORDINARY (his rule, 2026-10-30: "a game of chance — excellent in two or three of its fields and there is a very good
// chance of something unique"): a finished component may come out EXTRAORDINARY — one effect no plain research gives. The chance grows
// with how strong the recipe's fields were while they fed it (every field past `from` adds k × the excess, from `base` up to `cap`); the
// forecast tells only how likely, never what — a surprise. Which one: the family's list, by the field that fed it best; how strong: the
// best field's. fx go into the model's fx (battle.js; armour heal / shield drink / computer autopd reach the ship through modules.js).
export const RARE = { base: 0.05, from: 0.4, k: 0.7, cap: 0.85 };
export const EXTRA = {
  beam:     [{ id: 'emp', adj: 'Ion', good: 'drains shields and holds them down: a field it hits does not recover for a long while', fx: { emp: [0.4, 0.8] }, col: '#9fd8ff' }],
  gun:      [{ id: 'delam', adj: 'Shear', good: 'tears armour by its size: the heavier the plating, the more each hit strips away', fx: { delam: [0.5, 1] }, col: '#ffcf7a' }],
  missile:  [{ id: 'volatile', adj: 'Nova', good: 'a ship it finishes blows apart and hurts everything around it', fx: { blast: [0.2, 0.4] }, col: '#ff9a3c' }],
  armor:    [{ id: 'living', adj: 'Living', good: 'the hull under it knits itself back, free, all through the battle', fx: { heal: [0.003, 0.006] } }],
  shield:   [{ id: 'thirst', adj: 'Thirsting', good: 'drinks the beams that hit it: they cool the ship instead of heating it, and top the field back up', fx: { drink: [0.2, 0.4] } }],
  computer: [{ id: 'sentinel', adj: 'Sentinel', good: 'every gun turns on the missiles coming at the ship, and hits them far more often', fx: { autopd: [1.4, 2] } }],
};
// a field's strength as it fed the project (its average while feeding), else as it is now
const fieldS = (chs, feed, fed) => chs.map(c => { const st = fed > 0 && feed && feed[c.id] > 0 ? feed[c.id] / (fed * c.w) : c.strength; return { field: c.id, w: c.w, st, s: sOf(st) }; });
export function rareChance(fam, chs, feed = null, fed = 0) {
  if (!EXTRA[fam]) return 0;
  const x = fieldS(chs, feed, fed).reduce((a, r) => a + Math.max(0, r.s - RARE.from), 0);
  return +Math.min(RARE.cap, RARE.base + RARE.k * x).toFixed(3);
}
// a die that does not touch the game's own dice (the same key, the same throw — replays stay true)
const die = key => { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
export function rollRare(fam, chs, feed, fed, key) {
  const p = rareChance(fam, chs, feed, fed); if (!p || die(String(key)) >= p) return null;
  const rows = fieldS(chs, feed, fed).sort((a, b) => b.w * b.st - a.w * a.st || (a.field < b.field ? -1 : 1)), L = EXTRA[fam], D = L.find(e => e.field === rows[0].field) || L[0];
  return { id: D.id, field: rows[0].field, s: +Math.max(...rows.map(r => r.s)).toFixed(3) };
}
const rareDef = (fam, rare) => rare && EXTRA[fam] ? EXTRA[fam].find(e => e.id === rare.id) || null : null;
export const rareFx = (fam, rare) => { const D = rareDef(fam, rare), out = {}; if (D) for (const [k, v] of Object.entries(D.fx)) out[k] = +(Array.isArray(v) ? lerp(v[0], v[1], rare.s) : v).toFixed(4); return out; };
export const rareWords = (fam, rare) => { const D = rareDef(fam, rare); return D ? { adj: D.adj, good: D.good, col: D.col || '#ffd26a' } : null; };
// the forecast in words: how likely, never what
export const chanceWord = p => p >= 0.6 ? 'a very good chance' : p >= 0.3 ? 'a good chance' : p >= 0.12 ? 'some chance' : null;
// a name nobody in the empire has given yet (an extraordinary one takes its own word)
export function nameFor(S, fam, traits, base, adj0 = null) {
  const T = TRAITS[fam], adj = adj0 || (traits[0] && T ? T[traits[0].field].adj : 'New'), nouns = [base, ...(NOUNS[fam] || [])].filter((x, i, a) => x && a.indexOf(x) === i), taken = new Set((S.models || []).map(m => m.name));
  for (const n of nouns) if (!taken.has(`${adj} ${n}`)) return `${adj} ${n}`;
  for (let k = 2; ; k++) if (!taken.has(`${adj} ${nouns[0]} ${k}`)) return `${adj} ${nouns[0]} ${k}`;
}
// the words of a trait (its good side and its price), for the cards
export const traitWords = (fam, t) => { const D = TRAITS[fam] && TRAITS[fam][t.field]; return D ? { adj: D.adj, good: D.good, bad: D.bad, col: D.col || null } : null; };
// how a trait's strength reads
export const sWord = s => s >= 0.75 ? 'outstanding' : s >= 0.5 ? 'strong' : s >= 0.25 ? 'fair' : 'faint';
