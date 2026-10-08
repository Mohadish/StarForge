// FLEET DESIGN — a fleet from GRAND TACTICS. The player gives a budget, a number of ships and up to three
// tactics with shares; the plan hands each tactic its money, its ships (brute force buys few big ones, hit
// and run many small ones) and a recipe in words per ship, scaled to that ship's price. Too few ships for
// the tactics → every ship carries the whole mix. Every ship can then be re-priced (the difference flows to
// the unlocked others, the fleet always costs the budget), locked, rewritten in words or rebuilt from chips.
// No DOM. The lab drives it; the game will read the saved plans.
import { designFromWords, designFromChips, shipFromDesign, archetype, fleetOf, rng32, MIN_SHIP, classOf } from './battle.js';
import { hullDef } from './hull.js';

const k = (cost, per, min = 1) => Math.max(min, Math.round(cost / per));
export const TACTICS = {
  brute:  { name: 'Brute force',   what: 'few big hulls, capital guns, thick armour — hold the line and hit what holds it', weight: 0.5,
    recipe: c => `${k(c, 650)} guns capital + armoured${c >= 1100 ? ` + ${k(c, 1100)} beams pd` : ''}${c >= 2000 ? ' + shielded' : ''}` },
  hitrun: { name: 'Hit & run',     what: 'many small fast ships: close, sting, slip away — too quick for heavy turrets', weight: 2,
    recipe: c => `${k(c, 160, 2)} beams + ${k(c, 120, 3)} fast` },
  range:  { name: 'Long range',    what: 'snipers and missiles that reach out and stay out', weight: 1,
    recipe: c => `${k(c, 320)} guns sniper + ${k(c, 700)} missiles${c >= 900 ? ' + armoured' : ''}` },
  replen: { name: 'Replenishable', what: 'drones and missiles with the fabricators to keep them coming', weight: 1,
    recipe: c => `${4 * k(c, 420)} drones + ${k(c, 800)} missiles + ${k(c, 1400)} fabricator` },
  screen: { name: 'Screen',        what: 'point defence and shields: swat missiles and drones, cover the others', weight: 1.3,
    recipe: c => `${k(c, 210, 2)} beams pd + shielded${c < 500 ? ' + fast' : ''}` },
};
export const TACTIC_IDS = Object.keys(TACTICS);

// how many ships each tactic gets, from its share and its appetite (weight): whole numbers, every chosen
// tactic at least one ship; too few ships (fewer than tactics, or one or two) → one blended group
export function allocate(n, mix) {
  const T = mix.length; if (!T || n < 1) return [];
  if (n < T || n <= 2) return [{ ships: n, blend: mix.map(m => ({ ...m })), money: 1 }];
  const w = mix.map(m => m.share * (TACTICS[m.id] ? TACTICS[m.id].weight : 1)), tot = w.reduce((a, b) => a + b, 0) || 1;
  const raw = w.map(x => n * x / tot), counts = raw.map(Math.floor), rem = raw.map((r, i) => r - counts[i]);
  let left = n - counts.reduce((a, b) => a + b, 0);
  counts.forEach((c, i) => { if (c === 0) { counts[i] = 1; left--; rem[i] = -1; } });
  while (left > 0) { let bi = -1; rem.forEach((r, i) => { if (bi < 0 || r > rem[bi]) bi = i; }); counts[bi]++; rem[bi] = -1; left--; }
  while (left < 0) { let bi = 0; counts.forEach((c, i) => { if (c > counts[bi]) bi = i; }); if (counts[bi] <= 1) break; counts[bi]--; left++; }
  return mix.map((m, i) => ({ ships: counts[i], blend: [{ id: m.id, share: 1 }], money: m.share }));
}

// the words for a ship of these tactics at this price: each tactic's recipe, scaled to its share of the price
export const recipeFor = (blend, cost) => blend.map(b => (TACTICS[b.id] ? TACTICS[b.id].recipe : () => '2 beams')(cost * b.share)).join(' + ');
const tacticLabel = blend => blend.map(b => (TACTICS[b.id] ? TACTICS[b.id].name : b.id) + (blend.length > 1 ? ` ${Math.round(b.share * 100)}%` : '')).join(' + ');

