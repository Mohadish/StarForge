// A WORLD: one galaxy, several EMPIRES (his ask, 2026-10-16: "two or three AIs starting off the same, the battle for galaxy
// domination"). Every empire is a full game state of its own — its home, colonies, ships, designs, tech, focus, cohesion,
// reserves — on the same galaxy (the same seed grows the same stars for each). Between the eons the world does what no single
// state can: fleets of two empires resting in one system FIGHT (the battle's own engine, each side with its own tech and the
// stamina it has); a fleet that holds a system where another empire has colonies and no fleet lays SIEGE, and after
// WORLD.siege eons the colonies there change hands; an empire whose home falls is gone (his rule), its ships with it; the last
// empire standing has the galaxy. No roaming hostile fleets in a world: the empires are the enemy. Every empire also gets
// `S.others`: where the other empires' colonies and fleets are, for its maps and its AI. No DOM.
import { T, newState, compute, endEon, uid, cloneDesign, hostileWorth, peopleWord } from './model.js';
import { shipFromDesign, createBattle, rng32 } from './battle.js';
import { allCapsules, designStats } from './modules.js';
import { applyAction } from './replay.js';

// CONQUEST (his rule, 2026-10-16): no taking an alien colony by siege. A fleet holding a system where another empire has colonies
// and no fleet BLOCKADES them (model.js: no growth, no building, the mood sours) — and that is all a fleet can do. To take a
// colony you LAND TROOPS: ships with people aboard (drop ships) at the colony's place, the system clear of its fleet;
// troops × T.ground.ratio against the colony's militia (T.ground.militia of its people). Win: the colony is yours, its people
// gone, your troops its first settlers (exterminate and replace — subjugation later); lose: the ships are lost, the militia it
// matched with it. A homeworld taken = the empire is gone.
// FOR NOW (his call, 2026-10-17: "blockades will take over planets" — until the ground war is built): a blockade held WORLD.siege
// eons takes the colonies there; only an ARMED ship of theirs resting in the system breaks it (a settler does not).
// each empire: a name, a colour pair (his 2026-10-17: 4th yellow, 5th purple), a plating style, a SILHOUETTE of its own — HIS
// silhouettes from hullpack.js ("don't use darts, use the ones I've created"): Hammerhead III, Britanica, USS, pick axe, Dart II
export const WORLD = { siege: 3, names: ['Sol', 'Rival', 'Third', 'Fourth', 'Fifth'], colors: [['#7fb3ff', '#ffb347'], ['#ff8a6b', '#f5a3c7'], ['#7ef3b0', '#ffe08a'], ['#ffd94a', '#ff9f43'], ['#c084fc', '#5fe3d0']], styles: ['utopia2', 'greeble1', 'mushroom1', 'crate1', 'crystal1'], hulls: ['umfwajfq', 'ug1cdtqc', 'u51lsbay', 'u3fkxd5m', 'u68ap7qe'] };
export const MAX_EMPIRES = 5;
export const seedOf = text => { const s = String(text).trim(); if (/^\d{1,9}$/.test(s)) return Number(s); let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const worldRand = W => { let t = (W.seed + Math.imul(0x6D2B79F5, ++W.rolls)) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const sysOfPlace = (S, id) => (S.places.find(p => p.id === id) || {}).sys;
const WATER = new Set(['#5fc48a', '#4fa3ff', '#bfe6ff']);                        // living, ocean, ice (model.js worldOf)

// a second (third…) empire's home: a landable world with water, as far from the homes already taken as the galaxy allows
function pickHome(S, taken) {
  const cands = S.places.filter(p => p.landable && WATER.has(p.color) && !taken.includes(p.sys));
  const far = cands.map(p => { const s = S.systems.find(x => x.id === p.sys); const d = Math.min(...taken.map(t => { const o = S.systems.find(x => x.id === t); return Math.hypot(s.x - o.x, s.y - o.y); })); return { p, d }; }).sort((a, b) => b.d - a.d || a.p.id.localeCompare(b.p.id));
  return far[0] ? far[0].p : null;
}
function moveHome(S, pl) {
  const sol = S.places.find(p => p.id === 'home'), dock = sol.colony.structures[0];
  delete sol.colony; sol.fresh = Object.fromEntries(Object.keys(sol.fresh).map(k => [k, 1]));
  pl.colony = { people: 100, baseHousing: 120, split: [1 / 3, 1 / 3, 1 / 3], happiness: 60, queue: [], structures: [{ ...dock, id: uid('u'), design: cloneDesign(dock.design) }], factories: 0 };
  pl.fresh = Object.fromEntries(Object.keys(pl.fresh).map(k => [k, 0.9])); pl.note = 'the homeworld — your people have lived here for 2,000 years';
  for (const s of S.systems) s.home = s.id === pl.sys;
  S.homeSys = pl.sys; S.homePlace = pl.id;
}
// o.galaxy: { count, radius } (galaxy.js galaxyOf) — a bigger sector for more empires (his ask: 150 stars, five empires)
export function createWorld(seedText, n = 2, o = {}) {
  n = Math.max(2, Math.min(MAX_EMPIRES, n));
  const seed = seedOf(seedText), W = { seedText, seed, n, galaxy: o.galaxy || null, eon: 1, rolls: 0, empires: [], sieges: {}, events: [], winner: null, me: null, brains: null };   // me / brains: a human plays empire `me`, the rest have heads (ai.js) — the game sets them
  const taken = [];
  for (let i = 0; i < n; i++) {
    const S = newState(seed, { galaxy: o.galaxy }); S.seedText = String(seedText); S.hostiles = []; S.empire = i; S.name = WORLD.names[i] || `Empire ${i + 1}`; S.homePlace = 'home';
    S.look = { style: WORLD.styles[i % WORLD.styles.length], colA: WORLD.colors[i % WORLD.colors.length][0], colB: WORLD.colors[i % WORLD.colors.length][1], hull: WORLD.hulls[i % WORLD.hulls.length] };
    if (i > 0) { const pl = pickHome(S, taken); if (!pl) throw new Error('no world left for another empire'); moveHome(S, pl); }
    taken.push(S.homeSys); W.empires.push(S);
  }
  others(W);
  return W;
}
export const living = W => W.empires.filter(S => !S.dead);
export const empireColor = S => (S.look && S.look.colA) || '#fff';
// what each empire sees of the others: their colonies and resting fleets, by system
function others(W) {
  const cs = new Map(W.empires.map(S => [S, S.dead ? null : compute(S)]));
  for (const S of W.empires) {
    S.others = W.empires.filter(o => o !== S && !o.dead).map(o => {
      const c = cs.get(o), fleets = new Map();
      for (const s of c.ships) if (!s.u.dest) { const sys = sysOfPlace(o, s.u.at); const f = fleets.get(sys) || { sys, n: 0, worth: 0 }; f.n++; f.worth += s.t.cost; fleets.set(sys, f); }
      return { empire: o.empire, name: o.name, color: empireColor(o), home: o.homeSys, colonies: o.places.filter(p => p.colony).map(p => ({ sys: p.sys, place: p.id, name: p.name, people: Math.round(p.colony.people * 10) / 10, home: p.id === o.homePlace, blockaded: p.colony.blockaded || 0 })), fleets: [...fleets.values()] };
    });
  }
  return cs;
}
// is this place free for an empire to settle? (another empire's colony there says no) · who holds it
export const ownerOf = (W, S, placeId) => W.empires.find(o => o !== S && !o.dead && o.places.some(p => p.id === placeId && p.colony)) || null;
export const heldByAnother = (W, S, placeId) => !!ownerOf(W, S, placeId);
// LAND TROOPS at another empire's colony: every ship of S with people aboard resting at that place goes in together
export function invade(W, S, placeId) {
  const O = ownerOf(W, S, placeId); if (!O) return 'Nobody else holds it';
  const pl = O.places.find(p => p.id === placeId), mine = S.places.find(p => p.id === placeId);
  const ships = S.ships.filter(u => !u.dest && u.at === placeId && u.people > 0); if (!ships.length) return 'No ship with people aboard is resting there';
  if (armedIn(O, pl.sys)) return `${O.name}'s fleet defends ${pl.name} — clear the system first`;
  const troops = ships.reduce((a, u) => a + u.people, 0), militia = pl.colony.people * T.ground.militia, power = troops * T.ground.ratio;
  const where = `${pl.name} (${(S.systems.find(x => x.id === pl.sys) || {}).name || pl.sys})`, home = pl.id === O.homePlace;
  S.ships = S.ships.filter(u => !ships.includes(u));
  if (power > militia) {                                                          // TAKEN: their people are gone, the troops settle, their buildings stand
    const was = pl.colony;
    mine.colony = { ...JSON.parse(JSON.stringify(was)), people: troops, queue: [], happiness: 60, split: [1 / 3, 1 / 3, 1 / 3], pol: { industry: 0, research: 0, social: 0 } }; delete mine.colony.blockaded;
    for (const u of ships) mine.colony.structures.push({ id: uid('u'), name: 'Landed ' + u.name, klass: 'structure', design: u.design, eon: S.eon, landed: true, grade: Math.max(0.05, (u.st ?? 100) / 100) });
    delete pl.colony;
    const text = `Invasion of ${where}: ${S.name}'s ${peopleWord(troops)} troops against ${O.name}'s militia of ${peopleWord(militia)} — the colony is ${S.name}'s; ${peopleWord(was.people)} of ${O.name}'s people are gone${home ? ' — its HOMEWORLD' : ''}`;
    S.report.push({ kind: 'build', text }); O.report.push({ kind: 'bad', text }); W.events.push({ eon: W.eon, kind: 'capture', text, sys: pl.sys, from: O.empire, to: S.empire });
    if (home) { O.dead = true; O.ships = []; const g = `${O.name} is no more: its homeworld has fallen to ${S.name}`; W.events.push({ eon: W.eon, kind: 'fall', text: g, empire: O.empire }); for (const X of W.empires) if (!X.dead || X === O) X.report.push({ kind: X === O ? 'bad' : 'battle', text: g }); }
    const live = living(W); if (live.length === 1 && W.n > 1 && W.winner == null) { W.winner = live[0].empire; const t = `${live[0].name} holds the galaxy — the last empire standing`; W.events.push({ eon: W.eon, kind: 'win', text: t, empire: live[0].empire }); live[0].report.push({ kind: 'battle', text: t }); }
    return null;
  }
  pl.colony.people = Math.max(1, pl.colony.people - power);                       // REPELLED: the troops are lost, and the militia they matched
  const text = `Invasion of ${where}: ${S.name}'s ${peopleWord(troops)} troops against ${O.name}'s militia of ${peopleWord(militia)} — thrown back; the ${ships.length} ship${ships.length === 1 ? '' : 's'} lost, ${peopleWord(power)} of ${O.name}'s people with them`;
  S.report.push({ kind: 'bad', text }); O.report.push({ kind: 'battle', text }); W.events.push({ eon: W.eon, kind: 'repelled', text, sys: pl.sys, from: O.empire, to: S.empire });
  return null;
}
// what the troops aboard ships at a place would face: for the panels and the AI
export function invasionOdds(W, S, placeId) {
  const O = ownerOf(W, S, placeId); if (!O) return null;
  const pl = O.places.find(p => p.id === placeId), ships = S.ships.filter(u => !u.dest && u.at === placeId && u.people > 0), troops = ships.reduce((a, u) => a + u.people, 0);
  return { O, pl, ships, troops, power: troops * T.ground.ratio, militia: pl.colony.people * T.ground.militia, defended: armedIn(O, pl.sys) };
}
// an ARMED ship of this empire resting in the system (a settler defends nothing)
export const armedIn = (O, sys) => { const caps = allCapsules(O); return O.ships.some(u => !u.dest && sysOfPlace(O, u.at) === sys && designStats(O, u.design, caps).t.dps > 0); };
// an order on a world: the world's own (invade; settle on a held place refused), else the state's (replay.js)
export function applyWorldAction(W, S, a) {
  if (a.type === 'invade') return invade(W, S, a.place);
  if (a.type === 'settle' && heldByAnother(W, S, a.place)) return `${ownerOf(W, S, a.place).name} holds it — land troops instead`;
  return applyAction(S, a);
}
export function applyWorldEon(W, S, actions, eon) { const bad = []; for (const a of actions) if (a.eon === eon) { const err = applyWorldAction(W, S, a); if (err) bad.push({ a, err }); } return bad; }

// fleets of two empires in one system fight; survivors keep what the fight left them
function fightEmpires(W, rep) {
  const live = living(W);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const Si = live[i], Sj = live[j];
    const bySys = S => { const m = new Map(); for (const u of S.ships) if (!u.dest) { const sys = sysOfPlace(S, u.at); (m.get(sys) || m.set(sys, []).get(sys)).push(u); } return m; };
    const mi = bySys(Si), mj = bySys(Sj);
    for (const [sys, A0] of mi) {
      const B0 = mj.get(sys); if (!B0 || !B0.length || Si.dead || Sj.dead) continue;
      const capsI = allCapsules(Si), capsJ = allCapsules(Sj);
      const A = A0.map(u => { const sh = shipFromDesign(Si, u.design, capsI); sh.name = u.name; sh.en0 = (u.st ?? 100) / 100; return sh; });
      const B = B0.map(u => { const sh = shipFromDesign(Sj, u.design, capsJ); sh.name = u.name; sh.en0 = (u.st ?? 100) / 100; return sh; });
      // each side keeps the battle to watch it (before the fight touches the stamina): the other side's ships as a fixed plan, its tech, the dice
      const planOf = (S, units, built) => ({ name: `${S.name}'s fleet`, style: S.look.style, colA: S.look.colA, colB: S.look.colB, ships: units.map((u, k) => ({ design: { ...cloneDesign(u.design), paint: u.design.paint }, keep: true, name: u.name, en0: built[k].en0, strain: u.strain || 0, cost: built[k].cost, seed: 1, locked: true })) });
      const mineOf = (units, built) => units.map((u, k) => ({ name: u.name, en0: built[k].en0, strain: u.strain || 0, design: { ...cloneDesign(u.design), paint: u.design.paint } }));
      const planA = planOf(Si, A0, A), planB = planOf(Sj, B0, B), seed = Math.floor(worldRand(W) * 1e9);
      Si.battles = Si.battles || []; Sj.battles = Sj.battles || [];
      Si.battles.push({ id: uid('b'), eon: Si.eon, sys, seed, foe: planB, foeTech: Sj.breakthroughs, mine: mineOf(A0, A) });
      Sj.battles.push({ id: uid('b'), eon: Sj.eon, sys, seed, foe: planA, foeTech: Si.breakthroughs, mine: mineOf(B0, B), swapped: true });
      const bt = createBattle(A, B, rng32(seed), { record: 1e9 }); while (!bt.done) bt.step(); const r = bt.result();
      const where = (Si.systems.find(x => x.id === sys) || {}).name || sys, lostA = [], lostB = [];
      A0.forEach((u, k) => { const sh = bt.ships[k]; if (sh.dead) lostA.push(u); else u.st = Math.max(1, Math.round(Math.max(0, sh.en) * 100)); });
      B0.forEach((u, k) => { const sh = bt.ships[A0.length + k]; if (sh.dead) lostB.push(u); else u.st = Math.max(1, Math.round(Math.max(0, sh.en) * 100)); });
      Si.ships = Si.ships.filter(u => !lostA.includes(u)); Sj.ships = Sj.ships.filter(u => !lostB.includes(u));
      const verdict = r.winner === 0 ? `${Si.name} won the field` : r.winner === 1 ? `${Sj.name} won the field` : 'neither side gave way';
      const text = `Battle at ${where}: ${Si.name}'s ${A0.length} against ${Sj.name}'s ${B0.length} — ${verdict}; ${Si.name} lost ${lostA.length}, ${Sj.name} lost ${lostB.length}`;
      rep.push({ kind: 'battle', text, sys, a: Si.empire, b: Sj.empire });
      Si.report.push({ kind: lostA.length ? 'bad' : 'battle', battle: Si.battles.at(-1).id, text }); Sj.report.push({ kind: lostB.length ? 'bad' : 'battle', battle: Sj.battles.at(-1).id, text });
    }
  }
}
// an ARMED fleet alone in a system where another empire has colonies BLOCKADES them: `colony.blockaded` = eons so far (model.js
// stalls the colony); W.sieges counts per system | victim | attacker. Nothing changes hands here — troops do that (invade)
function blockades(W, cs, rep) {
  const live = living(W), seen = new Set(); let changed = false;
  const armedSys = S => new Set(cs.get(S).ships.filter(s => !s.u.dest && s.t.dps > 0).map(s => sysOfPlace(S, s.u.at)));
  const armed = new Map(live.map(S => [S, armedSys(S)]));
  for (const O of live) for (const p of O.places) if (p.colony) delete p.colony.blockaded;
  for (const S of live) {
    for (const sys of armed.get(S)) for (const O of live) {
      if (O === S || O.dead) continue;
      const theirs = O.places.filter(p => p.colony && p.sys === sys); if (!theirs.length) continue;
      const defended = armed.get(O).has(sys); const key = `${sys}|${O.empire}|${S.empire}`; seen.add(key);   // only an ARMED ship of theirs breaks a blockade
      if (defended) { delete W.sieges[key]; continue; }
      const n = W.sieges[key] = (W.sieges[key] || 0) + 1, where = (S.systems.find(x => x.id === sys) || {}).name || sys;
      if (n < WORLD.siege) {
        for (const pl of theirs) pl.colony.blockaded = Math.max(pl.colony.blockaded || 0, n);
        const t = `${S.name} blockades ${O.name}'s ${theirs.map(p => p.name).join(', ')} at ${where} (${n} of ${WORLD.siege} eons — held that long, it changes hands)`; rep.push({ kind: 'siege', text: t, sys }); S.report.push({ kind: 'move', text: t }); O.report.push({ kind: 'bad', text: t });
        continue;
      }
      delete W.sieges[key]; changed = true;                                       // TAKEN by the blockade (for now, his call)
      for (const pl of theirs) {
        const mine = S.places.find(p => p.id === pl.id); mine.colony = JSON.parse(JSON.stringify(pl.colony)); mine.colony.queue = []; delete mine.colony.blockaded; delete pl.colony;
        const t = `${S.name} takes ${pl.name} at ${where} from ${O.name} after ${WORLD.siege} eons of blockade${pl.id === O.homePlace ? ' — its HOMEWORLD' : ''}`; rep.push({ kind: 'capture', text: t, sys, from: O.empire, to: S.empire }); S.report.push({ kind: 'build', text: t }); O.report.push({ kind: 'bad', text: t });
        if (pl.id === O.homePlace) { O.dead = true; O.ships = []; const g = `${O.name} is no more: its homeworld has fallen to ${S.name}`; rep.push({ kind: 'fall', text: g, empire: O.empire }); for (const X of live) X.report.push({ kind: X === O ? 'bad' : 'battle', text: g }); }
      }
    }
  }
  for (const k of Object.keys(W.sieges)) if (!seen.has(k)) delete W.sieges[k];
  return changed;
}
// one eon of the world: every living empire's own eon, then the fights, the blockades, the fallen, and what each sees of the rest
export function worldEndEon(W) {
  const rep = [];
  for (const S of W.empires) S.battles = [];                                       // a fallen empire's last battle used to stay on the map for ever (his catch, 2026-10-17)
  for (const S of living(W)) endEon(S);
  fightEmpires(W, rep);
  let cs = others(W);
  if (blockades(W, cs, rep)) cs = others(W);
  const live = living(W); if (live.length === 1 && W.n > 1 && W.winner == null) { W.winner = live[0].empire; rep.push({ kind: 'win', text: `${live[0].name} holds the galaxy`, empire: live[0].empire }); for (const X of live) X.report.push({ kind: 'battle', text: `${live[0].name} holds the galaxy — the last empire standing` }); }
  W.eon++; W.events.push(...rep.map(r => ({ eon: W.eon - 1, ...r })));
  return { rep, cs };
}
// a snapshot of the whole world (the replay's rewind) and back
export const worldSnapshot = W => JSON.stringify({ eon: W.eon, rolls: W.rolls, sieges: W.sieges, winner: W.winner, events: W.events, empires: W.empires });
export function worldRestore(W, snap) { const o = JSON.parse(snap); W.eon = o.eon; W.rolls = o.rolls; W.sieges = o.sieges; W.winner = o.winner; W.events = o.events || []; W.empires.splice(0, W.empires.length, ...o.empires); return W; }
// a world where a human plays empire `me` and the others think for themselves (ai.js makeBrain, handed in by the caller — no
// import cycle): each eon the heads give their orders, the world ends the eon, the heads read what happened
export function worldPlayEon(W, makeBrain) {
  if (!W.brains) W.brains = W.empires.map((E, k) => k === W.me || E.dead ? null : makeBrain(W, E));
  for (const b of W.brains) if (b && !b.S.dead) b.plan();
  const out = worldEndEon(W);
  for (const b of W.brains) if (b && !b.S.dead) b.after();
  return out;
}
export { hostileWorth };
