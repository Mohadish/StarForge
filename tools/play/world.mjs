// THE WORLD PLAYED BY AIs (his ask, 2026-10-16: "start with two AIs — two empires, maybe even three — the same start; the battle
// is for galaxy domination"). One galaxy, two or three empires (src/eon/world.js), each played by the AI of play.mjs grown a
// head for enemies: it runs its economy, builds warships and settlers, expands toward the other empires while nothing is within
// reach, defends a colony an enemy fleet rests at, and marches on the nearest enemy colony it can reach with a fleet that
// outweighs what guards it — the home worlds above all (a home taken is an empire gone). Every order is an ACTION per empire and
// the whole world is a log the game's Replay bar plays back exactly, with a switch to look through any empire's eyes:
//   node tools/play/world.mjs <seed> [empires=3] [maxEons=600]  →  tools/play/out/world-<seed>.json
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { compute, lyBetween, fleetRange, shipRange, peopleWord, zoneOfSys, effectiveLy, waterOf } from '../../src/eon/model.js';
import { createWorld, worldEndEon, heldByAnother, living } from '../../src/eon/world.js';
import { designFromStacks } from '../../src/eon/battle.js';
import { designStats, autoFit, fitModule } from '../../src/eon/modules.js';
import { applyAction, REPLAY_VERSION } from '../../src/eon/replay.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedText = process.argv[2] || '7', N = Math.max(2, Math.min(4, +(process.argv[3] || 3))), MAX_EONS = +(process.argv[4] || 600);
const W = createWorld(seedText, N);
const log = { version: REPLAY_VERSION, kind: 'world', seedText, n: N, player: 'tools/play/world.mjs', empires: W.empires.map(S => ({ name: S.name, home: S.homeSys, actions: [] })), eons: [], notes: [], events: [] };
const note = (S, text) => { log.notes.push({ eon: W.eon, empire: S.empire, text }); console.log(`  eon ${W.eon} ${S.name.padEnd(6)} ${text}`); };

// ---------------- the designs (play.mjs's) ----------------
const chip = (kind, h, role = null, id) => ({ id, type: kind.startsWith('weapon') || kind === 'hangar' ? 'weapon' : 'trait', kind, h, role });
const D = {
  war:  { id: 'ai-war',  name: 'AI Warship', chips: [chip('weapon_energy', 4, null, 1), chip('weapon_kinetic', 2, 'capital', 2), chip('shield', 1, null, 3), chip('armor', 2, null, 4), chip('fast', 1, null, 5)] },
  long: { id: 'ai-long', name: 'AI Lancer',  chips: [chip('weapon_energy', 3, null, 1), chip('shield', 1, null, 3)] },
  col:  { id: 'ai-colony', name: 'AI Settler', chips: [chip('habitat', 2, null, 1)] },
};
const DOCK = { id: 'ai-dock', name: 'Great dock', klass: 'structure', hull: 'cradle', modules: [{ id: 'ai-g1', kind: 'gantry', w: 8, h: 4, n: 1, caps: [] }, { id: 'ai-r1', kind: 'reactor', k: 0.25, n: 1, caps: [] }] };
const NEED = { war: 1.6, long: 2.5 }, BASE = 400;                                 // the fleet to send, × what guards the target (an empty colony still asks a real fleet)
const HEAL2 = [0, 4, 2, 1, 0.5, 0];