// a plan: the fleet before it is built
export function composePlan({ budget = 6000, n = 8, mix = [], seed = 1, name = 'My fleet', style = null, hueA = 200, hueB = 40 } = {}) {
  const live = mix.filter(m => m.share > 0 && TACTICS[m.id]), tot = live.reduce((a, m) => a + m.share, 0) || 1;
  const norm = live.map(m => ({ id: m.id, share: m.share / tot }));
  const groups = allocate(n, norm), ships = [];
  for (const g of groups) {
    if (!g.ships) continue;
    const each = Math.max(MIN_SHIP, budget * g.money / g.ships);
    for (let i = 0; i < g.ships; i++) ships.push({ blend: g.blend, cost: each, locked: false, custom: false, chips: null, words: recipeFor(g.blend, each), seed: seed * 97 + ships.length });
  }
  // rounding to the floor can leave money on the table or over-spend a little: settle it on the unlocked ships
  const spent = ships.reduce((a, s) => a + s.cost, 0), fix = (budget - spent) / (ships.length || 1);
  for (const s of ships) { s.cost = Math.max(MIN_SHIP, s.cost + fix); if (!s.custom) s.words = recipeFor(s.blend, s.cost); }
  return { name, budget, n, mix: norm, style, hueA, hueB, seed, ships };
}

// re-price one ship: the difference flows to the UNLOCKED others in proportion to their price, nobody under
// MIN_SHIP, the fleet still costing the budget. Returns the indexes whose price moved (they need rebuilding).
export function setCost(plan, i, cost) {
  const ship = plan.ships[i], others = plan.ships.filter((s, j) => j !== i && !s.locked);
  const lockedSum = plan.ships.filter((s, j) => j !== i && s.locked).reduce((a, s) => a + s.cost, 0);
  const max = plan.budget - lockedSum - others.length * MIN_SHIP;
  cost = Math.max(MIN_SHIP, Math.min(max, cost));
  if (!others.length) cost = ship.cost;                                           // nothing to take from or give to
  let need = ship.cost - cost; const moved = new Set(); if (Math.abs(need) < 0.5) return [];
  ship.cost = cost; moved.add(i);
  for (let pass = 0; pass < 6 && Math.abs(need) > 0.5; pass++) {
    const pool = others.filter(o => need > 0 || o.cost > MIN_SHIP + 0.5), tot = pool.reduce((a, o) => a + o.cost, 0); if (!pool.length || !tot) break;
    let given = 0; for (const o of pool) { const nc = Math.max(MIN_SHIP, o.cost + need * o.cost / tot); given += nc - o.cost; if (Math.abs(nc - o.cost) > 0.5) moved.add(plan.ships.indexOf(o)); o.cost = nc; }
    need -= given;
  }
  for (const j of moved) { const s = plan.ships[j]; if (!s.custom && !s.chips) s.words = recipeFor(s.blend, s.cost); }
  return [...moved];
}

