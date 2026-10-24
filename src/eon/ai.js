// THE AI EMPIRE'S HEAD (his ask, 2026-10-16: "two or three AIs fighting for galaxy domination" — and then "when you take over,
// the AI stops": the head now lives here, pure, so the game runs it for the other empires while a human plays one). One brain
// per empire, on a WORLD (world.js). Every eon `plan()` gives its orders through applyWorldAction — the same orders a player
// gives — then the world ends the eon and `after()` reads what happened. It runs its home economy, designs a FAMILY of warships
// (one per tactic of the cycle: brute, screen, hit & run, long range, replenishable — plus a light lancer for reach and a settler
// that is also the drop ship), expands toward the enemy while nothing is in reach, defends a colony an enemy fleet rests at,
// marches on the nearest enemy colony it can reach with a MIXED fleet that outweighs the guard, and — holding the system — lands
// troops to take the colony (world.js invade). COMPOSITION (his ask, 2026-10-17: "they're all the same ship — vary it, and
// figure out the best tactic against what you saw"): the fleet is built to a MIX; after every battle the head classifies the
// enemy's ships by the tactics cycle and leans its next ships to the COUNTER (fleetplan.js: brute > screen > hit&run > range >
// replen > brute). tools/play/world.mjs runs it headless and logs the orders; app.js runs it live. No DOM, no clock, no Math.random.
import { T, SCALE, compute, lyBetween, fleetRange, shipRange, zoneOfSys, effectiveLy, waterOf, starsNear, farmShare } from './model.js';
import { applyWorldAction, heldByAnother } from './world.js';
import { designFromStacks } from './battle.js';
import { designStats, autoFit, fitModule } from './modules.js';
import { planetOf } from './colony.js';
import { advisors } from './research.js';

const chip = (kind, h, role = null, id) => ({ id, type: kind.startsWith('weapon') || kind === 'hangar' ? 'weapon' : 'trait', kind, h, role });
// the family: `cls` = its place in the tactics cycle; the lancer is the long-reach pool on its own
export const AI_DESIGNS = {
  war:     { id: 'ai-war',     name: 'AI Warship', cls: 'brute',  seed: 1, chips: [chip('weapon_energy', 4, null, 1), chip('weapon_kinetic', 2, 'capital', 2), chip('shield', 1, null, 3), chip('armor', 2, null, 4), chip('fast', 1, null, 5)] },   // the heavy one: armour is bulk, bulk is reach lost
  screen:  { id: 'ai-screen',  name: 'AI Screen',  cls: 'screen', seed: 4, chips: [chip('weapon_energy', 3, 'pd', 1), chip('shield', 2, null, 2), chip('fast', 1, null, 3)] },                                                 // point defence and shields: swats missiles and drones
  raid:    { id: 'ai-raider',  name: 'AI Raider',  cls: 'hitrun', seed: 5, chips: [chip('weapon_energy', 3, null, 1), chip('fast', 3, null, 2)] },                                                                           // small and quick: slips under heavy turrets
  sniper:  { id: 'ai-sniper',  name: 'AI Sniper',  cls: 'range',  seed: 6, chips: [chip('weapon_kinetic', 2, 'sniper', 1), chip('weapon_missile', 1, null, 2), chip('armor', 1, null, 3)] },                                     // reaches out and stays out
  carrier: { id: 'ai-carrier', name: 'AI Carrier', cls: 'replen', seed: 7, chips: [chip('hangar', 1, null, 1), chip('weapon_missile', 1, null, 2), chip('fab', 1, null, 3)] },                                                 // drones and missiles with the fabricator to keep them coming
  long:    { id: 'ai-long',    name: 'AI Lancer',  cls: 'hitrun', seed: 2, chips: [chip('weapon_energy', 3, null, 1), chip('shield', 1, null, 3)] },                                                                            // the light one: half again the reach, a third of the punch
  col:     { id: 'ai-colony',  name: 'AI Settler', cls: null,     seed: 3, chips: [chip('habitat', 2, null, 1)] },                                                                                                               // settlers aboard: founds a colony — or lands them as troops
};
const DOCK = { id: 'ai-dock', name: 'Great dock', klass: 'structure', hull: 'cradle', modules: [{ id: 'ai-g1', kind: 'gantry', w: 8, h: 4, n: 1, caps: [] }, { id: 'ai-r1', kind: 'reactor', k: 0.25, n: 1, caps: [] }] };
const NEED = { war: 1.6, long: 2.5 }, BASE = 400;                                 // the fleet to send, × what guards the target (an empty colony still asks a real fleet)
const HEAL2 = [0, 4, 2, 1, 0.5, 0];                                              // strain healed by two eons' rest, by zone (model.js ZONE)
const D = AI_DESIGNS, COMBAT = ['war', 'screen', 'raid', 'sniper', 'carrier', 'long'];
// THE CYCLE (fleetplan.js TACTICS): what beats what — the counter of a class is the class that beats it
const BEATS = { brute: 'screen', screen: 'hitrun', hitrun: 'range', range: 'replen', replen: 'brute' };
const COUNTER = Object.fromEntries(Object.entries(BEATS).map(([a, b]) => [b, a]));   // counter(screen) = brute, counter(hitrun) = screen, …
const BY_CLASS = { brute: 'war', screen: 'screen', hitrun: 'raid', range: 'sniper', replen: 'carrier' };
const DEFAULT_MIX = { war: 0.5, raid: 0.25, screen: 0.25 };                       // nothing known of the enemy yet: a line, a screen, raiders
// an enemy design's place in the cycle, from what it carries
export function classify(d) {
  const mods = d.modules || [], n = k => mods.filter(m => m.kind === k).reduce((a, m) => a + (m.n || 1), 0), preset = p => mods.filter(m => m.preset === p).reduce((a, m) => a + (m.n || 1), 0);
  const beams = n('weapon_energy'), guns = n('weapon_kinetic'), msl = n('weapon_missile'), drones = n('hangar'), pd = preset('pd'), sniper = preset('sniper'), capital = preset('capital'), armor = n('armor'), fast = n('thruster'), fab = n('works');
  if (drones > 0 || (msl > 0 && fab > 0)) return 'replen';
  if (sniper > 0 || msl > 0) return 'range';
  if (pd > 0) return 'screen';
  if (capital > 0 || armor >= 2) return 'brute';
  if (fast > 0 && beams > 0) return 'hitrun';
  return beams > guns ? 'hitrun' : 'brute';
}