// ---------------- one empire's head ----------------
function makeBrain(S) {
  const me = log.empires[S.empire];
  const act = a => { const err = applyAction(S, a); if (err) { note(S, `✗ ${a.type} refused: ${err}`); return false; } me.actions.push({ eon: W.eon, ...a }); return true; };
  const shipDesign = key => {
    const d = designFromStacks(S, D[key].chips, { klass: 'starship', name: D[key].name, id: D[key].id, hull: 'dart', gunsPerChip: 1 });
    d.klass = 'starship'; d.chips = D[key].chips; d.paint = { plating: 0, fittings: 0, seed: key === 'war' ? 1 : key === 'long' ? 2 : 3 };
    const drive = d.modules.find(m => m.kind === 'stardrive'); if (drive) drive.k = 6;
    const reactor = d.modules.find(m => m.kind === 'reactor'); if (reactor) fitModule(S, d, reactor.id);
    return d;
  };
  const dockDesign = () => { const d = JSON.parse(JSON.stringify(DOCK)); autoFit(S, d); return d; };
  const sysOfPlace = id => (S.places.find(p => p.id === id) || {}).sys, sysName = id => (S.systems.find(s => s.id === id) || {}).name || id, placeName = id => (S.places.find(p => p.id === id) || {}).name || id;
  const ofType = (c, key) => c.ships.filter(s => s.u.design.id === D[key].id), fleet = c => c.ships.filter(s => s.u.design.id === D.war.id || s.u.design.id === D.long.id);
  const resting = (c, sys, key) => ofType(c, key).filter(s => !s.u.dest && sysOfPlace(s.u.at) === sys);
  const worthOf = ships => ships.reduce((a, s) => a + s.t.cost, 0);
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
  const hops = (from, to, reach) => hopsWithin(from, to, reach * 0.95) || hopsWithin(from, to, reach + 1.0);
  const near = (ids, from) => ids.slice().sort((a, b) => lyBetween(S, from, a) - lyBetween(S, from, b));
  // THE ENEMY, as this empire sees it (S.others, refreshed by the world every eon): fleets resting by system, colonies by system
  const foeFleets = () => { const m = new Map(); for (const o of S.others || []) for (const f of o.fleets) m.set(f.sys, (m.get(f.sys) || 0) + f.worth); return m; };
  const foeColonies = () => { const m = new Map(); for (const o of S.others || []) for (const col of o.colonies) { const e = m.get(col.sys) || { sys: col.sys, names: [], home: false, of: o.name }; e.names.push(col.name); if (col.home) e.home = true; m.set(col.sys, e); } return m; };
  const foeAt = sys => foeFleets().get(sys) || 0;

  const HOME = S.homeSys, HOMEPLACE = S.homePlace;
  let rally = HOME, target = null, path = null, kind = 'war', stale = 0, lastSplit = null, lastFocusEon = -99, colony = null, lastProgress = 0, waitingNoted = false, feeding = false, shortHold = 0, lastMove = 0;
  const B = { settled: 0, lost: 0, taken: 0, won: 0, stuckSince: 0 };
  act({ type: 'design', design: shipDesign('war') }); act({ type: 'design', design: shipDesign('long') }); act({ type: 'design', design: shipDesign('col') }); act({ type: 'design', design: dockDesign() });
  const T0 = Object.fromEntries(['war', 'long', 'col'].map(k => [k, designStats(S, S.designs.find(d => d.id === D[k].id)).t])), REACH = Object.fromEntries(['war', 'long', 'col'].map(k => [k, shipRange(T0[k])]));
  act({ type: 'build', place: HOMEPLACE, design: DOCK.id });
  note(S, `home ${placeName(HOMEPLACE)} at ${sysName(HOME)} · warship ${Math.round(T0.war.cost)} reach ${REACH.war.toFixed(1)} ly · lancer reach ${REACH.long.toFixed(1)} · settler reach ${REACH.col.toFixed(1)}`);

  function plan() {
    const c = compute(S), pc = c.colonies.find(x => x.pl.id === HOMEPLACE); if (!pc) return;
    // ECONOMY (play.mjs's): industry-heavy, social enough to feed everyone, research for the sustain rule and the tech
    let split = [0.5, 0.2, 0.3];
    if (pc.surplus < 0.5) feeding = true; else if (pc.surplus > 8) feeding = false;
    if (feeding) split = [0.4, 0.15, 0.45];
    if (pc.short > 0) shortHold = 6; else if (shortHold > 0) shortHold--;                 // held a few eons: the split flipped every eon on the sustain line (300 orders a game)
    if (shortHold > 0) split = [Math.min(0.6, split[0] + 0.1), split[1] + 0.05, Math.max(0.2, split[2] - 0.15)];
    const sum = split.reduce((a, v) => a + v, 0); split = split.map(v => v / sum);
    if (!lastSplit || split.some((v, i) => Math.abs(v - lastSplit[i]) > 0.02)) { act({ type: 'split', place: HOMEPLACE, split }); lastSplit = split; }
    if (S.cohesion >= 40 && W.eon - lastFocusEon >= 10 && S.focus[3] < 0.55) { const w = S.focus.slice(), step = 0.1; w[3] += step; for (const i of [0, 1, 2]) w[i] = Math.max(0, w[i] - step / 3); const t = w.reduce((a, v) => a + v, 0); act({ type: 'focus', w: w.map(v => v / t) }); lastFocusEon = W.eon; }
    const all = fleet(c), moving = all.some(s => s.u.dest), fleets = foeFleets(), cols = foeColonies();
    const R = { war: ofType(c, 'war').length ? fleetRange(S, ofType(c, 'war').map(s => s.u)) : REACH.war, long: ofType(c, 'long').length ? fleetRange(S, ofType(c, 'long').map(s => s.u)) : REACH.long };
    const baseOf = k => { const at = new Map(); for (const s of ofType(c, k)) if (!s.u.dest) { const sys = sysOfPlace(s.u.at); at.set(sys, (at.get(sys) || 0) + 1); } return [...at.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || HOME; };
    const start = { war: baseOf('war'), long: baseOf('long') };
    const aim = (sys, why, prefer) => { let p = hops(start.war, sys, R.war), k = 'war'; if (!p) { p = hops(start.long, sys, R.long); k = 'long'; } if (!p) return false; target = { sys, why, guard: foeAt(sys), home: !!(cols.get(sys) || {}).home }; path = p; kind = k; rally = start[k]; stale = 0; lastMove = W.eon; note(S, `target: ${why} at ${sysName(sys)} (guarded by ${Math.round(foeAt(sys))}, ${lyBetween(S, rally, sys).toFixed(1)} ly from ${sysName(rally)}, ${p.length} hop${p.length === 1 ? '' : 's'}) — ${D[k].name}s`); return true; };
    // THREATS first: an enemy fleet resting where this empire has colonies (a siege, or one coming) — the home above all
    const mineSys = new Set(c.colonies.map(x => x.pl.sys));
    const threats = [...fleets.keys()].filter(sys => mineSys.has(sys)).sort((a, b) => (b === HOME) - (a === HOME) || lyBetween(S, rally, a) - lyBetween(S, rally, b));
    if (threats.length && !(target && target.why === 'defend' && threats.includes(target.sys))) { target = null; path = null; aim(threats[0], 'defend', true); }
    // is the target done with? a defended system cleared, an enemy colony taken (or gone from under them)
    if (target && target.why === 'defend' && !fleets.has(target.sys)) { note(S, `✓ ${sysName(target.sys)} is clear`); target = null; path = null; lastProgress = W.eon; }
    if (target && target.why !== 'defend' && !cols.has(target.sys)) { const mine = c.colonies.some(x => x.pl.sys === target.sys); if (mine) { B.taken++; note(S, `✓ ${sysName(target.sys)} is ours`); } else note(S, `${sysName(target.sys)} has fallen to someone else`); target = null; path = null; lastProgress = W.eon; waitingNoted = false; }
    // THE TARGET: the nearest enemy colony the heavies can reach, their home when it is as near; failing that one for the lancers
    const far = [];
    if (!target && cols.size) {
      const order = near([...cols.keys()], rally).sort((a, b) => (lyBetween(S, rally, a) - (cols.get(a).home ? 2 : 0)) - (lyBetween(S, rally, b) - (cols.get(b).home ? 2 : 0)));
      for (const sys of order) { const e = cols.get(sys); if (aim(sys, `${e.of}'s ${e.home ? 'HOME ' : ''}${e.names.join(', ')}`)) break; far.push(`${e.of}'s ${e.names[0]} ${lyBetween(S, rally, sys).toFixed(1)} ly`); }
    }
    // EXPAND toward the enemy while nothing is within reach: a settler to the nearest free world toward them (water first)
    if (!target && !colony) {
      const settlers = ofType(c, 'col'), Rc = settlers.length ? fleetRange(S, settlers.map(s => s.u)) : REACH.col, from = settlers.find(s => !s.u.dest) ? sysOfPlace(settlers.find(s => !s.u.dest).u.at) : HOME;
      const foeSys = [...cols.keys()];
      const cands = S.places.filter(p => p.landable && !p.colony && p.sys !== HOME && !heldByAnother(W, S, p.id)).map(p => { const toFoe = foeSys.length ? Math.min(...foeSys.map(f => lyBetween(S, p.sys, f))) : 0; return { p, toFoe, score: toFoe + (waterOf(p) ? 0 : 3) + 0.3 * lyBetween(S, from, p.sys) }; }).sort((a, b) => a.score - b.score);
      // a settler dares a hop up to two light years past its reach when nothing nearer bridges the gap (seed 42's Rival sat at an
      // island star for 600 eons: nothing within a light year of its reach) — a cheap ship, and the AI builds another if it breaks down
      for (const dare of [0, 2]) { for (const cd of cands) { const p = dare ? hopsWithin(from, cd.p.sys, Rc + dare) : hops(from, cd.p.sys, Rc); if (p) { colony = { place: cd.p.id, sys: cd.p.sys }; note(S, `expand: settle ${cd.p.name} (${sysName(cd.p.sys)}, ${waterOf(cd.p) ? 'water' : 'no water'}, ${cd.toFoe.toFixed(1)} ly from the nearest enemy colony, ${p.length} hop${p.length === 1 ? '' : 's'}${dare ? ', daring past the settler\'s reach' : ''})`); break; } } if (colony) break; }
      const growing = c.colonies.some(x => x.pl.id !== HOMEPLACE && x.water && x.P.people < x.housing - 0.5);
      if (!colony && !moving) {
        if (growing && W.eon - lastProgress < 150) { if (!waitingNoted) { waitingNoted = true; note(S, `nothing within reach for now (heavy ${R.war.toFixed(1)} ly, lancers ${R.long.toFixed(1)} ly, settlers ${Rc.toFixed(1)} ly) — waiting for the young colonies to grow`); } }
        else if (!B.stuckSince) { B.stuckSince = W.eon; note(S, `nothing within reach (heavy ${R.war.toFixed(1)} ly, lancers ${R.long.toFixed(1)} ly, settlers ${Rc.toFixed(1)} ly): ${far.join(', ') || 'no enemy colony in sight'}`); }
      } else B.stuckSince = 0;
    } else B.stuckSince = 0;
    // the settler on its way
    if (colony) {
      if (heldByAnother(W, S, colony.place)) { note(S, `${placeName(colony.place)} was settled by another empire first`); colony = null; }
      else {
        const settlers = ofType(c, 'col'), rest = settlers.find(s => !s.u.dest);
        if (!settlers.length) { if (!pc.queue.some(x => !x.gone) && pc.gantries.length) act({ type: 'build', place: HOMEPLACE, design: D.col.id }); }
        else if (rest) {
          const sys = sysOfPlace(rest.u.at);
          if (rest.u.at === colony.place) { if (act({ type: 'settle', design: D.col.id, place: colony.place })) { B.settled++; note(S, `✓ settled ${placeName(colony.place)} — the sphere grows`); } colony = null; }
          else if (sys === colony.sys) act({ type: 'send', design: D.col.id, n: 1, from: sys, to: sys, toPlace: colony.place });
          else { const Rs = fleetRange(S, [rest.u]), p = hops(sys, colony.sys, Rs) || hopsWithin(sys, colony.sys, Rs + 2); if (p) act({ type: 'send', design: D.col.id, n: 1, from: sys, to: p[0] }); else { note(S, `the settler at ${sysName(sys)} cannot reach ${sysName(colony.sys)} — another world`); colony = null; } }
        }
      }
    }
    // BUILD: ships of the campaign's kind while the fleet is short of what the target asks — up to three in the queue, bought
    // from the reserves as far as they go (a rich empire builds faster: the seed-7 world locked in an arms race at one ship an
    // eon each), three eons of upkeep kept in hand
    const mine = ofType(c, kind), need = target ? Math.max(BASE, foeAt(target.sys)) * (NEED[kind] + 0.5 * stale) : 0;
    const q = pc.queue.filter(x => !x.gone);
    let bought = 0; for (const x of q) { if (bought >= 3) break; if (!x.noDock && x.need > 1e-6 && (S.reserves || 0) - x.need >= 3 * c.upkeep.total && act({ type: 'buynow', place: HOMEPLACE, index: pc.queue.indexOf(x) })) bought++; }
    if (pc.gantries.length) {
      const want = target ? Math.ceil((need - worthOf(mine)) / T0[kind].cost) : (!colony && worthOf(all) < 2 * BASE ? 1 : 0), dkey = target ? kind : 'war';   // a home guard while there is nothing to do
      let inQ = q.filter(x => x.d && x.d.id === D[dkey].id).length, spare = (S.reserves || 0) - 3 * c.upkeep.total - q.reduce((a, x) => a + (x.need || 0), 0);
      while (inQ < Math.min(3, want) && (inQ === 0 || spare >= T0[dkey].cost)) { if (!act({ type: 'build', place: HOMEPLACE, design: D[dkey].id })) break; inQ++; spare -= T0[dkey].cost; }
    } else if (target || colony) act({ type: 'build', place: HOMEPLACE, design: DOCK.id });
    // MOVE: gather at the rally (from Home in batches of a few ships — one at a time they trickled across nine hops); the rally
    // fleet, strong enough and rested, takes the next hop — or, after forty eons of waiting, with what outweighs the guard at all
    const groups = new Map(); for (const s of all) if (!s.u.dest) { const sys = sysOfPlace(s.u.at), key = sys + '|' + s.u.design.id; groups.set(key, (groups.get(key) || []).concat([s])); }
    for (const [key, ships] of groups) {
      const sys = key.split('|')[0], dkey = ships[0].u.design.id === D.war.id ? 'war' : 'long';
      if (sys === rally || (zoneOfSys(S, sys) <= 2 && ships.some(s => (s.u.st ?? 100) < 85))) continue;
      if (foeAt(rally) > 0 && worthOf(ships) < need) continue;
      if (!target && sys === HOME) continue;                                       // the home guard stays
      if (sys === HOME && worthOf(ships) < Math.min(need - worthOf(resting(c, rally, kind)), 4 * T0[dkey].cost)) continue;
      const p = hops(sys, rally, fleetRange(S, ships.map(s => s.u))); if (!p) continue;
      if (act({ type: 'send', design: D[dkey].id, n: ships.length, from: sys, to: p[0] })) note(S, `${ships.length} ${D[dkey].name}${ships.length > 1 ? 's' : ''} from ${sysName(sys)} toward the rally at ${sysName(rally)} (via ${sysName(p[0])})`);
    }
    const atRally = resting(c, rally, kind);
    const impatient = target && W.eon - lastMove > 40 && worthOf(atRally) >= 1.1 * Math.max(BASE, foeAt(target.sys));
    if (target && path && atRally.length && (worthOf(atRally) >= need || impatient) && (zoneOfSys(S, rally) > 2 || atRally.every(s => (s.u.st ?? 100) >= 85)) && !moving) {
      const next = path[0];
      if (act({ type: 'send', design: D[kind].id, n: atRally.length, from: rally, to: next })) { note(S, `${atRally.length} ${D[kind].name}${atRally.length > 1 ? 's' : ''} (worth ${Math.round(worthOf(atRally))}) leave ${sysName(rally)} for ${sysName(next)}${next === target.sys ? ' — the target' : ''}${impatient && worthOf(atRally) < need ? ' — done waiting, with what there is' : ''}`); rally = next; path = path.slice(1); lastMove = W.eon; }
    }
    B.shipsBefore = S.ships.length;
  }
  function after() {
    if (S.dead) return;
    B.lost += Math.max(0, (B.shipsBefore || 0) - S.ships.length);
    for (const r of S.report) if (/^Battle at/.test(r.text)) { if (new RegExp(`^Battle at [^:]+: ${S.name}'s .* ${S.name} won|— ${S.name} won`).test(r.text)) B.won++; }
    if (target && S.report.some(r => /^Battle at/.test(r.text) && /neither side gave way/.test(r.text))) stale++;
    if (target && rally === target.sys && !S.ships.some(u => u.design.id === D[kind].id && sysOfPlace(u.dest || u.at) === target.sys)) {   // the attack failed (none there, none on the way): regroup at Home and come back stronger
      stale++; rally = HOME; path = null; note(S, `✗ the attack on ${sysName(target.sys)} failed — regrouping at Home for a fleet ${(NEED[kind] + 0.5 * stale).toFixed(1)} × its guard`);
      const p = hops(HOME, target.sys, kind === 'war' ? REACH.war : REACH.long); if (p) path = p; else target = null;
    }
    if (target || colony) lastProgress = W.eon;
  }
  return { plan, after, B, stuck: () => B.stuckSince };
}

// ---------------- the world ----------------
const brains = W.empires.map(S => makeBrain(S));
console.log(`seed "${seedText}": ${N} empires on ${W.empires[0].systems.length} stars — ${W.empires.map(S => `${S.name} at ${S.systems.find(s => s.id === S.homeSys).name}`).join(', ')}`);
for (let eon = 0; eon < MAX_EONS; eon++) {
  for (const S of living(W)) brains[S.empire].plan();
  const { rep } = worldEndEon(W);
  for (const r of rep) { console.log(`  eon ${W.eon - 1} ⚔ ${r.text}`); log.events.push({ eon: W.eon - 1, kind: r.kind, text: r.text }); }
  for (const S of living(W)) brains[S.empire].after();
  log.eons.push({ eon: W.eon, empires: W.empires.map(S => S.dead ? null : ({ people: Math.round(S.places.find(p => p.id === S.homePlace).colony.people * 10) / 10, reserves: Math.round(S.reserves || 0), cohesion: Math.round(S.cohesion), ships: S.ships.length, colonies: S.places.filter(p => p.colony).length })) });
  if (W.winner != null) { console.log(`  eon ${W.eon - 1}: ${W.empires[W.winner].name} holds the galaxy`); break; }
  const live = living(W); if (live.every(S => brains[S.empire].stuck() && W.eon - brains[S.empire].stuck() > 200)) { console.log(`  eon ${W.eon}: every empire has been out of reach of the others for 200 eons — a stalemate`); break; }
  if (eon === MAX_EONS - 1) console.log('  out of eons');
}
const summary = `seed "${seedText}", ${N} empires: ${W.eon - 1} eons · ` + W.empires.map((S, i) => { const b = brains[i].B; return `${S.name}: ${S.dead ? 'FALLEN' : `${S.places.filter(p => p.colony).length} colonies, home ${peopleWord(S.places.find(p => p.id === S.homePlace).colony.people)}`} · ${b.settled} settled, ${b.taken} taken, ${b.lost} ships lost`; }).join(' | ') + (W.winner != null ? ` · ${W.empires[W.winner].name} holds the galaxy` : ' · no winner') + ` · ${log.events.length} events`;
log.summary = summary; console.log(summary);
fs.mkdirSync(join(here, 'out'), { recursive: true });
fs.writeFileSync(join(here, 'out', `world-${seedText}.json`), JSON.stringify(log));
console.log(`written tools/play/out/world-${seedText}.json`);