// the chips builder's tray from words, and back — so a ship written in words can be reshaped with chips
const WORD_KIND = { beam: 'weapon_energy', beams: 'weapon_energy', laser: 'weapon_energy', lasers: 'weapon_energy', gun: 'weapon_kinetic', guns: 'weapon_kinetic', kinetic: 'weapon_kinetic', kinetics: 'weapon_kinetic', cannon: 'weapon_kinetic', missile: 'weapon_missile', missiles: 'weapon_missile', torpedo: 'weapon_missile', drone: 'hangar', drones: 'hangar', fighter: 'hangar', fighters: 'hangar' };
const WORD_ROLE = { sniper: 'sniper', capital: 'capital', pd: 'pd', point: 'pd', defence: 'pd', defense: 'pd', antishield: 'antishield', 'anti-shield': 'antishield', antiarmor: 'antiarmor', antiarmour: 'antiarmor', 'anti-armour': 'antiarmor', 'anti-armor': 'antiarmor' };
export function wordsToChips(text) {
  const out = []; let id = 1;
  for (const part of String(text).toLowerCase().split(/[+,;/]| and | with /).map(s => s.trim()).filter(Boolean)) {
    const words = part.split(/\s+/), kind = WORD_KIND[words.find(w => WORD_KIND[w])], count = +(words.find(w => /^\d+$/.test(w)) || 0), role = WORD_ROLE[words.find(w => WORD_ROLE[w])] || null;
    if (kind === 'hangar') out.push({ id: id++, type: 'weapon', kind, h: Math.max(1, Math.round((count || 4) / 4)), role: null });
    else if (kind) out.push({ id: id++, type: 'weapon', kind, h: Math.max(1, Math.round((count || 2) / 2)), role });
    else if (/armou?r/.test(part)) out.push({ id: id++, type: 'trait', kind: 'armor', h: Math.max(1, Math.round((count || (/heav|thick/.test(part) ? 8 : 4)) / 4)), role: null });
    else if (/shield/.test(part)) out.push({ id: id++, type: 'trait', kind: 'shield', h: Math.max(1, Math.round((count || (/heav|double|strong/.test(part) ? 4 : 2)) / 2)), role: null });
    else if (/fast|quick|agile|nimble/.test(part)) out.push({ id: id++, type: 'trait', kind: 'fast', h: Math.max(1, Math.round((count || 3) / 3)), role: null });
    else if (/fab|factory|works|reload/.test(part)) out.push({ id: id++, type: 'trait', kind: 'fab', h: Math.max(1, count || 1), role: null });
  }
  return out;
}
const CHIP_WORD = { weapon_energy: 'beams', weapon_kinetic: 'guns', weapon_missile: 'missiles', hangar: 'drones' };
export const chipsToWords = stacks => stacks.map(s => CHIP_WORD[s.kind] ? `${s.kind === 'hangar' ? 4 * s.h : 2 * s.h} ${CHIP_WORD[s.kind]}${s.role ? ' ' + s.role : ''}` : s.kind === 'armor' ? `${4 * s.h} armoured` : s.kind === 'shield' ? `${2 * s.h} shielded` : s.kind === 'fast' ? `${3 * s.h} fast` : `${s.h} fabricator`).join(' + ');   // a chip is a weapon by its kind, whether or not it carries a `type`

// build the plan's ships for the lab (each from its words or its chips, at its price, with its own dice — a
// re-price does not reshuffle a design) and the fleet they make
export function buildPlan(S, plan, letter = 'abcdefghijklmnopqrstuvwxy', num = '') {
  const ships = plan.ships.map((p, i) => {
    const rng = rng32(p.seed), d = p.chips ? designFromChips(S, p.chips.map(c => ({ kind: c.kind, h: c.h, role: c.role })), p.cost, rng) : designFromWords(S, p.words, p.cost, rng);
    if (!d) return null;
    if (p.hull && hullDef(p.hull)) d.hull = p.hull;                                // the silhouette the designer gave it (a custom one travels in plan.hulls and must be registered first)
    const s = shipFromDesign(S, d); s.arch = archetype(s); s.name = `${num}${letter[i] || i + 1}`; s.plan = p; p.built = s; return s;
  }).filter(Boolean);
  const f = fleetOf(ships, plan.name, 'planned'); f.plan = plan; return f;
}
export const shipLabel = p => `${p.built ? classOf(p.built.cost) : ''} · ${tacticLabel(p.blend)}`;

// saved plans: a list in the browser, and a code to carry one between pages or into the game
export const PLANS_KEY = 'forge.eon.fleets.v1';
export const plansLoad = () => { try { return JSON.parse(localStorage.getItem(PLANS_KEY) || '[]'); } catch (e) { return []; } };
export const plansSave = list => { try { localStorage.setItem(PLANS_KEY, JSON.stringify(list)); } catch (e) { /* storage may be off */ } };
export const planStrip = plan => ({ ...plan, ships: plan.ships.map(({ built, ...p }) => p) });
// the code: FLEET2 carries the plan, its two colours, and any hand-drawn silhouettes its ships wear (so it builds anywhere)
export const planCode = plan => 'FLEET2:' + btoa(unescape(encodeURIComponent(JSON.stringify(planStrip(plan)))));
export const planFromCode = code => { try { const m = String(code).trim().match(/^FLEET[12]:(.+)$/s); const p = JSON.parse(decodeURIComponent(escape(atob((m ? m[1] : String(code).trim()).replace(/\s+/g, ''))))); return p && Array.isArray(p.ships) ? p : null; } catch (e) { return null; } };
