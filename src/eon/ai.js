// THE AI EMPIRE'S HEAD (his ask, 2026-10-16: "two or three AIs fighting for galaxy domination" — and then "when you take over,
// the AI stops": the head now lives here, pure, so the game runs it for the other empires while a human plays one). One brain
// per empire, on a WORLD (world.js). Every eon `plan()` gives its orders through applyWorldAction — the same orders a player
// gives — then the world ends the eon and `after()` reads what happened. It runs its home economy, designs a heavy warship, a
// light lancer and a settler (the settler is also the DROP SHIP), expands toward the enemy while nothing is in reach, defends a
// colony an enemy fleet rests at, marches on the nearest enemy colony it can reach with a fleet that outweighs the guard, and —
// holding the system — lands troops to take the colony (world.js invade: troops aboard × ratio against the colony's militia).
// tools/play/world.mjs runs it headless and logs the orders; app.js runs it live. No DOM, no clock, no Math.random.
import { T, SCALE, compute, lyBetween, fleetRange, shipRange, zoneOfSys, effectiveLy, waterOf } from './model.js';
import { applyWorldAction, heldByAnother } from './world.js';
import { designFromStacks } from './battle.js';
import { designStats, autoFit, fitModule } from './modules.js';

const chip = (kind, h, role = null, id) => ({ id, type: kind.startsWith('weapon') || kind === 'hangar' ? 'weapon' : 'trait', kind, h, role });
export const AI_DESIGNS = {
  war:  { id: 'ai-war',  name: 'AI Warship', chips: [chip('weapon_energy', 4, null, 1), chip('weapon_kinetic', 2, 'capital', 2), chip('shield', 1, null, 3), chip('armor', 2, null, 4), chip('fast', 1, null, 5)] },   // the heavy one: armour is bulk, bulk is reach lost
  long: { id: 'ai-long', name: 'AI Lancer',  chips: [chip('weapon_energy', 3, null, 1), chip('shield', 1, null, 3)] },                                                                                                  // the light one: half again the reach, a third of the punch
  col:  { id: 'ai-colony', name: 'AI Settler', chips: [chip('habitat', 2, null, 1)] },                                                                                                                                // settlers aboard: founds a colony — or lands them as troops
};
const DOCK = { id: 'ai-dock', name: 'Great dock', klass: 'structure', hull: 'cradle', modules: [{ id: 'ai-g1', kind: 'gantry', w: 8, h: 4, n: 1, caps: [] }, { id: 'ai-r1', kind: 'reactor', k: 0.25, n: 1, caps: [] }] };
const NEED = { war: 1.6, long: 2.5 }, BASE = 400;                                 // the fleet to send, × what guards the target (an empty colony still asks a real fleet)
const HEAL2 = [0, 4, 2, 1, 0.5, 0];                                              // strain healed by two eons' rest, by zone (model.js ZONE)
const D = AI_DESIGNS;

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
    const d = designFromStacks(S, D[key].chips, { klass: 'starship', name: D[key].name, id: D[key].id, hull: (S.look && S.look.hull) || 'dart', gunsPerChip: 1 });   // the empire's own silhouette (world.js WORLD.hulls)
    d.klass = 'starship'; d.chips = D[key].chips; d.paint = { plating: 0, fittings: 0, seed: key === 'war' ? 1 : key === 'long' ? 2 : 3 };
    const drive = d.modules.find(m => m.kind === 'stardrive'); if (drive) drive.k = 6;                                       // the drive at its top: the reach between stars grows with lift over bulk
    const reactor = d.modules.find(m => m.kind === 'reactor'); if (reactor) fitModule(S, d, reactor.id);
    return d;
  };
  const dockDesign = () => { const d = JSON.parse(JSON.stringify(DOCK)); autoFit(S, d); return d; };
  const sysOfPlace = id => (S.places.find(p => p.id === id) || {}).sys, sysName = id => (S.systems.find(s => s.id === id) || {}).name || id, placeName = id => (S.places.find(p => p.id === id) || {}).name || id;
  const ofType = (c, key) => c.ships.filter(s => s.u.design.id === D[key].id), fleet = c => c.ships.filter(s => s.u.design.id === D.war.id || s.u.design.id === D.long.id);
  const resting = (c, sys, key) => ofType(c, key).filter(s => !s.u.dest && sysOfPlace(s.u.at) === sys);
  const worthOf = ships => ships.reduce((a, s) => a + s.t.cost, 0), peopleOf = ships => ships.reduce((a, s) => a + (s.u.people || 0), 0);
  // hops from one star to another with the STRAIN that stacks outside the sphere never past `reach` on arrival: Dijkstra on (hops,
  // strain) — a star is settled once, on its first (fewest-hop, least-strained) visit; null when no chain of stars bridges it
  function hopsWithin(from, to, reach) {
    const open = [{ sys: from, hops: 0, strain: 0, prev: null }], settled = new Map();
    while (open.length) {
      open.sort((a, b) => a.hops - b.hops || a.strain - b.strain); const cur = open.shift();
      if (settled.has(cur.sys)) continue; settled.set(cur.sys, cur); if (cur.sys === to) break;
      for (const t of S.systems) {
        if (settled.has(t.id) || t.id === cur.sys || lyBetween(S, cur.sys, t.id) > reach) continue;
        const arrive = cur.strain + effectiveLy(S, cur.sys, t.id); if (arrive > reach) continue;
        const z = zoneOfSys(S, t.id); open.push({ sys: t.id, hops: cur.hops + 1, strain: z === 0 ? 0 : Math.max(0, arrive - HEAL2[z]), prev: cur });
      }
    }
    const end = settled.get(to); if (!end) return null;
    const out = []; for (let n = end; n.prev; n = n.prev) out.unshift(n.sys); return out;
  }
  const hops = (from, to, reach) => hopsWithin(from, to, reach * 0.95) || hopsWithin(from, to, reach + 1.0);   // a safe path first, failing that one that dares a light year past the reach
  const near = (ids, from) => ids.slice().sort((a, b) => lyBetween(S, from, a) - lyBetween(S, from, b));
  // THE ENEMY, as this empire sees it (S.others, refreshed by the world every eon): fleets resting by system, colonies by system
  const foeFleets = () => { const m = new Map(); for (const o of S.others || []) for (const f of o.fleets) m.set(f.sys, (m.get(f.sys) || 0) + f.worth); return m; };
  const foeColonies = () => { const m = new Map(); for (const o of S.others || []) for (const col of o.colonies) { const e = m.get(col.sys) || { sys: col.sys, names: [], list: [], home: false, of: o.name }; e.names.push(col.name); e.list.push(col); if (col.home) e.home = true; m.set(col.sys, e); } return m; };
  const foeAt = sys => foeFleets().get(sys) || 0;

  const HOME = S.homeSys, HOMEPLACE = S.homePlace || 'home';
  let rally = HOME, target = null, path = null, kind = 'war', stale = 0, lastSplit = null, lastFocusEon = -99, colony = null, lastProgress = 0, waitingNoted = false, feeding = false, shortHold = 0, lastMove = 0, assault = null;
  const B = { settled: 0, lost: 0, taken: 0, invasions: 0, stuckSince: 0, shipsBefore: 0 };
  act({ type: 'design', design: shipDesign('war') }); act({ type: 'design', design: shipDesign('long') }); act({ type: 'design', design: shipDesign('col') }); act({ type: 'design', design: dockDesign() });
  const T0 = Object.fromEntries(['war', 'long', 'col'].map(k => [k, designStats(S, S.designs.find(d => d.id === D[k].id)).t])), REACH = Object.fromEntries(['war', 'long', 'col'].map(k => [k, shipRange(T0[k])]));
  const PER_SHIP = (T0.col.housing || 0) * SCALE.shipHousing;                    // people a settler carries — as troops, each worth T.ground.ratio of a colony's militia
  if (!S.places.find(p => p.id === HOMEPLACE)?.colony?.structures.some(u => u.design && u.design.id === DOCK.id) && !S.places.find(p => p.id === HOMEPLACE)?.colony?.queue.some(q => q.designId === DOCK.id)) act({ type: 'build', place: HOMEPLACE, design: DOCK.id });
  note(`home ${placeName(HOMEPLACE)} at ${sysName(HOME)} · focus ${bias == null ? 'mid (never moves)' : 'toward ' + FOCUS_NAMES[bias]} · warship ${Math.round(T0.war.cost)} reach ${REACH.war.toFixed(1)} ly · lancer reach ${REACH.long.toFixed(1)} · settler reach ${REACH.col.toFixed(1)}, ${Math.round(PER_SHIP * 1000)} k aboard`);

  function plan() {
    if (S.dead) return;
    const c = compute(S), pc = c.colonies.find(x => x.pl.id === HOMEPLACE); if (!pc) return;
    // ECONOMY: industry-heavy, social enough to feed everyone and build room, research for the sustain rule and the tech
    let split = [0.5, 0.2, 0.3];
    if (pc.surplus < 0.5) feeding = true; else if (pc.surplus > 8) feeding = false;   // hysteresis: the split flipped every eon on a 1-food threshold
    if (feeding) split = [0.4, 0.15, 0.45];
    if (pc.short > 0) shortHold = 6; else if (shortHold > 0) shortHold--;              // held a few eons: the split flipped every eon on the sustain line
    if (shortHold > 0) split = [Math.min(0.6, split[0] + 0.1), split[1] + 0.05, Math.max(0.2, split[2] - 0.15)];
    const sum = split.reduce((a, v) => a + v, 0); split = split.map(v => v / sum);
    if (!lastSplit || split.some((v, i) => Math.abs(v - lastSplit[i]) > 0.02)) { act({ type: 'split', place: HOMEPLACE, split }); lastSplit = split; }
    // the focus leans to its corner (opts.focus; Extermination by default), one step every ten eons once cohesion can pay for it, up to FOCUS_TOP; 'mid' never moves
    if (bias != null && bias >= 0 && S.cohesion >= 40 && W.eon - lastFocusEon >= 10 && S.focus[bias] < FOCUS_TOP) { const w = S.focus.slice(), step = 0.1; w[bias] += step; for (const i of [0, 1, 2, 3]) if (i !== bias) w[i] = Math.max(0, w[i] - step / 3); const t = w.reduce((a, v) => a + v, 0); act({ type: 'focus', w: w.map(v => v / t) }); lastFocusEon = W.eon; }
    const all = fleet(c), moving = all.some(s => s.u.dest), fleets = foeFleets(), cols = foeColonies();
    const R = { war: ofType(c, 'war').length ? fleetRange(S, ofType(c, 'war').map(s => s.u)) : REACH.war, long: ofType(c, 'long').length ? fleetRange(S, ofType(c, 'long').map(s => s.u)) : REACH.long };
    const baseOf = k => { const at = new Map(); for (const s of ofType(c, k)) if (!s.u.dest) { const sys = sysOfPlace(s.u.at); at.set(sys, (at.get(sys) || 0) + 1); } return [...at.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || HOME; };
    const start = { war: baseOf('war'), long: baseOf('long') };
    const aim = (sys, why) => { let p = hops(start.war, sys, R.war), k = 'war'; if (!p) { p = hops(start.long, sys, R.long); k = 'long'; } if (!p) return false; target = { sys, why, guard: foeAt(sys), home: !!(cols.get(sys) || {}).home }; path = p; kind = k; rally = start[k]; stale = 0; lastMove = W.eon; assault = null; note(`target: ${why} at ${sysName(sys)} (guarded by ${Math.round(foeAt(sys))}, ${lyBetween(S, rally, sys).toFixed(1)} ly from ${sysName(rally)}, ${p.length} hop${p.length === 1 ? '' : 's'}) — ${D[k].name}s`); return true; };
    // THREATS first: an enemy fleet resting where this empire has colonies (a blockade, or one coming) — the home above all
    const mineSys = new Set(c.colonies.map(x => x.pl.sys));
    const threats = [...fleets.keys()].filter(sys => mineSys.has(sys)).sort((a, b) => (b === HOME) - (a === HOME) || lyBetween(S, rally, a) - lyBetween(S, rally, b));
    if (threats.length && !(target && target.why === 'defend' && threats.includes(target.sys))) { target = null; path = null; aim(threats[0], 'defend'); }
    // is the target done with? a defended system cleared, an enemy colony taken (or gone from under them)
    if (target && target.why === 'defend' && !fleets.has(target.sys)) { note(`✓ ${sysName(target.sys)} is clear`); target = null; path = null; lastProgress = W.eon; }
    if (target && target.why !== 'defend' && !cols.has(target.sys)) { const mine = c.colonies.some(x => x.pl.sys === target.sys); if (mine) { B.taken++; note(`✓ ${sysName(target.sys)} is ours`); } else note(`${sysName(target.sys)} has fallen to someone else`); target = null; path = null; assault = null; lastProgress = W.eon; waitingNoted = false; }
    // THE TARGET: the nearest enemy colony the heavies can reach, their home when it is as near; failing that one for the lancers
    const far = [];
    if (!target && cols.size) {
      const order = near([...cols.keys()], rally).sort((a, b) => (lyBetween(S, rally, a) - (cols.get(a).home ? 2 : 0)) - (lyBetween(S, rally, b) - (cols.get(b).home ? 2 : 0)));
      for (const sys of order) { const e = cols.get(sys); if (aim(sys, `${e.of}'s ${e.home ? 'HOME ' : ''}${e.names.join(', ')}`)) break; far.push(`${e.of}'s ${e.names[0]} ${lyBetween(S, rally, sys).toFixed(1)} ly`); }
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
    // BUILD: ships of the campaign's kind while the fleet is short of what the target asks — up to three in the queue, bought from
    // the reserves as far as they go (a rich empire builds faster), three eons of upkeep kept in hand
    const mine = ofType(c, kind), need = target ? Math.max(BASE, foeAt(target.sys)) * (NEED[kind] + 0.5 * stale) : 0;
    const q = pc.queue.filter(x => !x.gone);
    let bought = 0; for (const x of q) { if (bought >= 3) break; if (!x.noDock && x.need > 1e-6 && (S.reserves || 0) - x.need >= 3 * c.upkeep.total && act({ type: 'buynow', place: HOMEPLACE, index: pc.queue.indexOf(x) })) bought++; }
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
      const want = target ? Math.ceil((need - worthOf(mine)) / T0[kind].cost) : (!colony && worthOf(all) < 2 * BASE ? 1 : 0), dkey = target ? kind : 'war';   // a home guard while there is nothing to do
      let inQ = q.filter(x => x.d && x.d.id === D[dkey].id).length, spare = (S.reserves || 0) - 3 * c.upkeep.total - q.reduce((a, x) => a + (x.need || 0), 0);
      while (inQ < Math.min(3, want) && (inQ === 0 || spare >= T0[dkey].cost)) { if (!act({ type: 'build', place: HOMEPLACE, design: D[dkey].id })) break; inQ++; spare -= T0[dkey].cost; }
    } else if (target || colony) act({ type: 'build', place: HOMEPLACE, design: DOCK.id });
    // MOVE: gather at the rally (from Home in batches of a few ships); the rally fleet, strong enough and rested, takes the next hop
    // — or, after forty eons of waiting, with what outweighs the guard at all
    const groups = new Map(); for (const s of all) if (!s.u.dest) { const sys = sysOfPlace(s.u.at), key = sys + '|' + s.u.design.id; groups.set(key, (groups.get(key) || []).concat([s])); }
    for (const [key, ships] of groups) {
      const sys = key.split('|')[0], dkey = ships[0].u.design.id === D.war.id ? 'war' : 'long';
      if (sys === rally || (zoneOfSys(S, sys) <= 2 && ships.some(s => (s.u.st ?? 100) < 85))) continue;   // rest to 85 % where restocking is worth the wait (blue to yellow); out there, press on
      if (foeAt(rally) > 0 && worthOf(ships) < need) continue;                   // never trickle ships one by one into a fight
      if (!target && sys === HOME) continue;                                       // the home guard stays
      if (sys === HOME && worthOf(ships) < Math.min(need - worthOf(resting(c, rally, kind)), 4 * T0[dkey].cost)) continue;
      const p = hops(sys, rally, fleetRange(S, ships.map(s => s.u))); if (!p) continue;
      if (act({ type: 'send', design: D[dkey].id, n: ships.length, from: sys, to: p[0] })) note(`${ships.length} ${D[dkey].name}${ships.length > 1 ? 's' : ''} from ${sysName(sys)} toward the rally at ${sysName(rally)} (via ${sysName(p[0])})`);
    }
    const atRally = resting(c, rally, kind);
    const impatient = target && W.eon - lastMove > 40 && worthOf(atRally) >= 1.1 * Math.max(BASE, foeAt(target.sys));
    if (target && path && atRally.length && (worthOf(atRally) >= need || impatient) && (zoneOfSys(S, rally) > 2 || atRally.every(s => (s.u.st ?? 100) >= 85)) && !moving) {
      const next = path[0];
      if (act({ type: 'send', design: D[kind].id, n: atRally.length, from: rally, to: next })) { note(`${atRally.length} ${D[kind].name}${atRally.length > 1 ? 's' : ''} (worth ${Math.round(worthOf(atRally))}) leave ${sysName(rally)} for ${sysName(next)}${next === target.sys ? ' — the target' : ''}${impatient && worthOf(atRally) < need ? ' — done waiting, with what there is' : ''}`); rally = next; path = path.slice(1); lastMove = W.eon; }
    }
    B.shipsBefore = S.ships.length;
  }
  function after() {
    if (S.dead) return;
    B.lost += Math.max(0, (B.shipsBefore || 0) - S.ships.length);
    if (target && S.report.some(r => /^Battle at/.test(r.text) && /neither side gave way/.test(r.text))) stale++;
    for (const r of S.report) if (/^Invasion of/.test(r.text)) note(r.text);
    if (target && rally === target.sys && !S.ships.some(u => u.design.id === D[kind].id && sysOfPlace(u.dest || u.at) === target.sys)) {   // the attack failed (none there, none on the way): regroup at Home and come back stronger
      stale++; rally = HOME; path = null; note(`✗ the attack on ${sysName(target.sys)} failed — regrouping at Home for a fleet ${(NEED[kind] + 0.5 * stale).toFixed(1)} × its guard`);
      const p = hops(HOME, target.sys, kind === 'war' ? REACH.war : REACH.long); if (p) path = p; else target = null;
    }
    if (target || colony) lastProgress = W.eon;
  }
  return { S, plan, after, B, stuck: () => B.stuckSince };
}
