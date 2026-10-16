// THE AI PLAYER (his ask, 2026-10-16: "run a few game simulations — try beating all the armies scattered around; keep a log so I
// can replay what you did"). It plays a game from a seed with the game's own model, eon by eon: runs the home economy, designs
// two warships (a heavy one, and a light LANCER whose reach between stars is half again as far) and a bigger dock, builds a fleet,
// hops it star to star within its reach — daring a light year past it when nothing else bridges the gap — rests it between
// hops, and sends it at the nearest hostile fleet it can beat. Every order is an ACTION (src/eon/replay.js) and the whole game is
// written out as a log the game's Replay bar can play back exactly:  node tools/play/play.mjs <seed> [maxEons]  →  tools/play/out/<seed>.json
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { newState, compute, endEon, hostileWorth, lyBetween, fleetRange, shipRange, peopleWord } from '../../src/eon/model.js';
import { designFromStacks } from '../../src/eon/battle.js';
import { designStats, autoFit, fitModule } from '../../src/eon/modules.js';
import { applyAction, REPLAY_VERSION } from '../../src/eon/replay.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedText = process.argv[2] || '7', MAX_EONS = +(process.argv[3] || 600);
const seedOf = text => { const s = String(text).trim(); if (/^\d{1,9}$/.test(s)) return Number(s); let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const S = newState(seedOf(seedText)); S.seedText = seedText;
const log = { version: REPLAY_VERSION, seedText, player: 'tools/play/play.mjs', actions: [], eons: [], notes: [] };
const note = text => { log.notes.push({ eon: S.eon, text }); console.log(`  eon ${S.eon}: ${text}`); };
const act = a => { const err = applyAction(S, a); if (err) { note(`✗ ${a.type} refused: ${err}`); return false; } log.actions.push({ eon: S.eon, ...a }); return true; };

// ---------------- the designs ----------------
const chip = (kind, h, role = null, id) => ({ id, type: kind.startsWith('weapon') || kind === 'hangar' ? 'weapon' : 'trait', kind, h, role });
const D = {
  war:  { id: 'ai-war',  name: 'AI Warship', chips: [chip('weapon_energy', 4, null, 1), chip('weapon_kinetic', 2, 'capital', 2), chip('shield', 1, null, 3), chip('armor', 2, null, 4), chip('fast', 1, null, 5)] },   // the heavy one: armour is bulk, bulk is reach lost
  long: { id: 'ai-long', name: 'AI Lancer',  chips: [chip('weapon_energy', 3, null, 1), chip('shield', 1, null, 3)] },                                                                                                  // the light one: half again the reach, a third of the punch
};
function shipDesign(key) {
  const d = designFromStacks(S, D[key].chips, { klass: 'starship', name: D[key].name, id: D[key].id, hull: 'dart', gunsPerChip: 1 });
  d.klass = 'starship'; d.chips = D[key].chips; d.paint = { plating: 0, fittings: 0, seed: key === 'war' ? 1 : 2 };
  const drive = d.modules.find(m => m.kind === 'stardrive'); if (drive) drive.k = 6;                                       // the drive at its top: the reach between stars grows with lift over bulk
  const reactor = d.modules.find(m => m.kind === 'reactor'); if (reactor) fitModule(S, d, reactor.id);
  return d;
}
const DOCK = { id: 'ai-dock', name: 'Great dock', klass: 'structure', hull: 'cradle', modules: [{ id: 'ai-g1', kind: 'gantry', w: 8, h: 4, n: 1, caps: [] }, { id: 'ai-r1', kind: 'reactor', k: 0.25, n: 1, caps: [] }] };
function dockDesign() { const d = JSON.parse(JSON.stringify(DOCK)); autoFit(S, d); return d; }

// ---------------- helpers ----------------
const sysOfPlace = id => (S.places.find(p => p.id === id) || {}).sys, sysName = id => (S.systems.find(s => s.id === id) || {}).name || id;
const ofType = (c, key) => c.ships.filter(s => s.u.design.id === D[key].id), fleet = c => c.ships.filter(s => s.u.design.id === D.war.id || s.u.design.id === D.long.id);
const resting = (c, sys, key) => ofType(c, key).filter(s => !s.u.dest && sysOfPlace(s.u.at) === sys);
const worthOf = ships => ships.reduce((a, s) => a + s.t.cost, 0);
// hops from one star to another, each within `reach` light years — the fewest hops; null when the reach cannot bridge a gap
function hopsWithin(from, to, reach) {
  const prev = new Map([[from, null]]), queue = [from];
  while (queue.length) { const s = queue.shift(); if (s === to) break; for (const t of S.systems) if (!prev.has(t.id) && lyBetween(S, s, t.id) <= reach) { prev.set(t.id, s); queue.push(t.id); } }
  if (!prev.has(to)) return null;
  const out = []; for (let s = to; s !== from; s = prev.get(s)) out.unshift(s); return out;
}
// a safe path first (every hop within the reach); failing that one that dares a light year past it (a 90 % crossing — the fleet
// arrives worn and rests before the next hop)
const hops = (from, to, reach) => hopsWithin(from, to, reach * 0.95) || hopsWithin(from, to, reach + 1.0);
const near = (ids, from) => ids.slice().sort((a, b) => lyBetween(S, from, a) - lyBetween(S, from, b));

// ---------------- the game ----------------
const home = S.places.find(p => p.id === 'home'), HOME = home.sys;
let rally = HOME, target = null, path = null, kind = 'war', stale = 0, lastSplit = null, lastFocusEon = -99, beaten = 0, lost = 0;
console.log(`seed "${seedText}": ${S.hostiles.length} hostile fleets, worth ${S.hostiles.map(h => hostileWorth(h)).sort((a, b) => a - b).join(' ')}`);
act({ type: 'design', design: shipDesign('war') }); act({ type: 'design', design: shipDesign('long') }); act({ type: 'design', design: dockDesign() });
const T0 = { war: designStats(S, S.designs.find(d => d.id === D.war.id)).t, long: designStats(S, S.designs.find(d => d.id === D.long.id)).t }, REACH = { war: shipRange(T0.war), long: shipRange(T0.long) };
for (const k of ['war', 'long']) note(`${D[k].name}: cost ${Math.round(T0[k].cost)}, ${T0[k].squares} squares, ${Math.round(T0[k].dps)} dmg/s, reach ${REACH[k].toFixed(1)} ly`);
act({ type: 'build', place: 'home', design: DOCK.id });

for (let eon = 0; eon < MAX_EONS; eon++) {
  const c = compute(S), pc = c.colonies.find(x => x.pl.id === 'home'); if (!pc) { note('home is gone'); break; }
  // ECONOMY: industry-heavy, social enough to feed everyone and build room, research for the sustain rule and the tech
  let split = [0.5, 0.2, 0.3];
  if (pc.surplus < 1) split = [0.4, 0.15, 0.45];
  if (pc.short > 0) split = [Math.min(0.6, split[0] + 0.1), split[1] + 0.05, Math.max(0.2, split[2] - 0.15)];
  const sum = split.reduce((a, v) => a + v, 0); split = split.map(v => v / sum);
  if (!lastSplit || split.some((v, i) => Math.abs(v - lastSplit[i]) > 0.02)) { act({ type: 'split', place: 'home', split }); lastSplit = split; }
  // the focus leans to Extermination, one step every ten eons once cohesion can pay for it, up to 55 %
  if (S.cohesion >= 40 && S.eon - lastFocusEon >= 10 && S.focus[3] < 0.55) { const w = S.focus.slice(), step = 0.1; w[3] += step; for (const i of [0, 1, 2]) w[i] = Math.max(0, w[i] - step / 3); const t = w.reduce((a, v) => a + v, 0); act({ type: 'focus', w: w.map(v => v / t) }); lastFocusEon = S.eon; }
  // THE TARGET: the nearest hostile from the rally the heavy fleet can reach; failing that, one the lancers can
  if (!target || !S.hostiles.includes(target)) { target = null; path = null; }
  const all = fleet(c), moving = all.some(s => s.u.dest);
  if (!target && S.hostiles.length) {
    // each kind sets out from where most of it rests (Home when none is built yet): the heavies cannot always follow the lancers
    const R = { war: ofType(c, 'war').length ? fleetRange(S, ofType(c, 'war').map(s => s.u)) : REACH.war, long: ofType(c, 'long').length ? fleetRange(S, ofType(c, 'long').map(s => s.u)) : REACH.long };
    const baseOf = k => { const at = new Map(); for (const s of ofType(c, k)) if (!s.u.dest) { const sys = sysOfPlace(s.u.at); at.set(sys, (at.get(sys) || 0) + 1); } return [...at.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || HOME; };
    const far = [], start = { war: baseOf('war'), long: baseOf('long') };
    for (const h of near(S.hostiles.map(h => h.sys), rally).map(sid => S.hostiles.find(h => h.sys === sid))) {
      let p = hops(start.war, h.sys, R.war), k = 'war'; if (!p) { p = hops(start.long, h.sys, R.long); k = 'long'; }
      if (p) { target = h; path = p; kind = k; rally = start[k]; stale = 0; note(`target: ${h.plan.name} at ${sysName(h.sys)} (worth ${hostileWorth(h)}, ${lyBetween(S, rally, h.sys).toFixed(1)} ly from ${sysName(rally)}, ${p.length} hop${p.length === 1 ? '' : 's'}) — ${D[k].name}s`); break; }
      far.push(`${h.plan.name} ${lyBetween(S, rally, h.sys).toFixed(1)} ly`);
    }
    if (!target && !moving) { note(`nothing left within reach (heavy ${R.war.toFixed(1)} ly, lancers ${R.long.toFixed(1)} ly, a light year past it dared): ${far.join(', ')} — the game ends here`); break; }
  }
  // the fleet to send: 1.6 × the enemy's worth — and half as much again for every eon a fight there has dragged on undecided
  const mine = ofType(c, kind), need = target ? hostileWorth(target) * (1.6 + 0.5 * stale) : 0;
  // BUILD: keep a ship of the campaign's kind in the queue while the fleet is short of the target; otherwise leave the queue
  // empty (factories grow). Buy now from the reserves, keeping three eons of upkeep in hand.
  const q = pc.queue.filter(x => !x.gone);
  if (q.length) { const i = q.findIndex(x => !x.noDock && x.need > 1e-6 && (S.reserves || 0) - x.need >= 3 * c.upkeep.total); if (i >= 0) act({ type: 'buynow', place: 'home', index: pc.queue.indexOf(q[i]) }); }
  else if (target && worthOf(mine) < need && pc.gantries.length) act({ type: 'build', place: 'home', design: D[kind].id });
  else if (target && !pc.gantries.length) act({ type: 'build', place: 'home', design: DOCK.id });
  // MOVE: ships resting away from the rally gather at it (as far as their own reach allows); the rally fleet of the campaign's
  // kind, strong enough and rested, takes the next hop toward the target
  const groups = new Map(); for (const s of all) if (!s.u.dest) { const sys = sysOfPlace(s.u.at), key = sys + '|' + s.u.design.id; groups.set(key, (groups.get(key) || []).concat([s])); }
  for (const [key, ships] of groups) {
    const sys = key.split('|')[0], dkey = ships[0].u.design.id === D.war.id ? 'war' : 'long';
    if (sys === rally || ships.some(s => (s.u.st ?? 100) < 85)) continue;
    const p = hops(sys, rally, fleetRange(S, ships.map(s => s.u))); if (!p) continue;
    if (act({ type: 'send', design: D[dkey].id, n: ships.length, from: sys, to: p[0] })) note(`${ships.length} ${D[dkey].name}${ships.length > 1 ? 's' : ''} from ${sysName(sys)} toward the rally at ${sysName(rally)} (via ${sysName(p[0])})`);
  }
  const atRally = resting(c, rally, kind);
  if (target && path && atRally.length && worthOf(atRally) >= need && atRally.every(s => (s.u.st ?? 100) >= 85) && !moving) {
    const next = path[0];
    if (act({ type: 'send', design: D[kind].id, n: atRally.length, from: rally, to: next })) { note(`${atRally.length} ${D[kind].name}${atRally.length > 1 ? 's' : ''} (worth ${Math.round(worthOf(atRally))}) leave ${sysName(rally)} for ${sysName(next)}${next === target.sys ? ' — the target' : ''}${lyBetween(S, rally, next) > REACH[kind] * 0.95 ? ', daring past their reach' : ''}`); rally = next; path = path.slice(1); }
  }
  // THE EON
  const hostilesBefore = S.hostiles.length, shipsBefore = S.ships.length;
  endEon(S);
  const battles = S.report.filter(r => /^Battle at/.test(r.text)).map(r => r.text);
  for (const b of battles) note(b);
  if (target && battles.some(b => /held the field|neither side gave way/.test(b))) { stale++; if (stale === 2) note(`the fight at ${sysName(target.sys)} drags on — more ships will be sent`); }
  for (const r of S.report) if (/lost between|derelict|was lost/.test(r.text)) note(r.text);
  if (S.hostiles.length < hostilesBefore) beaten += hostilesBefore - S.hostiles.length;
  lost += Math.max(0, shipsBefore - S.ships.length);
  if (target && !S.hostiles.includes(target)) { note(`✓ ${target.plan.name} beaten — ${S.hostiles.length} left`); target = null; path = null; }
  else if (target && !path?.length && rally === target.sys && !S.ships.some(u => u.design.id === D[kind].id && (u.dest || sysOfPlace(u.at) === target.sys))) { note(`✗ the fleet at ${sysName(target.sys)} is gone — back to Home to rebuild`); rally = HOME; target = null; path = null; }
  log.eons.push({ eon: S.eon, people: Math.round(pc.P.people * 10) / 10, industry: Math.round(pc.industry), reserves: Math.round(S.reserves || 0), cohesion: Math.round(S.cohesion), ships: S.ships.length, hostiles: S.hostiles.length, battles });
  if (!S.hostiles.length) { note('every hostile fleet is beaten'); break; }
  if (eon === MAX_EONS - 1) note('out of eons');
}
const summary = `seed "${seedText}": ${S.eon} eons · ${beaten} hostile fleet${beaten === 1 ? '' : 's'} beaten, ${S.hostiles.length} left · ${lost} ships lost · home ${peopleWord(home.colony.people)} people, reserves ${Math.round(S.reserves || 0)} · ${log.actions.length} actions`;
log.summary = summary; note(summary);
fs.mkdirSync(join(here, 'out'), { recursive: true });
fs.writeFileSync(join(here, 'out', `${seedText}.json`), JSON.stringify(log));
console.log(`written tools/play/out/${seedText}.json`);