// opts.onAct(a) sees every order given (the log); opts.note(text) every thought worth a line; opts.focus = the FOCUS this empire
// leans to (his ask, 2026-10-17: "change the focus of each empire — one mid, the others biased to expansion, exploration,
// extermination, exploitation — I want to see how breakthroughs shift the balance"): 'mid' stays at the centre (no moves, so the
// steady bonus runs), or a corner name / index — one step of 0.1 every ten eons once cohesion can pay, up to FOCUS_TOP
export const FOCUS_NAMES = ['expand', 'exploit', 'explore', 'exterm'], FOCUS_TOP = 0.55;
export function makeBrain(W, S, opts = {}) {
  const bias = opts.focus == null || opts.focus === 'default' ? 3 : opts.focus === 'mid' ? null : typeof opts.focus === 'number' ? opts.focus : FOCUS_NAMES.indexOf(String(opts.focus).toLowerCase().slice(0, 6).replace(/^expans.*/, 'expand').replace(/^exploi.*/, 'exploit').replace(/^explor.*/, 'explore').replace(/^exter.*/, 'exterm'));
  const note = text => { if (opts.note) opts.note(S, text); };
  const act = a => { const err = applyWorldAction(W, S, a); if (err) { note(`✗ ${a.type} refused: ${err}`); return false; } if (opts.onAct) opts.onAct(S, a); return true; };
  const shipDesign = key => {
    const d = designFromStacks(S, D[key].chips, { klass: 'starship', name: D[key].name, id: D[key].id, hull: (S.look && S.look.hull) || 'dart', gunsPerChip: 1, newest: true });   // the newest components it has developed (2026-10-24)   // the empire's own silhouette (world.js WORLD.hulls)
    d.klass = 'starship'; d.chips = D[key].chips; d.paint = { plating: 0, fittings: 0, seed: D[key].seed };
    const drive = d.modules.find(m => m.kind === 'stardrive'); if (drive) drive.k = 6;                                       // the drive at its top: the reach between stars grows with lift over bulk
    const reactor = d.modules.find(m => m.kind === 'reactor'); if (reactor) fitModule(S, d, reactor.id);
    return d;
  };
  const dockDesign = () => { const d = JSON.parse(JSON.stringify(DOCK)); autoFit(S, d); return d; };
  const sysOfPlace = id => (S.places.find(p => p.id === id) || {}).sys, sysName = id => (S.systems.find(s => s.id === id) || {}).name || id, placeName = id => (S.places.find(p => p.id === id) || {}).name || id;
  const keyOf = u => Object.keys(D).find(k => D[k].id === u.design.id) || null;
  const ofType = (c, key) => c.ships.filter(s => s.u.design.id === D[key].id);
  const worthOf = ships => ships.reduce((a, s) => a + s.t.cost, 0), peopleOf = ships => ships.reduce((a, s) => a + (s.u.people || 0), 0);
  // hops from one star to another with the STRAIN that stacks outside the sphere never past `reach` on arrival: Dijkstra on (hops,
  // strain) — a star is settled once, on its first (fewest-hop, least-strained) visit; null when no chain of stars bridges it.
  // One search from a star covers EVERY star it can reach (reachMap), and the searches of an eon are kept (a 150-star sector asked
  // hundreds of them an eon, one per candidate — the simulation crawled, 2026-10-17); the neighbours come nearest-first (starsNear)
  let maps = new Map();                                                              // `${from}|${reach}` → the settled map, this plan() only
  function reachMap(from, reach) {
    const key = from + '|' + reach.toFixed(4), had = maps.get(key); if (had) return had;
    const open = [{ sys: from, hops: 0, strain: 0, prev: null }], settled = new Map();
    while (open.length) {
      open.sort((a, b) => a.hops - b.hops || a.strain - b.strain); const cur = open.shift();
      if (settled.has(cur.sys)) continue; settled.set(cur.sys, cur);
      for (const nb of starsNear(S, cur.sys)) {
        if (nb.ly > reach) break; if (settled.has(nb.id)) continue;
        const arrive = cur.strain + effectiveLy(S, cur.sys, nb.id); if (arrive > reach) continue;
        const z = zoneOfSys(S, nb.id); open.push({ sys: nb.id, hops: cur.hops + 1, strain: z === 0 ? 0 : Math.max(0, arrive - HEAL2[z]), prev: cur });
      }
    }
    maps.set(key, settled); return settled;
  }
  function hopsWithin(from, to, reach) {
    const end = reachMap(from, reach).get(to); if (!end) return null;
    const out = []; for (let n = end; n.prev; n = n.prev) out.unshift(n.sys); return out;
  }
  const hops = (from, to, reach) => hopsWithin(from, to, reach * 0.95) || hopsWithin(from, to, reach + 1.0);   // a safe path first, failing that one that dares a light year past the reach
  const near = (ids, from) => ids.slice().sort((a, b) => lyBetween(S, from, a) - lyBetween(S, from, b));
  // THE ENEMY, as this empire sees it (S.others, refreshed by the world every eon): fleets resting by system, colonies by system
  const foeFleets = () => { const m = new Map(); for (const o of S.others || []) for (const f of o.fleets) m.set(f.sys, (m.get(f.sys) || 0) + f.worth); return m; };
  const foeColonies = () => { const m = new Map(); for (const o of S.others || []) for (const col of o.colonies) { const e = m.get(col.sys) || { sys: col.sys, names: [], list: [], home: false, of: o.name }; e.names.push(col.name); e.list.push(col); if (col.home) e.home = true; m.set(col.sys, e); } return m; };
  const foeAt = sys => foeFleets().get(sys) || 0;
  // INTEL: what each enemy fielded in the battles fought (a decaying count per class of the cycle), and the mix that counters it
  const intel = {};
  const mixFor = (enemy, pool) => {
    const seen = enemy && intel[enemy], total = seen ? Object.values(seen).reduce((a, v) => a + v, 0) : 0;
    let mix;
    if (!seen || total < 1) mix = { ...DEFAULT_MIX };
    else {
      const top = Object.entries(seen).sort((a, b) => b[1] - a[1]), lead = top[0][0], second = top[1] && top[1][1] > total * 0.25 ? top[1][0] : null;
      mix = { [BY_CLASS[COUNTER[lead]]]: 0.55 }; mix.war = (mix.war || 0) + 0.2; mix.screen = (mix.screen || 0) + ((seen.replen || 0) + (seen.range || 0) > total * 0.3 ? 0.25 : 0.1);   // a screen against missiles and drones
      if (second) mix[BY_CLASS[COUNTER[second]]] = (mix[BY_CLASS[COUNTER[second]]] || 0) + 0.15;
    }
    const out = {}; for (const [k, v] of Object.entries(mix)) if (pool.includes(k)) out[k] = v; if (!Object.keys(out).length) out[pool[0]] = 1;   // only what this pool can build (the lancers' pool is lancers)
    const tot = Object.values(out).reduce((a, v) => a + v, 0); for (const k in out) out[k] /= tot; return out;
  };
  const mixWord = m => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${Math.round(v * 100)} % ${D[k].name.replace('AI ', '')}`).join(', ');

  const HOME = S.homeSys, HOMEPLACE = S.homePlace || 'home';
  const leans = new Map();                             // each colony's development lean: crowded / hungry, held with a margin
  const lastSplits = new Map();   // the effort last ordered, colony by colony
  let rally = HOME, target = null, path = null, kind = 'war', stale = 0, lastSplit = null, lastFocusEon = -99, colony = null, lastProgress = 0, waitingNoted = false, shortHold = 0, lastMove = 0, assault = null, lastMixWord = '';
  const B = { settled: 0, lost: 0, taken: 0, invasions: 0, stuckSince: 0, shipsBefore: 0 };
  for (const k of Object.keys(D)) act({ type: 'design', design: shipDesign(k) }); act({ type: 'design', design: dockDesign() });
  const T0 = Object.fromEntries(Object.keys(D).map(k => [k, designStats(S, S.designs.find(d => d.id === D[k].id)).t])), REACH = Object.fromEntries(Object.keys(D).map(k => [k, shipRange(T0[k])]));
  let modelsSeen = (S.models || []).length;                                          // the components it had when its designs were last drawn
  // the two POOLS: the whole family (a mixed fleet's reach is its ships' bulk-weighted reach) and the LIGHT ones that fly within a
  // light year of the lancer's reach — for targets the heavies cannot get to
  const POOL = { war: COMBAT.slice(), long: COMBAT.filter(k => REACH[k] >= REACH.long - 1) }; if (!POOL.long.length) POOL.long = ['long'];
  const poolIds = { war: new Set(POOL.war.map(k => D[k].id)), long: new Set(POOL.long.map(k => D[k].id)) }, combatIds = new Set(COMBAT.map(k => D[k].id));
  const fleet = c => c.ships.filter(s => combatIds.has(s.u.design.id)), ofPool = (c, k) => c.ships.filter(s => poolIds[k].has(s.u.design.id));
  const resting = (c, sys, k) => ofPool(c, k).filter(s => !s.u.dest && sysOfPlace(s.u.at) === sys);
  const PER_SHIP = (T0.col.housing || 0) * SCALE.shipHousing;                    // people a settler carries — as troops, each worth T.ground.ratio of a colony's militia
  if (!S.places.find(p => p.id === HOMEPLACE)?.colony?.structures.some(u => u.design && u.design.id === DOCK.id) && !S.places.find(p => p.id === HOMEPLACE)?.colony?.queue.some(q => q.designId === DOCK.id)) act({ type: 'build', place: HOMEPLACE, design: DOCK.id });
  note(`home ${placeName(HOMEPLACE)} at ${sysName(HOME)} · focus ${bias == null ? 'mid (never moves)' : 'toward ' + FOCUS_NAMES[bias]} · ${COMBAT.map(k => `${D[k].name.replace('AI ', '')} ${Math.round(T0[k].cost)} / ${REACH[k].toFixed(1)} ly`).join(', ')} · the light far-reaching ones: ${POOL.long.map(k => D[k].name.replace('AI ', '')).join(' ')} · settler reach ${REACH.col.toFixed(1)}, ${Math.round(PER_SHIP * 1000)} k aboard`);
  // the ships of one system as a sendmix order: every design resting there, counted
  const mixOf = ships => { const m = new Map(); for (const s of ships) m.set(s.u.design.id, (m.get(s.u.design.id) || 0) + 1); return [...m.entries()].map(([design, n]) => ({ design, n })); };
  const sendAll = (ships, from, to, toPlace) => act(toPlace ? { type: 'sendmix', from, to, toPlace, mix: mixOf(ships) } : { type: 'sendmix', from, to, mix: mixOf(ships) });

  function plan() {
    if (S.dead) return; maps = new Map();                                             // the eon's path searches start afresh (the sphere moved)
    // A NEW COMPONENT (2026-10-24): its designs take the newest models — the ships it builds from now on; the built ones keep theirs
    if ((S.models || []).length !== modelsSeen) { modelsSeen = (S.models || []).length; for (const k of Object.keys(D)) { act({ type: 'design', design: shipDesign(k) }); T0[k] = designStats(S, S.designs.find(d => d.id === D[k].id)).t; REACH[k] = shipRange(T0[k]); } }
    const c = compute(S), pc = c.colonies.find(x => x.pl.id === HOMEPLACE); if (!pc) return;
    // ECONOMY: industry-heavy, research for the sustain rule and the tech, a third of the people building the surface (the triangle's
    // DEVELOPMENT corner, 2026-10-18); short of the sustain line, more at the works and labs; a world with nothing left to build lends
    // its builders to the labs (industry past half pollutes)
    let split = [0.5, 0.2, 0.3];
    if (pc.short > 0) shortHold = 6; else if (shortHold > 0) shortHold--;              // held a few eons: the split flipped every eon on the sustain line
    if (shortHold > 0) split = [0.6, 0.25, 0.15];
    if (pc.G && pc.cap.units >= planetOf(pc.G).net - 1) split = [0.5, 0.4, 0.1];   // a (nearly) full world — a district torn down for re-making does not count   // industry held at half: past it, industrial pollution builds and its sickness caps the people (384 M on every home, 2026-10-18)
    const sum = split.reduce((a, v) => a + v, 0); split = split.map(v => v / sum);
    // THE FARMERS (2026-10-23, the effort is a tetrahedron): every colony keeps as many at the farms as feed it and a little over (a few
    // more while it is hungry); the rest split as above at home, development-heavy on a young colony
    for (const col of c.colonies) {
      const f = Math.min(0.75, farmShare(col.P.people, col.farmYield, col.water) + (col.water && col.fed < 0.98 ? 0.05 : 0)), base = col.pl.id === HOMEPLACE ? split : [0.3, 0.15, 0.55];
      const want = [...base.map(v => v * (1 - f)), f], was = lastSplits.get(col.pl.id);
      if (!was || want.some((v, i) => Math.abs(v - was[i]) > 0.02)) { act({ type: 'split', place: col.pl.id, split: want }); lastSplits.set(col.pl.id, want); }
    }
    // THE SURFACE (colony.js): every colony's development focus leans toward what it lacks — homes when the people press the housing,
    // farms when the food runs short, works when the industry hands outnumber the works, labs when the researchers do; the centre
    // otherwise (a bit of everything). The fillet keeps a lean from running to a corner the colony cannot use.
    for (const col of c.colonies) {
      const G = col.G; if (!G || col.blockaded) continue;
      // HYSTERESIS: a lean holds until the colony is clearly past it (the farm built one eon was torn down the next — 900 orders a game)
      const was = leans.get(col.pl.id) || {}, crowded = col.P.people > (was.crowded ? 0.75 : 0.85) * col.housing, hungry = col.water && col.surplus < (was.hungry ? 0.1 * col.eat : 0.5); const overI = col.people.industry > col.cap.industry * (was.overI ? 0.95 : 1.05), overR = col.people.research > col.cap.science * (was.overR ? 0.95 : 1.05); leans.set(col.pl.id, { crowded, hungry, overI, overR });
      const raw = [0.25 + (overI ? 0.3 : 0), 0.25 + (hungry ? 0.3 : 0), 0.25 + (crowded ? 0.3 : 0), 0.25 + (overR ? 0.3 : 0)], tw = raw.reduce((a, b) => a + b, 0);   // industry, food, housing, science
      const w = raw.map(v => Math.round(v / tw * 100) / 100), now = G.wf || [0.25, 0.25, 0.25, 0.25];
      if (w.some((v, i) => Math.abs(v - now[i]) > 0.01)) act({ type: 'devfocus', place: col.pl.id, w });
    }
    // RESEARCH (2026-10-23, research.js): never idle — with nothing under way, the advisors' first suggestion takes all of it
    if (!(S.projects || []).length && c.research > 0) { const adv = advisors(S, c)[0]; if (adv) act({ type: 'project', fam: adv.fam, inf: 100 }); }
    // the focus leans to its corner (opts.focus; Extermination by default), one step every ten eons once cohesion can pay for it, up to FOCUS_TOP; 'mid' never moves
    if (bias != null && bias >= 0 && S.cohesion >= 40 && W.eon - lastFocusEon >= 10 && S.focus[bias] < FOCUS_TOP) { const w = S.focus.slice(), step = 0.1; w[bias] += step; for (const i of [0, 1, 2, 3]) if (i !== bias) w[i] = Math.max(0, w[i] - step / 3); const t = w.reduce((a, v) => a + v, 0); act({ type: 'focus', w: w.map(v => v / t) }); lastFocusEon = W.eon; }
    const all = fleet(c), moving = all.some(s => s.u.dest), fleets = foeFleets(), cols = foeColonies();
    const R = { war: ofPool(c, 'war').length ? fleetRange(S, ofPool(c, 'war').map(s => s.u)) : Math.min(...POOL.war.map(k => REACH[k])), long: ofPool(c, 'long').length ? fleetRange(S, ofPool(c, 'long').map(s => s.u)) : Math.min(...POOL.long.map(k => REACH[k])) };
    const baseOf = k => { const at = new Map(); for (const s of ofPool(c, k)) if (!s.u.dest) { const sys = sysOfPlace(s.u.at); at.set(sys, (at.get(sys) || 0) + 1); } return [...at.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || HOME; };
    const start = { war: baseOf('war'), long: baseOf('long') };
    const aim = (sys, why, of) => { let p = hops(start.war, sys, R.war), k = 'war'; if (!p) { p = hops(start.long, sys, R.long); k = 'long'; } if (!p) return false; target = { sys, why, of: of || null, guard: foeAt(sys), home: !!(cols.get(sys) || {}).home }; path = p; kind = k; rally = start[k]; stale = 0; lastMove = W.eon; assault = null; note(`target: ${why} at ${sysName(sys)} (guarded by ${Math.round(foeAt(sys))}, ${lyBetween(S, rally, sys).toFixed(1)} ly from ${sysName(rally)}, ${p.length} hop${p.length === 1 ? '' : 's'}) — the ${k === 'war' ? 'heavies' : 'lancers'}`); return true; };
    // THREATS first: an enemy fleet resting where this empire has colonies (a blockade, or one coming) — the home above all
    const mineSys = new Set(c.colonies.map(x => x.pl.sys));
    const threats = [...fleets.keys()].filter(sys => mineSys.has(sys)).sort((a, b) => (b === HOME) - (a === HOME) || lyBetween(S, rally, a) - lyBetween(S, rally, b));
    if (threats.length && !(target && target.why === 'defend' && threats.includes(target.sys))) { target = null; path = null; aim(threats[0], 'defend', (S.others || []).find(o => o.fleets.some(f => f.sys === threats[0]))?.name); }
    // is the target done with? a defended system cleared, an enemy colony taken (or gone from under them)
    if (target && target.why === 'defend' && !fleets.has(target.sys)) { note(`✓ ${sysName(target.sys)} is clear`); target = null; path = null; lastProgress = W.eon; }
    if (target && target.why !== 'defend' && !cols.has(target.sys)) { const mine = c.colonies.some(x => x.pl.sys === target.sys); if (mine) { B.taken++; note(`✓ ${sysName(target.sys)} is ours`); } else note(`${sysName(target.sys)} has fallen to someone else`); target = null; path = null; assault = null; lastProgress = W.eon; waitingNoted = false; }
    // THE TARGET: the nearest enemy colony the heavies can reach, their home when it is as near; failing that one for the lancers
    const far = [];
    if (!target && cols.size) {
      const order = near([...cols.keys()], rally).sort((a, b) => (lyBetween(S, rally, a) - (cols.get(a).home ? 2 : 0)) - (lyBetween(S, rally, b) - (cols.get(b).home ? 2 : 0)));
      for (const sys of order) { const e = cols.get(sys); if (aim(sys, `${e.of}'s ${e.home ? 'HOME ' : ''}${e.names.join(', ')}`, e.of)) break; far.push(`${e.of}'s ${e.names[0]} ${lyBetween(S, rally, sys).toFixed(1)} ly`); }
    }
    // EXPAND toward the enemy while nothing is within reach: a settler to the nearest free world toward them (water first); a settler
    // dares up to two light years past its reach when nothing nearer bridges the gap (an island home sat idle 600 eons otherwise)
    if (!target && !colony) {
      const settlers = ofType(c, 'col'), Rc = settlers.length ? fleetRange(S, settlers.map(s => s.u)) : REACH.col, from = settlers.find(s => !s.u.dest) ? sysOfPlace(settlers.find(s => !s.u.dest).u.at) : HOME;
      const foeSys = [...cols.keys()];
      const cands = S.places.filter(p => p.landable && !p.colony && p.sys !== HOME && !heldByAnother(W, S, p.id)).map(p => { const toFoe = foeSys.length ? Math.min(...foeSys.map(f => lyBetween(S, p.sys, f))) : 0; return { p, toFoe, score: toFoe + (waterOf(p) ? 0 : 3) + 0.3 * lyBetween(S, from, p.sys) }; }).sort((a, b) => a.score - b.score);
      for (const dare of [0, 2]) { for (const cd of cands) { const p = dare ? hopsWithin(from, cd.p.sys, Rc + dare) : hops(from, cd.p.sys, Rc); if (p) { colony = { place: cd.p.id, sys: cd.p.sys }; note(`expand: settle ${cd.p.name} (${sysName(cd.p.sys)}, ${waterOf(cd.p) ? 'water' : 'no water'}, ${cd.toFoe.toFixed(1)} ly from the nearest enemy colony, ${p.length} hop${p.length === 1 ? '' : 's'}${dare ? ', daring past the settler\'s reach' : ''})`); break; } } if (colony) break; }
      const growing = c.colonies.some(x => x.pl.id !== HOMEPLACE && x.water && x.P.people < x.housing - 0.5);
      if (!colony && !moving) {
        if (growing && W.eon - lastProgress < 150) { if (!waitingNoted) { waitingNoted = true; note(`nothing within reach for now (heavy ${R.war.toFixed(1)} ly, lancers ${R.long.toFixed(1)} ly, settlers ${Rc.toFixed(1)} ly) — waiting for the young colonies to grow`); } }
        else if (!B.stuckSince) { B.stuckSince = W.eon; note(`nothing within reach (heavy ${R.war.toFixed(1)} ly, lancers ${R.long.toFixed(1)} ly, settlers ${Rc.toFixed(1)} ly): ${far.join(', ') || 'no enemy colony in sight'}`); }
      } else B.stuckSince = 0;
    } else B.stuckSince = 0;
    // the settler on its way
    if (colony) {
      if (heldByAnother(W, S, colony.place)) { note(`${placeName(colony.place)} was settled by another empire first`); colony = null; }
      else {
        const settlers = ofType(c, 'col'), rest = settlers.find(s => !s.u.dest);
        if (!settlers.length) { if (!pc.queue.some(x => !x.gone) && pc.gantries.length) act({ type: 'build', place: HOMEPLACE, design: D.col.id }); }
        else if (rest) {
          const sys = sysOfPlace(rest.u.at);
          if (rest.u.at === colony.place) { if (act({ type: 'settle', design: D.col.id, place: colony.place })) { B.settled++; note(`✓ settled ${placeName(colony.place)} — the sphere grows`); } colony = null; }
          else if (sys === colony.sys) act({ type: 'send', design: D.col.id, n: 1, from: sys, to: sys, toPlace: colony.place });
          else { const Rs = fleetRange(S, [rest.u]), p = hops(sys, colony.sys, Rs) || hopsWithin(sys, colony.sys, Rs + 2); if (p) act({ type: 'send', design: D.col.id, n: 1, from: sys, to: p[0] }); else { note(`the settler at ${sysName(sys)} cannot reach ${sysName(colony.sys)} — another world`); colony = null; } }
        }
      }
    }
    // BUILD to a MIX: the campaign pool's ships while the fleet is short of what the target asks — each new ship the design whose
    // share is furthest below the mix (the counter of what the enemy fielded, intel from the battles); up to three in the queue,
    // bought from the reserves as far as they go (a rich empire builds faster), three eons of upkeep kept in hand
    const mine = ofPool(c, kind), need = target ? Math.max(BASE, foeAt(target.sys)) * (NEED[kind] + 0.5 * stale) : 0;
    const q = pc.queue.filter(x => !x.gone);
    let bought = 0; for (const x of q) { if (bought >= 3) break; if (!x.noDock && x.need > 1e-6 && (S.reserves || 0) - x.need >= 3 * c.upkeep.total && act({ type: 'buynow', place: HOMEPLACE, index: pc.queue.indexOf(x) })) bought++; }
    const mix = mixFor(target && target.of, POOL[kind]); if (target) { const w = mixWord(mix); if (w !== lastMixWord) { lastMixWord = w; note(`fleet mix${target.of && intel[target.of] ? ` against ${target.of} (seen: ${Object.entries(intel[target.of]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')})` : ''}: ${w}`); } }
    const nextDesign = (queued) => {                                                 // the design furthest below its share, by worth (what is queued counts)
      const have = {}; for (const s of mine) have[keyOf(s.u)] = (have[keyOf(s.u)] || 0) + s.t.cost; for (const k of queued) have[k] = (have[k] || 0) + T0[k].cost;
      const tot = Object.values(have).reduce((a, v) => a + v, 0) || 1; let best = null, gap = -Infinity;
      for (const [k, share] of Object.entries(mix)) { const g = share - (have[k] || 0) / tot; if (g > gap) { gap = g; best = k; } }
      return best || POOL[kind][0];
    };
    // THE ASSAULT (phase 2, his rule: no taking an alien colony by siege — land troops): the target's system held by this empire's
    // fleet, no enemy fleet there → drop ships (settlers) carrying troops: troops × T.ground.ratio must beat the colony's militia
    // (T.ground.militia of its people); the biggest colony there first, its home above all
    const held = target && target.why !== 'defend' && resting(c, target.sys, kind).length > 0 && foeAt(target.sys) === 0 && cols.has(target.sys);
    if (held) {
      const victims = cols.get(target.sys).list.slice().sort((a, b) => (b.home - a.home) || b.people - a.people), v = victims[0];
      const troopsNeed = v.people * T.ground.militia / T.ground.ratio * 1.15, shipsNeed = Math.max(1, Math.ceil(troopsNeed / Math.max(PER_SHIP, 1e-9)));
      if (!assault || assault.place !== v.place) { assault = { place: v.place, sys: target.sys, need: troopsNeed, ships: shipsNeed }; note(`assault: ${v.name} (${Math.round(v.people)} M, militia ${(v.people * T.ground.militia * 1000).toFixed(0)} k) — ${Math.round(troopsNeed * 1000)} k troops needed, ${shipsNeed} drop ship${shipsNeed === 1 ? '' : 's'}`); }
      const troopers = ofType(c, 'col'), atPlace = troopers.filter(s => !s.u.dest && s.u.at === v.place), atStar = troopers.filter(s => !s.u.dest && s.u.at !== v.place && sysOfPlace(s.u.at) === target.sys), atHome = troopers.filter(s => !s.u.dest && sysOfPlace(s.u.at) === HOME);
      if (peopleOf(atPlace) >= troopsNeed / 1.15) { if (act({ type: 'invade', place: v.place })) B.invasions++; }
      else if (atStar.length) act({ type: 'send', design: D.col.id, n: atStar.length, from: target.sys, to: target.sys, toPlace: v.place });
      else if (peopleOf(atHome) >= troopsNeed && HOME !== target.sys) { const Rs = fleetRange(S, atHome.map(s => s.u)), p = hops(HOME, target.sys, Rs) || hopsWithin(HOME, target.sys, Rs + 2); if (p) { if (act({ type: 'send', design: D.col.id, n: atHome.length, from: HOME, to: p[0] })) note(`${atHome.length} drop ships (${Math.round(peopleOf(atHome) * 1000)} k troops) leave Home for ${sysName(target.sys)} (via ${sysName(p[0])})`); } else note(`the drop ships cannot reach ${sysName(target.sys)}`); }
      else {                                                                      // short of troops: build drop ships, up to three at a time
        const inQ = q.filter(x => x.d && x.d.id === D.col.id).length, have = troopers.length + inQ;
        if (have < shipsNeed && inQ < 3 && pc.gantries.length) act({ type: 'build', place: HOMEPLACE, design: D.col.id });
      }
      // a trooper resting between home and the target (a hop on the way): press on
      for (const s of troopers) if (!s.u.dest && sysOfPlace(s.u.at) !== HOME && sysOfPlace(s.u.at) !== target.sys) { const sys = sysOfPlace(s.u.at), Rs = fleetRange(S, [s.u]), p = hops(sys, target.sys, Rs) || hopsWithin(sys, target.sys, Rs + 2); if (p) act({ type: 'send', design: D.col.id, n: 1, from: sys, to: p[0] }); }
    } else if (pc.gantries.length) {
      const avgCost = Object.entries(mix).reduce((a, [k, v]) => a + v * T0[k].cost, 0) || T0.war.cost;
      const want = target ? Math.ceil((need - worthOf(mine)) / avgCost) : (!colony && worthOf(all) < 2 * BASE ? 1 : 0);   // a home guard while there is nothing to do
      const queued = q.filter(x => x.d && combatIds.has(x.d.id)).map(x => keyOf({ design: x.d })).filter(Boolean); let spare = (S.reserves || 0) - 3 * c.upkeep.total - q.reduce((a, x) => a + (x.need || 0), 0);
      while (queued.length < Math.min(3, want)) { const k = target ? nextDesign(queued) : 'war'; if (queued.length && spare < T0[k].cost) break; if (!act({ type: 'build', place: HOMEPLACE, design: D[k].id })) break; queued.push(k); spare -= T0[k].cost; }
    } else if (target || colony) act({ type: 'build', place: HOMEPLACE, design: DOCK.id });
    // MOVE: gather at the rally (from Home in batches of a few ships; a system's ships leave together as ONE fleet, whatever their
    // designs); the rally fleet, strong enough and rested, takes the next hop — or, after forty eons of waiting, with what outweighs
    // the guard at all
    const groups = new Map(); for (const s of all) if (!s.u.dest) { const sys = sysOfPlace(s.u.at); groups.set(sys, (groups.get(sys) || []).concat([s])); }   // a system's ships move together, whatever their designs
    for (const [sys, ships] of groups) {
      if (sys === rally || (zoneOfSys(S, sys) <= 2 && ships.some(s => (s.u.st ?? 100) < 85))) continue;   // rest to 85 % where restocking is worth the wait (blue to yellow); out there, press on
      if (foeAt(rally) > 0 && worthOf(ships) < need) continue;                   // never trickle ships one by one into a fight
      if (!target && sys === HOME) continue;                                       // the home guard stays
      if (sys === HOME && worthOf(ships) < Math.min(need - worthOf(resting(c, rally, kind)), 4 * T0.war.cost)) continue;
      const p = hops(sys, rally, fleetRange(S, ships.map(s => s.u))); if (!p) continue;
      if (sendAll(ships, sys, p[0])) note(`${ships.length} ship${ships.length > 1 ? 's' : ''} (${mixOf(ships).map(m => `${m.n} ${(Object.values(D).find(d => d.id === m.design) || {}).name || m.design}`).join(', ')}) from ${sysName(sys)} toward the rally at ${sysName(rally)} (via ${sysName(p[0])})`);
    }
    const atRally = resting(c, rally, kind);
    const impatient = target && W.eon - lastMove > 40 && worthOf(atRally) >= 1.1 * Math.max(BASE, foeAt(target.sys));
    if (target && path && atRally.length && (worthOf(atRally) >= need || impatient) && (zoneOfSys(S, rally) > 2 || atRally.every(s => (s.u.st ?? 100) >= 85)) && !moving) {
      const next = path[0];
      if (sendAll(atRally, rally, next)) { note(`${atRally.length} ships (worth ${Math.round(worthOf(atRally))}: ${mixOf(atRally).map(m => `${m.n} ${(Object.values(D).find(d => d.id === m.design) || {}).name.replace('AI ', '')}`).join(', ')}) leave ${sysName(rally)} for ${sysName(next)}${next === target.sys ? ' — the target' : ''}${impatient && worthOf(atRally) < need ? ' — done waiting, with what there is' : ''}`); rally = next; path = path.slice(1); lastMove = W.eon; }
    }
    B.shipsBefore = S.ships.length;
  }
  function after() {
    if (S.dead) return;
    B.lost += Math.max(0, (B.shipsBefore || 0) - S.ships.length);
    // INTEL from the battles fought this eon: what the enemy fielded, by class, decaying so the latest fights weigh most
    for (const bt of S.battles || []) {
      if (!bt.foe || !bt.foe.ships) continue; const enemy = String(bt.foe.name || '').replace(/'s fleet$/, ''); if (!enemy) continue;
      const seen = intel[enemy] || (intel[enemy] = {}); for (const k in seen) seen[k] *= 0.7;
      for (const p of bt.foe.ships) if (p.design) { const cls = classify(p.design); seen[cls] = (seen[cls] || 0) + 1; }
    }
    if (target && S.report.some(r => /^Battle at/.test(r.text) && /neither side gave way/.test(r.text))) stale++;
    for (const r of S.report) if (/^Invasion of/.test(r.text)) note(r.text);
    if (target && rally === target.sys && !S.ships.some(u => poolIds[kind].has(u.design.id) && sysOfPlace(u.dest || u.at) === target.sys)) {   // the attack failed (none there, none on the way): regroup at Home and come back stronger
      stale++; rally = HOME; path = null; note(`✗ the attack on ${sysName(target.sys)} failed — regrouping at Home for a fleet ${(NEED[kind] + 0.5 * stale).toFixed(1)} × its guard`);
      const p = hops(HOME, target.sys, kind === 'war' ? Math.min(...POOL.war.map(k => REACH[k])) : REACH.long); if (p) path = p; else target = null;
    }
    if (target || colony) lastProgress = W.eon;
  }
  return { S, plan, after, B, intel, stuck: () => B.stuckSince };
}
