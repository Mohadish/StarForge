// BATTLE — two designs fight it out on an open field, as the design screen's numbers say they should.
// No DOM. Used by the battle lab (lab.html) and later by the game itself.
//
// WHAT FLIES. Beams and shells are instant. MISSILES are things: they launch, corkscrew across, and
// smash into the hull (or fly past). DRONES are little craft from a hangar: they fly until they die,
// hover round the enemy and shoot; a fabricator aboard builds more missiles and drones.
// WHO SHOOTS WHAT. A gun with the point-defence role turns on incoming missiles and drones first and
// on the ship only when nothing is coming in. Every other gun shoots the ship, and drones only when
// the ship is out of its reach. So killing a swarm costs the damage you were putting on the ship.
// MOVEMENT. Each ship holds the distance where most of its damage reaches — closing, backing off,
// circling — and the faster ship wins that argument; the field has a hard edge, so a runner is cornered.
import { designStats, allCapsules, autoFit, KINDS, FAB, DODGE, SHIELD, HULL, PRESETS, TURRET, traverseOf, applyPreset } from './modules.js';
import { hullsFor } from './hull.js';
// the silhouettes random ships are drawn from: the player's own starships (hull.js setUserHulls) and the shipped pack of his (hullpack.js) when there are any, else the plain built-in ones
export const starshipHulls = () => { const all = hullsFor('starship'), own = all.filter(h => h.user || h.pack); return own.length ? own : all; };

export const B = { dt: 0.25, start: 3000, maxTime: 600, record: 1, unit: 8, minGap: 60, wing: 90, spread: 110, arena: 2200, strafe: 0.6,   // wing: how close wingmen come to each other; spread: a fleet's starting line
  missile: { speed: 320, spiral: 70, twist: 4.5, hitRadius: 30, life: 14 },
  // a drone flies on a BATTERY: every unit flown drains it, every volley drains it, and it must keep
  // enough to get home — so the farther the carrier stands off, the fewer volleys a drone delivers
  // (battery 100, 0.1 per unit flown, 10 per volley: ~7 volleys from 150 u, ~1 from 450 u, none from 500).
  // Home, a fabricator with stock refurbishes it; otherwise it is done. `sortie` caps the time out.
  drone: { hp: 70, speed: 240, dmg: 30, rate: 0.4, range: 120, acc: 65, evade: 0.55, launchEvery: 2.5, sortie: 90, dock: 40, battery: 100, travelCost: 0.1, shotCost: 10, idleCost: 0.5, reach: 220 } };   // a VOLLEY, not a pea-shooter: 12 dps either way, but 12-a-shot left 1 after a shield's hardness (8) and armour's shrug-off (3); 30 leaves 19
export const volleysFrom = dist => Math.max(0, Math.floor((B.drone.battery - 2 * dist * B.drone.travelCost) / B.drone.shotCost));   // what a drone can deliver from a stand-off distance
// the rock-paper-scissors levers (tuned in the lab; see tune_rps):
//   point-defence guns reach out to swat missiles and drones → a ship with PD beats missiles and drones
//   kinetic shells punch part of their damage straight through a shield → guns beat beam ships, which lean on shields
//   missiles outrange and outrun slow gun ships → missiles beat guns; drones ignore range altogether
export const PD = { reach: 500, vsMissile: 0.8, vsDrone: 1.0, beamVsDrone: 2, missileMin: 250, beamIdle: 0.85, gunIdle: 0.4 };   // PD envelope; hit factors against missiles / drones; a beam fries a drone (×damage); missiles cannot arm inside missileMin; how well a beam / a kinetic gun without the PD role does the job
export const PEN = { weapon_kinetic: 0.15, weapon_missile: 0.15, weapon_energy: 0 };  // share of a hit that ignores the shield

export function rng32(seed) {
  let a = (seed ^ 0x9E3779B9) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// a design, read for battle
export function shipFromDesign(S, design, caps = allCapsules(S)) {
  const ds = designStats(S, design, caps), t = ds.t, guns = [], hangars = [], midx = (ds.hull.box.minx + ds.hull.box.maxx) / 2;
  for (const m of ds.mods) {
    if (m.K.hangar) { hangars.push({ craft: Math.round(m.v.craft) * m.n, size: m.v.size, n: m.n }); continue; }
    if (m.K.mount && !m.K.orbital) {
      const mine = ds.mounts.filter(mt => mt.modId === m.mod.id);           // where each gun of this module sits on the hull (hull squares, nose = +x)
      for (let i = 0; i < m.n; i++) guns.push({ kind: m.kind, role: m.mod.role || 'ship', dmg: m.v.damage * t.powerFactor * t.fireFactor, rate: m.v.rate, range: m.v.range, acc: Math.min(98, m.v.accuracy + t.bonus), cd: 0, ammo: m.K.charges ? Math.round(m.v.charges) : Infinity, mag: m.K.charges ? Math.round(m.v.charges) : Infinity,
        mx: ((mine[i] ? mine[i].x : midx) - midx) * B.unit, my: (mine[i] ? mine[i].y : 0) * B.unit, size: mine[i] ? mine[i].size : 1,   // the hard point, in field units from the ship's centre
        trav: traverseOf(m.kind, mine[i] ? mine[i].size : 1) });                 // how fast the mount slews, degrees a second (0 = a launcher, no turret)
    }
  }
  // the range it wants: where most of its damage per second reaches (drones count as reach 0: they go anywhere)
  const shooters = guns.filter(g => g.role !== 'pd'), pool = shooters.length ? shooters : guns;
  const byRange = pool.slice().sort((a, b) => b.range - a.range), total = pool.reduce((a, g) => a + g.dmg * g.rate, 0);
  let acc = 0, pref = hangars.length && !pool.length ? B.drone.reach : 300;
  for (const g of byRange) { acc += g.dmg * g.rate; if (acc >= total * 0.6) { pref = g.range; break; } }
  if (hangars.length && pool.length) pref = Math.min(pref, B.drone.reach);   // a carrier must come close enough for its drones' batteries
  return { name: design.name, design, ds, t, guns, hangars, pref, hp: t.hp, hpMax: t.hp, ar: t.armor, arMax: t.armor, sh: t.shieldRaw, shMax: t.shieldRaw, cover: t.cover, rec: t.shieldRec, deflect: t.deflect, repair: t.repair, hullRepair: t.hullRepair, speed: t.speed, turn: t.turn, evade: t.evasion / 100, dps: t.dps, cost: t.cost,
    hullR: Math.max(12, 0.45 * ds.hull.bw * B.unit), shieldR: Math.max(16, 0.62 * ds.hull.bw * B.unit),   // where a missile meets the hull, and where the shield's edge is (as the replay draws them)
    missiles: t.missiles, drones: t.drones, airCap: t.airCap, fab: t.industry * FAB.missilesPerIndustry, dfab: t.industry * FAB.dronesPerIndustry, pd: guns.filter(g => g.role === 'pd').length,
    stock: t.fabStock, missileCost: t.missileCost, droneCost: t.droneCost, maxReloads: t.maxReloads, maxSorties: t.maxSorties };
}
const missilesLeft = s => s.guns.reduce((a, g) => a + (Number.isFinite(g.ammo) ? g.ammo : 0), 0);
// what a mover wants to do this tick to hold `want` from (tx,ty) — close / back off / circle — as a displacement
const plan = (s, tx, ty, want, band, spin) => {
  const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const step = s.speed * B.dt, radial = Math.max(-1, Math.min(1, (d - want) / band)), tang = B.strafe * spin * (1 - Math.abs(radial)) * step;
  const rad = Math.sign(radial) * Math.min(Math.abs(radial) * step, Math.abs(d - want));   // never past the wanted distance in one tick: a drone (60 u a tick, band 24) used to bounce in and out of its band for the whole sortie
  return { d, mx: ux * rad - uy * tang, my: uy * rad + ux * tang };
};
const wall = s => { const r = Math.hypot(s.x, s.y); if (r > B.arena) { s.x *= B.arena / r; s.y *= B.arena / r; } };
const steer = (s, tx, ty, want, band, spin) => { const p = plan(s, tx, ty, want, band, spin); s.x += p.mx; s.y += p.my; wall(s); return p.d; };   // a drone: it just goes
// a SHIP has mass: it swings its nose toward where it wants to go at its turn rate (degrees a second, from
// its thrusters against its bulk) and moves along the nose — flat out once lined up, slower while still
// swinging, not at all while it points the wrong way. So a 50-square hull takes half a minute to come about.
const norm = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const slew = (g, want) => { const maxT = g.trav * Math.PI / 180 * B.dt, d = norm(want - g.aim); g.aim = norm(g.aim + Math.max(-maxT, Math.min(maxT, d))); };   // a turret turns toward `want` at its rate
const go = (s, tx, ty, want, band, spin) => {
  const p = plan(s, tx, ty, want, band, spin), len = Math.hypot(p.mx, p.my);
  if (len > 1e-6) {
    const wantAng = Math.atan2(p.my, p.mx), maxTurn = (s.turn || 30) * eff(s) * Math.PI / 180 * B.dt, diff = norm(wantAng - s.ang);
    s.ang = norm(s.ang + Math.max(-maxTurn, Math.min(maxTurn, diff)));
    const align = Math.cos(norm(wantAng - s.ang));
    if (align > 0) { s.x += Math.cos(s.ang) * len * align; s.y += Math.sin(s.ang) * len * align; }
  }
  wall(s); return p.d;
};
// a hit on a ship: shield first on the covered part (and a shield shrugs off the first SHIELD.hard of
// every hit, so small fast shots barely dent it), then the ARMOUR layer, which shrugs a little off every
// hit while it lasts, and only then the hull — where every point lost slows the whole ship down
// Returns what reached the hull and WHERE the hit landed ('shield' / 'hull'), so the replay can burst in the
// right place; `onShield` forces the shield roll (a missile decides it at the shield's edge).
function strike(o, dmg, kind, rng, onShield) {
  const pen = PEN[kind] || 0; let soft = dmg * (1 - pen); const through = dmg * pen;
  const shielded = o.sh > 0 && (onShield === undefined ? rng() < o.cover : onShield);
  if (shielded) { const bite = Math.max(0, soft - SHIELD.hard), ab = Math.min(o.sh, bite); o.sh -= ab; soft = bite - ab; }
  let h = soft + through;
  if (o.ar > 0) { h = Math.max(0, h - o.deflect); const ab = Math.min(o.ar, h); o.ar -= ab; h -= ab; }
  if (h > 0) o.hp -= h; return { h, where: shielded ? 'shield' : 'hull' };
}
// how well a ship runs: whole at full hull, HULL.degradeFloor of itself at none
const eff = s => HULL.degradeFloor + (1 - HULL.degradeFloor) * Math.max(0, s.hp) / s.hpMax;

// one fight between two FLEETS (a single ship is a fleet of one); returns the winning side (0 / 1 / null
// for a draw), the time, and frames for a replay. Every ship picks its own target — the nearest living
// enemy, a hurt one counting as nearer — holds its range from it and keeps clear of its wingmen;
// missiles and drones go for their ship's target; a fleet has lost when its last ship is dead.
// `createBattle` runs it tick by tick — the lab's command mode steps it live and feeds ORDERS in;
// `simulate` drains it in one go. Orders are a layer over that default: a side with none fights as before.
//   eliminate {ships}  the fleet puts everything on those enemies (then back to its own picking)
//   avoid {ships}      every ship keeps AVOID away from them; still shoots what is in reach
//   area protect       stay inside the circle, fight what comes near; attack: go there, fight what is in it; avoid: never inside it
//   retreat            everyone flat out away from the nearest enemy; the clock then decides on points
export const AVOID = 650;
export function createBattle(a0, b0, rng = rng32(1), { record = B.record } = {}) {
  const mk = (s, side, x, y) => ({ ...s, side, x, y, ang: side ? Math.PI : 0, spin: 1, dead: false, tgt: null, guns: s.guns.map(g => ({ ...g, aim: side ? Math.PI : 0 })), pool: 0, dpool: 0, stock: s.stock || 0, repaired: 0, speed0: s.speed, bays: s.hangars.map(h => ({ ...h, left: h.craft, spent: 0, cd: 0 })) });
  const FA = Array.isArray(a0) ? a0 : [a0], FB = Array.isArray(b0) ? b0 : [b0];
  const line = (F, side) => F.map((s, i) => mk(s, side, (side ? 1 : -1) * B.start / 2, (i - (F.length - 1) / 2) * B.spread));   // a fleet starts in a line abreast
  const ships = [...line(FA, 0), ...line(FB, 1)]; ships.forEach((s, i) => { s.idx = i; });
  const fleets = [ships.filter(s => s.side === 0), ships.filter(s => s.side === 1)];
  const alive = side => fleets[side].filter(s => !s.dead);
  const fleetHull = side => fleets[side].reduce((a, s) => a + Math.max(0, s.hp), 0) / fleets[side].reduce((a, s) => a + s.hpMax, 0);
  const frames = [], hits = [0, 0], dealt = [0, 0], shot = [0, 0];           // shot: missiles + drones killed by each side's PD
  let time = 0, shots = [], nextRec = 0, winner = null, nextId = 1, done = false;
  const missiles = [], drones = [];
  const orders = [0, 1].map(() => ({ eliminate: new Set(), avoid: new Set(), area: null, retreat: false })), given = [];
  const frame = () => frames.push({ t: Math.round(time * 100) / 100, p: ships.map(s => [Math.round(s.x), Math.round(s.y)]), a: ships.map(s => Math.round(s.ang * 100) / 100), ga: ships.map(s => s.guns.map(g => Math.round(g.aim * 100) / 100)), hp: ships.map(s => s.hp / s.hpMax), ar: ships.map(s => s.arMax ? s.ar / s.arMax : 0), sh: ships.map(s => s.shMax ? s.sh / s.shMax : 0),
    msl: ships.map(missilesLeft), dr: ships.map(s => drones.filter(d => d.owner === s.idx).length), bays: ships.map(s => s.bays.reduce((a, b) => a + b.left, 0)), spent: ships.map(s => s.bays.reduce((a, b) => a + b.spent, 0)), stock: ships.map(s => Math.round(s.stock)),
    ents: [...missiles.map(m => [m.id, m.side, 'm', Math.round(m.x), Math.round(m.y)]), ...drones.map(d => [d.id, d.side, 'd', Math.round(d.x), Math.round(d.y), Math.round(100 * d.hp / d.hpMax), d.home ? 1 : 0])], shots });
  // a shot: [side, kind, outcome (0 miss · 1 hit on hull/armour · 2 missile swatted · 3 drone hit · 4 the shield took it), from x,y, to x,y, ship index, gun index,
  //   when within the second it fired (0–1), target ship index (−1 = an entity or none), target entity id, shooter entity id (a drone — or the
  //   missile itself, arriving), the mark's offset from the target's centre]. The last six let the replay draw the shot LIVE: from where the
  //   barrel is at that moment to where the target is at that moment, so a hit lands on the ship and not on where it was.
  const log = (side, kind, outcome, fx, fy, tx, ty, si, gi, tgt = null, se = 0) => {
    const ship = !!(tgt && tgt.guns !== undefined), u = Math.max(0, Math.min(1, (time - (nextRec - record)) / record));
    shots.push([side, kind, outcome, Math.round(fx), Math.round(fy), Math.round(tx), Math.round(ty), si, gi, Math.round(u * 100) / 100, ship ? tgt.idx : -1, tgt && !ship ? tgt.id : 0, se, tgt ? Math.round(tx - tgt.x) : 0, tgt ? Math.round(ty - tgt.y) : 0]);
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const gunAt = (s, g) => { const c = Math.cos(s.ang), sn = Math.sin(s.ang); return [s.x + c * g.mx - sn * g.my, s.y + sn * g.mx + c * g.my]; };       // a hard point in the field
  const impact = (o, fx, fy, where) => { const dx = fx - o.x, dy = fy - o.y, d = Math.hypot(dx, dy) || 1, r = where === 'shield' ? o.shieldR : o.hullR; return [o.x + dx / d * r, o.y + dy / d * r]; };   // where on the target a hit from (fx,fy) lands
  const nearestFoe = (x, y, side) => { let best = null, bd = Infinity; for (const o of alive(1 - side)) { const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } } return best; };
  // who a ship goes for: the nearest living enemy, a hurt one counting as nearer; it keeps its target unless
  // another is clearly better. An ELIMINATE order narrows the pool to those ships; an area order to what is in the area.
  const pickTarget = s => {
    const O = orders[s.side]; let pool = alive(1 - s.side);
    if (O.eliminate.size) { const e = pool.filter(o => O.eliminate.has(o.idx)); if (e.length) pool = e; else O.eliminate.clear(); }
    else if (O.area && O.area.kind !== 'avoid') { const e = pool.filter(o => Math.hypot(o.x - O.area.x, o.y - O.area.y) <= O.area.r + 60); if (e.length) pool = e; }
    const score = o => dist(s, o) * (0.5 + 0.5 * Math.max(0, o.hp) / o.hpMax);
    let best = null, bs = Infinity; for (const o of pool) { const v = score(o); if (v < bs) { bs = v; best = o; } }
    return s.tgt && !s.tgt.dead && pool.includes(s.tgt) && score(s.tgt) <= bs * 1.4 ? s.tgt : best;
  };
  const toRim = (s, a, keepInside) => { const dx = s.x - a.x, dy = s.y - a.y, d = Math.hypot(dx, dy) || 1; if (keepInside ? d > a.r : d < a.r) { s.x = a.x + dx / d * a.r; s.y = a.y + dy / d * a.r; } };
  const step = () => {
    if (done) return;
    // the fabricator aboard, while its stock lasts: missiles to the emptiest launcher, spent (or shot-down) drones built back into the bays
    for (const s of ships) {
      if (s.dead) continue;
      if (s.fab > 0 && s.stock >= s.missileCost) { s.pool += s.fab * B.dt; while (s.pool >= 1 && s.stock >= s.missileCost) { const g = s.guns.filter(x => Number.isFinite(x.ammo) && x.ammo < x.mag).sort((a, b) => a.ammo - b.ammo)[0]; if (!g) { s.pool = Math.min(s.pool, 1); break; } g.ammo++; s.pool--; s.stock -= s.missileCost; } }
      if (s.dfab > 0 && s.bays.length && s.stock >= s.droneCost) { s.dpool += s.dfab * B.dt; while (s.dpool >= 1 && s.stock >= s.droneCost) { const b = s.bays.find(x => x.spent > 0); if (!b) { s.dpool = Math.min(s.dpool, 1); break; } b.spent--; b.left++; s.dpool--; s.stock -= s.droneCost; } }
    }
    // ships pick a target and hold their range from it (a hurt ship more slowly) — unless an order says otherwise; drones launch toward it
    for (const s of ships) {
      if (s.dead) continue;
      const o = s.tgt = pickTarget(s); if (!o) continue;
      s.speed = s.speed0 * eff(s);
      const O = orders[s.side], A = O.area;
      const dodge = O.avoid.size ? alive(1 - s.side).filter(x => O.avoid.has(x.idx)).map(x => [x, dist(s, x)]).filter(([, d]) => d < AVOID).sort((p, q) => p[1] - q[1])[0] : null;
      if (O.retreat) { const foe = nearestFoe(s.x, s.y, s.side); go(s, foe.x, foe.y, 1e9, 1, 0); }                                     // away from the nearest enemy, flat out
      else if (dodge) go(s, dodge[0].x, dodge[0].y, 1e9, 1, 0);                                                                            // keep away from that one
      else if (A && A.kind === 'attack' && Math.hypot(o.x - A.x, o.y - A.y) > A.r + 60) go(s, A.x, A.y, 0, 60, 0);                       // nobody in the area yet: go there
      else if (A && A.kind === 'protect' && Math.hypot(s.x - A.x, s.y - A.y) > A.r) go(s, A.x, A.y, A.r * 0.5, 60, 0);                    // get back inside
      else go(s, o.x, o.y, s.pref * 0.8, Math.max(B.minGap / 2, s.pref * 0.12), s.spin);                                                  // the nose follows the way it moves; the turrets do the aiming
      // launch only as many as the computer can run, and only if a drone could deliver at least one volley from here and get back
      const far = dist(s, o), worth = volleysFrom(Math.max(0, far - B.drone.range)) >= 1;
      for (const b of s.bays) { b.cd -= B.dt; if (b.cd <= 0 && b.left > 0 && worth && drones.filter(d => d.owner === s.idx).length < s.airCap) { b.left--; b.cd = B.drone.launchEvery / b.n; const D = B.drone, sz = b.size; drones.push({ id: nextId++, side: s.side, owner: s.idx, bay: b, x: s.x, y: s.y, age: 0, home: false, bat: D.battery, hpMax: D.hp * sz, hp: D.hp * sz, speed: D.speed / Math.pow(sz, 0.3), dmg: D.dmg * sz, rate: D.rate, range: D.range, acc: D.acc, evade: D.evade, cd: rng() * 1, spin: rng() < 0.5 ? 1 : -1 }); } }
    }
    // nobody sits on top of anybody: enemies keep B.minGap apart, wingmen B.wing
    for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
      const a = ships[i], b = ships[j]; if (a.dead || b.dead) continue;
      const gap = a.side === b.side ? B.wing : B.minGap, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d < gap) { const push = (gap - d) / 2, ux = dx / d, uy = dy / d; a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; }
    }
    // area orders hold after everything else has moved a ship: a protected circle keeps its ships in, an avoided one keeps them out
    for (const s of ships) { if (s.dead) continue; const A = orders[s.side].area; if (A && A.kind === 'protect') toRim(s, A, true); else if (A && A.kind === 'avoid') toRim(s, A, false); }
    for (const d of drones) {
      const D = B.drone, c = ships[d.owner], x0 = d.x, y0 = d.y, o = c.tgt && !c.tgt.dead ? c.tgt : nearestFoe(d.x, d.y, d.side);
      d.age += B.dt;
      const homeCost = dist(c, d) * D.travelCost;                                   // what getting back will drain
      if (!d.home && (!o || d.age > D.sortie || d.bat - D.shotCost < homeCost + 2)) d.home = true;   // nobody left, or no battery for another volley and the way back: go home
      if (d.home) { const dc = steer(d, c.x, c.y, 0, 30, 0); d.bat -= Math.hypot(d.x - x0, d.y - y0) * D.travelCost; if (dc <= D.dock || d.bat <= 0) { d.dead = true; d.bay.spent++; } continue; }   // docked (or dead in space): spent until a fabricator refurbishes it
      const dd = steer(d, o.x, o.y, d.range * 0.8, Math.max(20, d.range * 0.2), d.spin); d.cd -= B.dt;
      d.bat -= (dd > d.range ? Math.hypot(d.x - x0, d.y - y0) * D.travelCost : 0) + D.idleCost * B.dt;   // the leg OUT drains by distance (and the leg home, above); circling the target is hovering, idleCost only
      if (d.cd <= 0 && dd <= d.range) { d.cd = 1 / d.rate; d.bat -= D.shotCost; const hit = rng() < d.acc / 100 * (1 - o.evade); if (hit) { const r = strike(o, d.dmg, 'weapon_energy', rng); hits[d.side]++; dealt[d.side] += r.h; log(d.side, 'd', r.where === 'shield' ? 4 : 1, d.x, d.y, ...impact(o, d.x, d.y, r.where), undefined, undefined, o, d.id); } else log(d.side, 'd', 0, d.x, d.y, o.x, o.y, undefined, undefined, o, d.id); } }
    for (let k = drones.length - 1; k >= 0; k--) if (drones[k].dead) drones.splice(k, 1);
    for (const m of missiles) {
      if (!m.tgt || m.tgt.dead) m.tgt = nearestFoe(m.x, m.y, m.side);               // its ship is gone: the next one
      if (!m.tgt) { m.done = true; continue; }
      const o = m.tgt, dx = o.x - m.x, dy = o.y - m.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, reach = B.missile.speed * B.dt;
      // it flies all the way in: a shield covering the spot takes it at the shield's edge; otherwise it bursts on the hull; a miss flies past
      if (m.hit && o.sh > 0 && !m.shieldRolled && d <= o.shieldR + reach) {
        m.shieldRolled = true;
        if (rng() < o.cover) { const r = strike(o, m.dmg, 'weapon_missile', rng, true); m.done = true; hits[m.side]++; dealt[m.side] += r.h; log(m.side, 'm', 4, m.x, m.y, ...impact(o, m.x, m.y, 'shield'), undefined, undefined, o, m.id); continue; }
      }
      if (d <= o.hullR + reach) {
        m.done = true;
        if (m.hit) { const r = strike(o, m.dmg, 'weapon_missile', rng, false); hits[m.side]++; dealt[m.side] += r.h; log(m.side, 'm', 1, m.x, m.y, ...impact(o, m.x, m.y, 'hull'), undefined, undefined, o, m.id); }
        else log(m.side, 'm', 0, m.x, m.y, o.x, o.y, undefined, undefined, o, m.id);
        continue;
      }
      m.age += B.dt; const wobble = Math.sin(m.age * B.missile.twist + m.phase) * B.missile.spiral * Math.min(1, d / 400) * m.wob;   // the corkscrew fades as it closes in
      m.x += (ux * B.missile.speed + -uy * wobble) * B.dt; m.y += (uy * B.missile.speed + ux * wobble) * B.dt;
      if (m.age > B.missile.life) m.done = true;
    }
    for (let k = missiles.length - 1; k >= 0; k--) if (missiles[k].done) missiles.splice(k, 1);
    // the guns: point defence turns on what is coming in; the rest shoot a ship in reach (their own target first), or drones when none is
    for (const s of ships) {
      if (s.dead) continue;
      const foes = alive(1 - s.side);
      for (let gi = 0; gi < s.guns.length; gi++) {
        const g = s.guns[gi];
        g.cd -= B.dt;
        // between shots a turret keeps slewing onto the ship's target — a light mount fast, a heavy one slowly
        if (g.trav && g.cd > 0 && s.tgt && !s.tgt.dead) { const [gx0, gy0] = gunAt(s, g); slew(g, Math.atan2(s.tgt.y - gy0, s.tgt.x - gx0)); }
        if (g.cd > 0 || g.ammo < 1) continue;
        const near = list => list.filter(e => e.side !== s.side).map(e => [e, dist(e, s)]).filter(([, d]) => d <= Math.max(g.range, PD.reach)).sort((a, b) => a[1] - b[1])[0];
        const missile = g.kind === 'weapon_missile', beam = g.kind === 'weapon_energy';
        const inReach = o => { const d = dist(s, o); return d <= g.range && !(missile && d < PD.missileMin); };
        let o = s.tgt && !s.tgt.dead && inReach(s.tgt) ? s.tgt : null;
        if (!o) { let bd = Infinity; for (const f of foes) if (inReach(f)) { const d = dist(s, f); if (d < bd) { bd = d; o = f; } } }
        // who gets this shot: point defence takes what is coming in first; a gun with a ship in reach shoots the ship;
        // an idle kinetic gun or beam swats drones and missiles (beams well, guns poorly); launchers only ever fire at ships
        let tgt = null, pdk = 1;
        if (g.role === 'pd') tgt = near(missiles)?.[0] || near(drones)?.[0] || o;
        else if (o) tgt = o;
        else if (!missile) { tgt = near(drones)?.[0] || near(missiles)?.[0]; pdk = beam ? PD.beamIdle : PD.gunIdle; }
        if (!tgt) continue;
        const [gx, gy] = gunAt(s, g), kch = g.kind.slice(7, 8);                 // the shot leaves the hard point
        // a turret must be LAID on its target before it fires: it slews there at its rate, and a target crossing
        // faster than the mount can turn is never caught — a capital gun cannot follow a corvette round the hull
        if (g.trav) { const want = Math.atan2(tgt.y - gy, tgt.x - gx); slew(g, want); if (Math.abs(norm(want - g.aim)) > TURRET.tol * Math.PI / 180) continue; }
        g.cd = 1 / Math.max(g.rate * eff(s), 0.01); if (Number.isFinite(g.ammo)) g.ammo--;      // a battered ship fires slower
        if (tgt === o) {
          if (missile) { missiles.push({ id: nextId++, side: s.side, tgt: o, x: gx, y: gy, age: 0, phase: rng() * 6.28, wob: rng() < 0.5 ? 1 : -1, dmg: g.dmg, hit: rng() < g.acc / 100 * (1 - Math.min(0.9, o.evade * (DODGE[g.kind] || 1))) }); continue; }
          const hit = rng() < g.acc / 100 * (1 - o.evade);
          if (hit) { const r = strike(o, g.dmg, g.kind, rng); hits[s.side]++; dealt[s.side] += r.h; log(s.side, kch, r.where === 'shield' ? 4 : 1, gx, gy, ...impact(o, gx, gy, r.where), s.idx, gi, o); }
          else log(s.side, kch, 0, gx, gy, o.x, o.y, s.idx, gi, o);
        } else if (tgt.bat === undefined) {                                  // a missile (a drone carries a battery; both carry an age — telling them apart by age had let every drone off the hook)
          const hit = rng() < g.acc / 100 * PD.vsMissile * pdk; log(s.side, kch, hit ? 2 : 0, gx, gy, tgt.x, tgt.y, s.idx, gi, tgt); if (hit) { tgt.done = true; shot[s.side]++; }
        } else {                                                              // a drone; shot down = one more for the fabricator to build back
          const hit = rng() < g.acc / 100 * (1 - tgt.evade) * PD.vsDrone * pdk; log(s.side, kch, hit ? 3 : 0, gx, gy, tgt.x, tgt.y, s.idx, gi, tgt); if (hit) { tgt.hp -= g.dmg * (beam ? PD.beamVsDrone : 1); if (tgt.hp <= 0) { shot[s.side]++; tgt.bay.spent++; } }
        }
      }
    }
    for (let k = missiles.length - 1; k >= 0; k--) if (missiles[k].done) missiles.splice(k, 1);
    for (let k = drones.length - 1; k >= 0; k--) if (drones[k].hp <= 0) drones.splice(k, 1);
    for (const s of ships) if (!s.dead && s.hp <= 0) { s.dead = true; s.hp = 0; }
    // shields recover; armour knits itself (hull regeneration tech); a fabricator patches the hull, up to a point
    for (const s of ships) {
      if (s.dead) continue;
      s.sh = Math.min(s.shMax, s.sh + s.rec * B.dt);
      if (s.arMax) s.ar = Math.min(s.arMax, s.ar + s.repair * B.dt);
      if (s.hp > 0 && s.hp < s.hpMax && s.hullRepair > 0 && s.repaired < s.hpMax * HULL.fabRepairCap) { const r = Math.min(s.hullRepair * B.dt, s.hpMax - s.hp, s.hpMax * HULL.fabRepairCap - s.repaired); s.hp += r; s.repaired += r; }
    }
    time += B.dt;
    if (time >= nextRec - 1e-9) { frame(); shots = []; nextRec += record; }
    if (!alive(0).length || !alive(1).length) { if (shots.length) frame(); const a = alive(0).length, b = alive(1).length; winner = !a && !b ? null : !a ? 1 : 0; done = true; }
    else if (time >= B.maxTime - 1e-9) done = true;
  };
  // on points when the clock runs out: the healthier fleet (hull left over the whole fleet), then whoever dealt more; a draw only when nobody hurt anybody
  const result = () => {
    let w = winner;
    if (w === null && time >= B.maxTime - 1e-9) { const ha = fleetHull(0), hb = fleetHull(1); w = ha > hb + 0.02 ? 0 : hb > ha + 0.02 ? 1 : dealt[0] > dealt[1] ? 0 : dealt[1] > dealt[0] ? 1 : null; }
    return { winner: w, time: Math.round(time), timedOut: time >= B.maxTime - 1e-9, left: [fleetHull(0), fleetHull(1)], hits, dealt, shot, frames, sides: ships.map(s => s.side), n: [FA.length, FB.length], orders: given };
  };
  // an order to one side; ships are named by their index in `ships` (the replay's order)
  const order = (side, cmd) => {
    const O = orders[side];
    if (cmd.type === 'clear') { O.eliminate.clear(); O.avoid.clear(); O.area = null; O.retreat = false; }
    else if (cmd.type === 'retreat') { O.retreat = !O.retreat; if (O.retreat) O.area = null; }
    else if (cmd.type === 'eliminate' || cmd.type === 'avoid') { const set = O[cmd.type], other = O[cmd.type === 'eliminate' ? 'avoid' : 'eliminate']; for (const i of cmd.ships || []) { if (ships[i] && ships[i].side === side) continue; if (set.has(i)) set.delete(i); else { set.add(i); other.delete(i); } } O.retreat = false; }
    else if (cmd.type === 'area') { O.area = { kind: cmd.kind || 'protect', x: cmd.x, y: cmd.y, r: cmd.r || 300 }; O.retreat = false; }
    given.push({ t: Math.round(time * 100) / 100, side, ...cmd, ships: cmd.ships ? [...cmd.ships] : undefined });
  };
  return { step, result, order, orders, frames, ships, get done() { return done; }, get time() { return time; } };
}
export function simulate(a0, b0, rng = rng32(1)) { const bt = createBattle(a0, b0, rng); while (!bt.done) bt.step(); return bt.result(); }

// ---------------------------------------------------------------------------
// Random ships for a given price
// ---------------------------------------------------------------------------
const WEAPONS = ['weapon_energy', 'weapon_kinetic', 'weapon_missile', 'hangar'];
const uid = () => 'm' + Math.random().toString(36).slice(2, 9);
export function randomDesign(S, rng, budget, name, caps = allCapsules(S), { pure = false } = {}) {
  const pick = arr => arr[Math.floor(rng() * arr.length)], ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const dial = () => pick([0.5, 1, 1, 1, 1, 1.5, 2, 3]);
  const d = { id: uid(), name, hull: pick(starshipHulls()).id, modules: [
    { id: uid(), kind: 'stardrive', caps: [], n: 1, k: 1 }, { id: uid(), kind: 'reactor', caps: [], n: 1, k: 1 }, { id: uid(), kind: 'weapon_system', caps: [], n: 1, k: 1 }] };
  // one, two or three kinds of weapon — mixed loadouts are the common case; `pure` = one kind only
  const r = rng(), kinds = WEAPONS.slice().sort(() => rng() - 0.5).slice(0, pure || r < 0.3 ? 1 : r < 0.75 ? 2 : 3);
  for (const kind of kinds) {
    if (kind === 'hangar') { d.modules.push({ id: uid(), kind, caps: [], n: ri(1, 2), cnt: dial(), sz: pick([0.5, 1, 1, 1.5, 2]) }); continue; }
    const m = { id: uid(), kind, caps: [], n: ri(1, 4), dmg: dial(), rof: dial(), rng: dial(), ...(KINDS[kind].charges ? { chg: dial() } : {}) };
    // a role for the gun: most are plain, beams make the natural point defence
    const p = rng(), preset = p < (kind === 'weapon_energy' ? 0.3 : 0.12) ? 'pd' : p < 0.5 ? 'standard' : pick(['sniper', 'capital', 'antishield', 'antiarmor', 'standard']);
    if (preset !== 'standard' && kind !== 'weapon_missile' || preset === 'standard') applyPreset(m, preset); else applyPreset(m, 'standard');
    d.modules.push(m);
  }
  if ((kinds.includes('weapon_missile') || kinds.includes('hangar')) && rng() < 0.5) d.modules.push({ id: uid(), kind: 'works', caps: [], n: 1 });     // a fabricator to reload and rebuild
  if (rng() < 0.5) d.modules.push({ id: uid(), kind: 'shield', caps: [], n: ri(1, 2) });        // half the ships carry shields (auto-fit grows them to cover the hull); until 2026-10-07 no random ship had any
  if (rng() < 0.35) d.modules.push({ id: uid(), kind: 'thruster', caps: [], n: ri(1, 3) });     // a third are built quick
  return trimToBudget(S, d, budget, rng, caps);
}
// bring a design to the price. Under it: more guns (or drones) and armour — a big budget buys guns and
// bigger guns, not fifty layers of armour (capped at 12; after that the dials go up, then shields).
// Over it: armour comes off first, then guns shrink. Steps scale with how far off the price is, so a
// 4000 ship settles as fast as a 600 one (it used to crawl 20 rounds adding one layer at a time, fail,
// and be rolled again — hundreds of times — which is what froze the lab above ~1500).
// `grow` = false keeps the guns as asked and pads with armour, then shields.
const DIALS = [0.5, 1, 1.5, 2, 3, 4];
export function trimToBudget(S, d, budget, rng, caps = allCapsules(S), grow = true) {
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const maxGuns = Math.max(4, Math.ceil(budget / 150)), maxArmor = 12;
  const canDial = m => !KINDS[m.kind].hangar && ['dmg', 'rof', 'rng'].some(k => (m[k] ?? 1) < 4);
  let cost = 0;
  for (let i = 0; i < 40; i++) {
    autoFit(S, d, caps);
    cost = designStats(S, d, caps).t.cost; const off = (cost - budget) / budget;
    if (Math.abs(off) < 0.06) return d;
    const armor = d.modules.find(m => m.kind === 'armor'), w = d.modules.filter(m => KINDS[m.kind].mount);
    if (off < 0) {
      const short = budget - cost, layers = Math.max(1, Math.min(6, Math.floor(short / 60)));      // a layer costs 25 and drags drive and reactor along
      const room = m => KINDS[m.kind].hangar ? (m.cnt || 1) < 4 || m.n < Math.max(1, maxGuns / 4) : m.n < maxGuns;
      const g = w.filter(room), m = g.length ? pick(g) : null, armorFull = !!armor && armor.n >= maxArmor;
      if (m && grow && (armorFull || rng() < 0.4)) {
        if (KINDS[m.kind].hangar) { if ((m.cnt || 1) < 4) m.cnt = Math.min(4, (m.cnt || 1) + 0.5); else m.n++; }
        else m.n = Math.min(maxGuns, m.n + Math.max(1, Math.min(4, Math.floor(short / 200))));
      }
      else if (!armorFull) { if (armor) armor.n = Math.min(maxArmor, armor.n + layers); else d.modules.push({ id: uid(), kind: 'armor', caps: [], n: Math.min(maxArmor, layers) }); }
      else if (grow && w.some(canDial)) { const x = pick(w.filter(canDial)), k = pick(['dmg', 'rof', 'rng'].filter(k => (x[k] ?? 1) < 4)); x[k] = DIALS[DIALS.indexOf(x[k] ?? 1) + 1] || 4; delete x.preset; }   // guns and armour full: bigger guns
      else { const sh = d.modules.find(x => x.kind === 'shield'); if (sh) sh.n += Math.max(1, Math.min(4, Math.floor(short / 150))); else d.modules.push({ id: uid(), kind: 'shield', caps: [], n: 1 }); }   // the rest goes on shields
    }
    else if (armor && armor.n > 1) armor.n -= Math.max(1, Math.min(armor.n - 1, Math.ceil(armor.n * Math.min(0.8, off))));
    else if (armor) d.modules.splice(d.modules.indexOf(armor), 1);
    else {
      if (!w.length) return null;
      const m = pick(w);
      if (m.n > 1) m.n -= Math.max(1, Math.min(m.n - 1, Math.floor(m.n * Math.min(0.8, off)))); else if (KINDS[m.kind].hangar) { if ((m.cnt || 1) > 0.5) m.cnt = Math.max(0.5, (m.cnt || 1) - 0.5); else if (w.length > 1) d.modules.splice(d.modules.indexOf(m), 1); else return null; }
      else if ((m.dmg || 1) > 0.5) m.dmg = Math.max(0.5, (m.dmg || 1) - 0.5); else if ((m.rng || 1) > 0.5) m.rng = Math.max(0.5, (m.rng || 1) - 0.5); else if (w.length > 1) d.modules.splice(d.modules.indexOf(m), 1); else return null;
    }
  }
  cost = designStats(S, d, caps).t.cost;
  if (Math.abs(cost - budget) / budget < 0.12) return d;
  if (cost < budget) { d.underSpent = true; return d; }        // everything maxed and the money still not spent: it sails as it is rather than being rolled for ever
  return null;
}

// A ship from CHIPS, the builder's tray: weapon stacks ({ kind, h, role }) — one chip is two guns, a
// drone chip is four drones, stacking (h) is emphasis — and trait stacks (armour, shield, fast, fab).
export function designFromChips(S, stacks, budget, rng = rng32(1), caps = allCapsules(S)) {
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const d = { id: uid(), name: '', hull: pick(starshipHulls()).id, modules: [
    { id: uid(), kind: 'stardrive', caps: [], n: 1, k: 1 }, { id: uid(), kind: 'reactor', caps: [], n: 1, k: 1 }, { id: uid(), kind: 'weapon_system', caps: [], n: 1, k: 1 }] };
  const names = [];
  for (const s of stacks) {
    const h = Math.max(1, s.h || 1);
    if (s.kind === 'hangar') { d.modules.push({ id: uid(), kind: 'hangar', caps: [], n: 1, cnt: Math.min(4, h), sz: 1 }); names.push(`Drones${h > 1 ? ' ×' + h : ''}`); }
    else if (KINDS[s.kind]?.mount) { const m = { id: uid(), kind: s.kind, caps: [], n: 2 * h }; applyPreset(m, s.role && PRESETS[s.role] ? s.role : 'standard'); d.modules.push(m); names.push(`${NAMES[s.kind]}${h > 1 ? ' ×' + h : ''}${s.role && s.role !== 'standard' ? ' ' + PRESETS[s.role].name.toLowerCase() : ''}`); }
    else if (s.kind === 'armor') { d.modules.push({ id: uid(), kind: 'armor', caps: [], n: 4 * h }); names.push(`armour${h > 1 ? ' ×' + h : ''}`); }
    else if (s.kind === 'shield') { d.modules.push({ id: uid(), kind: 'shield', caps: [], n: 2 * h }); names.push(`shields${h > 1 ? ' ×' + h : ''}`); }
    else if (s.kind === 'fast') { d.modules.push({ id: uid(), kind: 'thruster', caps: [], n: 2 * h }); names.push(`fast${h > 1 ? ' ×' + h : ''}`); }
    else if (s.kind === 'fab') { d.modules.push({ id: uid(), kind: 'works', caps: [], n: h }); names.push(`fabricator${h > 1 ? ' ×' + h : ''}`); }
  }
  if (!d.modules.some(m => KINDS[m.kind].mount)) return null;
  d.name = names.join(' + ');
  return trimToBudget(S, d, budget, rng, caps, false) || d;
}

// A ship from words: "2 beams sniper + missiles + drones + armoured + fabricator". Each part names a
// weapon (beam / gun / missile / drone), an optional count and preset; the rest are traits.
const WORDS = {
  beam: 'weapon_energy', beams: 'weapon_energy', laser: 'weapon_energy', lasers: 'weapon_energy', energy: 'weapon_energy',
  gun: 'weapon_kinetic', guns: 'weapon_kinetic', kinetic: 'weapon_kinetic', kinetics: 'weapon_kinetic', cannon: 'weapon_kinetic', rail: 'weapon_kinetic', railgun: 'weapon_kinetic',
  missile: 'weapon_missile', missiles: 'weapon_missile', rocket: 'weapon_missile', rockets: 'weapon_missile', torpedo: 'weapon_missile',
  drone: 'hangar', drones: 'hangar', hangar: 'hangar', fighter: 'hangar', fighters: 'hangar', carrier: 'hangar',
};
const PRESET_WORDS = { sniper: 'sniper', capital: 'capital', pd: 'pd', 'point': 'pd', defence: 'pd', defense: 'pd', antishield: 'antishield', 'anti-shield': 'antishield', antiarmor: 'antiarmor', antiarmour: 'antiarmor', 'anti-armour': 'antiarmor', 'anti-armor': 'antiarmor' };
export function designFromWords(S, text, budget, rng = rng32(1), caps = allCapsules(S)) {
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const d = { id: uid(), name: text.trim().slice(0, 40), hull: pick(starshipHulls()).id, modules: [
    { id: uid(), kind: 'stardrive', caps: [], n: 1, k: 1 }, { id: uid(), kind: 'reactor', caps: [], n: 1, k: 1 }, { id: uid(), kind: 'weapon_system', caps: [], n: 1, k: 1 }] };
  const traits = [];
  for (const part of text.toLowerCase().split(/[+,;/]| and | with /).map(s => s.trim()).filter(Boolean)) {
    const words = part.split(/\s+/), kind = WORDS[words.find(w => WORDS[w])], count = +(words.find(w => /^\d+$/.test(w)) || 0), preset = PRESET_WORDS[words.find(w => PRESET_WORDS[w])] || (words.includes('anti') && words.includes('shield') ? 'antishield' : words.includes('anti') && words.includes('armour') ? 'antiarmor' : null);
    if (kind === 'hangar') { d.modules.push({ id: uid(), kind, caps: [], n: 1, cnt: count ? Math.min(4, Math.max(0.5, count / 4)) : 1, sz: words.some(w => /big|heavy|large/.test(w)) ? 2 : words.some(w => /small|light/.test(w)) ? 0.5 : 1 }); continue; }
    if (kind) { const m = { id: uid(), kind, caps: [], n: count || 2 }; applyPreset(m, preset || 'standard'); d.modules.push(m); continue; }
    traits.push(part);
  }
  const has = re => traits.some(t => re.test(t)), num = re => { const t = traits.find(x => re.test(x)), m = t && t.match(/\d+/); return m ? Math.max(1, Math.min(40, +m[0])) : 0; };   // "8 armoured", "6 fast", "2 fabricator": a number is the count of modules
  if (has(/armou?r/)) d.modules.push({ id: uid(), kind: 'armor', caps: [], n: num(/armou?r/) || (has(/heav|thick/) ? 8 : 4) });
  if (has(/shield/)) d.modules.push({ id: uid(), kind: 'shield', caps: [], n: num(/shield/) || (has(/heav|double|strong/) ? 3 : 2) });
  if (has(/fast|quick|agile|nimble/)) d.modules.push({ id: uid(), kind: 'thruster', caps: [], n: num(/fast|quick|agile|nimble/) || 3 });
  if (has(/fab|factory|works|reload/) || (d.modules.some(m => m.kind === 'hangar' || m.kind === 'weapon_missile') && has(/endless|sustain/))) d.modules.push({ id: uid(), kind: 'works', caps: [], n: num(/fab|factory|works|reload/) || 1 });
  if (!d.modules.some(m => KINDS[m.kind].mount)) return null;
  const pad = !has(/armou?r/);                                            // asked for armour: keep it as asked, pad with more only if needed
  return trimToBudget(S, d, budget, rng, caps, false) || d;
}

// what kind of ship it is, in words
export const MAINS = ['Beam', 'Gun', 'Missile', 'Drone'];
const NAMES = { weapon_energy: 'Beam', weapon_kinetic: 'Gun', weapon_missile: 'Missile', hangar: 'Drone' };
export function archetype(ship) {
  const byKind = {}; let wcost = 0;
  for (const m of ship.ds.mods) if (m.K.mount) { byKind[m.kind] = (byKind[m.kind] || 0) + m.cost * m.n; wcost += m.cost * m.n; }
  const sorted = Object.entries(byKind).sort((a, b) => b[1] - a[1]), main = sorted[0];
  const mix = sorted.filter(([, c]) => c >= wcost * 0.15).map(([k]) => NAMES[k]).join('+') || 'Unarmed';     // every kind that matters, main first
  const tags = [];
  const armorVol = ship.ds.mods.filter(m => m.kind === 'armor').reduce((a, m) => a + m.volume * m.n, 0) / ship.t.volume;
  if (armorVol > 0.3) tags.push('armoured');
  if (ship.shMax > ship.hpMax * 0.4) tags.push('shielded');
  if (ship.speed > 90) tags.push('fast');
  if (ship.pd) tags.push('PD ×' + ship.pd);
  if (ship.fab > 0) tags.push('fabricator');
  const roles = [...new Set(ship.design.modules.filter(m => KINDS[m.kind].mount && m.preset && m.preset !== 'standard' && m.preset !== 'pd').map(m => PRESETS[m.preset].name.toLowerCase()))];
  return { main: main ? NAMES[main[0]] : 'Unarmed', mix, tags, roles, label: mix + (roles.length ? ' (' + roles.join(', ') + ')' : '') + (tags.length ? ' · ' + tags.join(', ') : '') };
}

// ---------------------------------------------------------------------------
// The challenger: the best ship of one kind we can find at a price, then thrown at the field
// ---------------------------------------------------------------------------
const CH_ROLES = ['standard', 'standard', 'sniper', 'capital', 'antishield', 'antiarmor', 'pd'];
function candidateChips(kind, rng) {
  const pick = arr => arr[Math.floor(rng() * arr.length)], chips = [];
  if (kind === 'hangar') {
    chips.push({ kind: 'hangar', h: pick([1, 2, 3, 4]) });
    if (rng() < 0.5) chips.push({ kind: 'weapon_energy', h: 1, role: rng() < 0.7 ? 'pd' : 'standard' });
  } else {
    chips.push({ kind, h: pick([1, 2, 2, 3]), role: pick(CH_ROLES) });
    if (rng() < 0.4) chips.push({ kind, h: 1, role: pick(CH_ROLES) });
    if (rng() < 0.3) chips.push({ kind: 'weapon_energy', h: 1, role: 'pd' });
  }
  if (rng() < 0.5) chips.push({ kind: 'fab', h: 1 });
  const trait = pick([null, 'armor', 'armor', 'shield', 'fast']); if (trait) chips.push({ kind: trait, h: pick([1, 1, 2]) });
  return chips;
}
const scoreVs = (ship, pool, perOpp, rng) => { let w = 0, n = 0; for (const o of pool) for (let k = 0; k < perOpp; k++) { const r = simulate(ship, o, rng); n++; if (r.winner === 0) w++; else if (r.winner === null) w += 0.5; } return w / n; };
// The long jobs below are written as generators that yield a progress step after every ship built or
// fight fought. The plain exports drain them at once (tests, node); the *Async exports await whatever
// the progress callback returns, so a page can hand back a timeout and keep painting instead of freezing.
const drain = (it, onProgress) => { for (;;) { const r = it.next(); if (r.done) return r.value; onProgress?.(r.value); } };
const drainAsync = async (it, onProgress) => { for (;;) { const r = it.next(); if (r.done) return r.value; const p = onProgress?.(r.value); if (p && p.then) await p; } };
// search: a few dozen candidates against a shared field, the best three rechecked against a bigger one
function* bestShipSteps(S, kind, { budget = 600, seed = 1, candidates = 24 } = {}) {
  const rng = rng32(seed * 7 + 3), caps = allCapsules(S), names = { hangar: 'Drone ship', weapon_energy: 'Beam ship', weapon_kinetic: 'Gun ship', weapon_missile: 'Missile ship' };
  const field = []; for (let t = 0; field.length < 12 && t < 200; t++) { const d = randomDesign(S, rng, budget, 'f' + field.length, caps); if (d) { const s = shipFromDesign(S, d, caps); if (s.guns.length || s.hangars.length) { field.push(s); yield { phase: 'field', i: field.length, n: 12 }; } } }
  const tried = [];
  for (let i = 0; i < candidates; i++) {
    const d = designFromChips(S, candidateChips(kind, rng), budget, rng, caps); if (!d) continue;
    const s = shipFromDesign(S, d, caps); if (!s.guns.length && !s.hangars.length) continue;
    tried.push({ s, score: scoreVs(s, field, 2, rng) }); yield { phase: 'search', i: i + 1, n: candidates };
  }
  tried.sort((a, b) => b.score - a.score);
  const field2 = []; for (let t = 0; field2.length < 20 && t < 300; t++) { const d = randomDesign(S, rng, budget, 'g' + field2.length, caps); if (d) { const s = shipFromDesign(S, d, caps); if (s.guns.length || s.hangars.length) { field2.push(s); yield { phase: 'field2', i: field2.length, n: 20 }; } } }
  const finalists = []; for (const c of tried.slice(0, 3)) { finalists.push({ ...c, score2: scoreVs(c.s, field2, 2, rng) }); yield { phase: 'final', i: finalists.length, n: 3 }; }
  finalists.sort((a, b) => b.score2 - a.score2);
  const best = finalists[0]; if (!best) return null;
  best.s.name = names[kind] || 'Challenger'; best.s.design.name = best.s.name;
  return { ship: best.s, score: best.score2, tried: tried.length, finalists: finalists.map(f => ({ name: f.s.design.name, score: f.score2 })) };
}
export const bestShipOf = (S, kind, opts, onProgress) => drain(bestShipSteps(S, kind, opts), onProgress);
export const bestShipOfAsync = (S, kind, opts, onProgress) => drainAsync(bestShipSteps(S, kind, opts), onProgress);
// the challenge itself: the ship (or squadron) against so many fresh random fleets of `opp` ships, one fight each
function* challengeSteps(S, ship, { budget = 600, n = 40, seed = 1, opp = 1 } = {}) {
  const rng = rng32(seed * 13 + 5), caps = allCapsules(S), opps = [], fights = [], byKind = {};
  const mine = Array.isArray(ship) ? ship : ship.ships || [ship];
  for (let t = 0; opps.length < n && t < n * 20; t++) { const f = randomFleet(S, rng, budget, opp, (opp === 1 ? 'Random ' : 'Random fleet ') + (opps.length + 1), caps); if (f) { opps.push(f); yield { phase: 'build', i: opps.length, n }; } }
  for (let i = 0; i < opps.length; i++) { const o = opps[i], r = simulate(mine, o.ships, rng); fights.push({ opp: o, ...r }); const k = o.arch.main; byKind[k] = byKind[k] || { w: 0, n: 0 }; byKind[k].n++; if (r.winner === 0) byKind[k].w++; else if (r.winner === null) byKind[k].w += 0.5; yield { phase: 'fight', i: i + 1, n: opps.length }; }
  const wins = fights.filter(f => f.winner === 0).length, draws = fights.filter(f => f.winner === null).length;
  return { fights, opps, byKind, wins, draws, losses: fights.length - wins - draws };
}
export const challenge = (S, ship, opts, onProgress) => drain(challengeSteps(S, ship, opts), onProgress);
export const challengeAsync = (S, ship, opts, onProgress) => drainAsync(challengeSteps(S, ship, opts), onProgress);

// ---------------------------------------------------------------------------
// FLEETS — ships that fight as one side; a single ship is a fleet of one. The price is the FLEET's:
// n ships share it equally. A fleet's kind is the weapon its money went on most.
// ---------------------------------------------------------------------------
// The money is SPLIT between the ships one of four ways: even; flagship (one ship takes 40–60%, the
// rest share what is left); tiers (a ladder — many small, some middling, one or two big, ×2–3.5 a
// step); random. No ship is built under MIN_SHIP. A ship's CLASS follows its price, so a fleet reads
// as "1 cruiser Gun + 4 corvette Beam".
export const MIN_SHIP = 150;
export const SPLITS = ['even', 'flagship', 'tiers', 'random'];
export const SHIP_CLASS = [['corvette', 350], ['frigate', 800], ['destroyer', 1600], ['cruiser', 3200], ['capital', Infinity]];
export const classOf = cost => SHIP_CLASS.find(([, top]) => cost <= top)[0];
export function splitBudget(rng, budget, n, style = 'even') {
  if (n <= 1) return [budget];
  let w;
  if (style === 'flagship') { const big = 0.4 + rng() * 0.2; w = Array(n).fill((1 - big) / (n - 1)); w[0] = big; }
  else if (style === 'tiers') { const tiers = n >= 4 && rng() < 0.5 ? 3 : 2, r = 2 + rng() * 1.5, top = Math.max(1, Math.round(n * 0.15)), mid = tiers === 3 ? Math.max(1, Math.round(n * 0.3)) : 0; w = Array.from({ length: n }, (_, i) => i < top ? Math.pow(r, tiers - 1) : i < top + mid ? r : 1); }
  else if (style === 'random') w = Array.from({ length: n }, () => 0.2 + rng() * rng() * 2);
  else w = Array(n).fill(1);
  const total = w.reduce((a, b) => a + b, 0); let p = w.map(x => x / total * budget);
  for (let k = 0; k < 6; k++) {                                                   // nobody under MIN_SHIP: the floors are paid first, the rest shared as weighted
    const low = p.map(x => x < MIN_SHIP - 1e-9); if (!low.some(Boolean)) break;
    const rest = budget - low.filter(Boolean).length * MIN_SHIP, restW = p.reduce((a, x, i) => a + (low[i] ? 0 : x), 0);
    p = p.map((x, i) => low[i] ? MIN_SHIP : restW > 0 ? x / restW * rest : MIN_SHIP);
  }
  return p.map(x => Math.round(x)).sort((a, b) => b - a);                        // biggest first: 7a is the flagship
}
export function fleetOf(ships, name, split = 'even') {
  const cost = ships.reduce((a, s) => a + s.cost, 0), spend = {}, groups = {};
  for (const s of ships) { const k = s.arch.main, g = `${classOf(s.cost)} ${k}`; spend[k] = (spend[k] || 0) + s.cost; groups[g] = groups[g] || { n: 0, cost: 0 }; groups[g].n++; groups[g].cost += s.cost; }
  const main = Object.entries(spend).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unarmed';
  const comp = Object.entries(groups).sort((a, b) => b[1].cost / b[1].n - a[1].cost / a[1].n).map(([g, v]) => `${v.n} ${g}`).join(' + ');   // biggest ships first
  const top = Math.max(...ships.map(s => s.cost));
  return { name, ships, n: ships.length, cost, split, comp, flag: classOf(top), big: top / (cost || 1), arch: { main, label: ships.length === 1 ? ships[0].arch.label : comp, tags: [] } };
}
// n random ships sharing the budget by a split style (random unless asked); the ships of "Fleet 7" are 7a, 7b, 7c…
export function randomFleet(S, rng, budget, n, name, caps = allCapsules(S), { pure = false, split = null } = {}) {
  n = Math.min(n, Math.max(1, Math.floor(budget / MIN_SHIP)));
  const style = n === 1 ? 'even' : split || SPLITS[Math.floor(rng() * SPLITS.length)], prices = splitBudget(rng, budget, n, style), ships = [], num = (name.match(/\d+/) || [name])[0];
  for (let i = 0; i < n; i++) {
    let s = null;
    for (let tries = 0; !s && tries < 20; tries++) { const d = randomDesign(S, rng, prices[i], n === 1 ? name : `${num}${'abcdefghijklmnopqrstuvwxy'[i] || i + 1}`, caps, { pure }); if (!d) continue; const c = shipFromDesign(S, d, caps); if (!c.guns.length && !c.hangars.length) continue; c.arch = archetype(c); s = c; }
    if (!s) return null;
    ships.push(s);
  }
  return fleetOf(ships, name, style);
}
// What wins among fleets: by how the money was split, by the flagship's class, and by composition
// archetype (split · main weapon) — and for each archetype, the one that beats it most: its COUNTER.
// Food for the game's own admirals later: an enemy fleet that evolves against what you field.
export function trends(fleets, fights) {
  const byStyle = {}, byFlag = {}, comps = {}, vs = {}, key = f => `${f.split}·${f.arch.main}`;
  const add = (tbl, k, won) => { tbl[k] = tbl[k] || { w: 0, n: 0 }; tbl[k].n++; tbl[k].w += won; };
  for (const f of fights) {
    const A = fleets[f.a], Bf = fleets[f.b], wa = f.winner === 0 ? 1 : f.winner === null ? 0.5 : 0, wb = 1 - wa;
    add(byStyle, A.split, wa); add(byStyle, Bf.split, wb); add(byFlag, A.flag, wa); add(byFlag, Bf.flag, wb); add(comps, key(A), wa); add(comps, key(Bf), wb);
    if (key(A) !== key(Bf)) { add(vs[key(A)] = vs[key(A)] || {}, key(Bf), wa); add(vs[key(Bf)] = vs[key(Bf)] || {}, key(A), wb); }
  }
  const list = Object.entries(comps).map(([k, r]) => {
    const [split, main] = k.split('·'), foes = Object.entries(vs[k] || {}).filter(([, x]) => x.n >= 3).map(([ok, x]) => ({ key: ok, p: 1 - x.w / x.n, n: x.n })).sort((a, b) => b.p - a.p);
    return { key: k, split, main, ...r, p: r.n ? r.w / r.n : 0, counter: foes[0] && foes[0].p > 0.5 ? foes[0] : null };
  }).sort((a, b) => b.p - a.p);
  return { byStyle, byFlag, comps: list };
}

// a whole session of the lab: a pool of fleets at one price, then random pairings. `fleets` = [ships in
// a fleet-1 shape, ships in a fleet-2 shape]; when the shapes differ, half the pool is each and every
// fight is a fleet-1 shape against a fleet-2 shape — the question being which shape wins at the price.
function* labSteps(S, { budget = 600, battles = 60, seed = 1, pool = 24, pure = false, fleets: shape = [1, 1] } = {}) {
  const rng = rng32(seed), caps = allCapsules(S), fleets = [], [nA, nB] = shape, same = nA === nB;
  for (let tries = 0; fleets.length < pool && tries < pool * 20; tries++) {
    const k = same ? 0 : fleets.length % 2, n = k ? nB : nA;
    const f = randomFleet(S, rng, budget, n, (n === 1 ? 'Ship ' : 'Fleet ') + (fleets.length + 1), caps, { pure }); if (!f) continue;
    f.id = fleets.length; f.shape = k; fleets.push(f); yield { phase: 'build', i: fleets.length, n: pool };
  }
  const fights = [], of = k => fleets.filter(f => f.shape === k), pick = list => list[Math.floor(rng() * list.length)];
  for (let i = 0; i < battles && fleets.length > 1; i++) {
    let a, b;
    if (same) { a = Math.floor(rng() * fleets.length); b = Math.floor(rng() * (fleets.length - 1)); if (b >= a) b++; }
    else { const A = of(0), Bl = of(1); if (!A.length || !Bl.length) break; a = pick(A).id; b = pick(Bl).id; }
    const r = simulate(fleets[a].ships, fleets[b].ships, rng);
    fights.push({ a, b, ...r });
    yield { phase: 'fight', i: i + 1, n: battles };
  }
  for (const f of fleets) { f.w = 0; f.l = 0; f.d = 0; }
  for (const f of fights) { if (f.winner === 0) { fleets[f.a].w++; fleets[f.b].l++; } else if (f.winner === 1) { fleets[f.b].w++; fleets[f.a].l++; } else { fleets[f.a].d++; fleets[f.b].d++; } }
  const byShape = same ? null : [0, 1].map(k => ({ w: fights.filter(f => f.winner === k).length, n: fights.length }));
  return { fleets, fights, ...tally(fleets, fights), comp: trends(fleets, fights), budget, seed, fleetSizes: shape, byShape, underSpent: fleets.filter(f => f.ships.some(s => s.design.underSpent)).length };
}
export const runLab = (S, opts, onProgress) => drain(labSteps(S, opts), onProgress);
export const runLabAsync = (S, opts, onProgress) => drainAsync(labSteps(S, opts), onProgress);
// win rates by main weapon, and the matchup table
function tally(ships, fights) {
  const table = {}, rate = {};
  for (const m of MAINS) { table[m] = {}; for (const n of MAINS) table[m][n] = { w: 0, n: 0 }; rate[m] = { w: 0, n: 0 }; }
  for (const f of fights) {
    const A = ships[f.a].arch.main, Bm = ships[f.b].arch.main;
    if (!table[A] || !table[Bm]) continue;
    table[A][Bm].n++; table[Bm][A].n++; rate[A].n++; rate[Bm].n++;
    if (f.winner === 0) { table[A][Bm].w++; rate[A].w++; } else if (f.winner === 1) { table[Bm][A].w++; rate[Bm].w++; }
  }
  return { table, rate };
}

// ---------------------------------------------------------------------------
// GENERATIONS — four ships of each kind, every ship fights every other; the best of each kind breeds
// the next crop: itself kept as it is, two children of it, one child of the runner-up. Over a few
// generations the question is whether the same designs keep winning (it settles) or the crown keeps moving.
// ---------------------------------------------------------------------------
export const EVO = { perKind: 4 };
const KIND_OF = { Beam: 'weapon_energy', Gun: 'weapon_kinetic', Missile: 'weapon_missile', Drone: 'hangar' };
const DIAL = [0.5, 1, 1.5, 2, 3, 4];
const cloneDesign = d => { const c = JSON.parse(JSON.stringify(d)); c.id = uid(); for (const m of c.modules) m.id = uid(); return c; };
const shipOf = (S, d, caps) => { const s = shipFromDesign(S, d, caps); if (!s.guns.length && !s.hangars.length) return null; s.arch = archetype(s); return s; };
// a random ship whose main weapon is `kind`
function randomOfKind(S, rng, budget, kind, name, caps, pure) {
  for (let t = 0; t < 60; t++) { const d = randomDesign(S, rng, budget, name, caps, { pure }); const s = d && shipOf(S, d, caps); if (s && s.arch.main === kind) return s; }
  for (let t = 0; t < 20; t++) { const d = designFromChips(S, candidateChips(KIND_OF[kind], rng), budget, rng, caps); if (!d) continue; d.name = name; const s = shipOf(S, d, caps); if (s && s.arch.main === kind) return s; }
  return null;
}
// one or two small tweaks to a design, then back to the price
export function mutateDesign(S, parent, rng, budget, caps = allCapsules(S)) {
  const pick = arr => arr[Math.floor(rng() * arr.length)], d = cloneDesign(parent);
  const guns = () => d.modules.filter(m => KINDS[m.kind].mount), notch = (v, dir) => DIAL[Math.max(0, Math.min(DIAL.length - 1, Math.max(0, DIAL.indexOf(v ?? 1)) + dir))];
  const tweaks = 1 + Math.floor(rng() * 2);
  for (let c = 0; c < tweaks; c++) {
    const op = rng(), m = pick(guns());
    if (op < 0.35 && m) {                                                           /* a dial, one notch */
      if (KINDS[m.kind].hangar) { if (rng() < 0.5) m.cnt = Math.max(0.5, Math.min(4, (m.cnt || 1) + pick([-0.5, 0.5]))); else m.sz = pick([0.5, 1, 1.5, 2]); }
      else { const k = pick(KINDS[m.kind].charges ? ['dmg', 'rof', 'rng', 'chg'] : ['dmg', 'rof', 'rng']); m[k] = notch(m[k], pick([-1, 1])); delete m.preset; }
    } else if (op < 0.5 && m) {                                                     /* a role */
      if (!KINDS[m.kind].hangar) applyPreset(m, pick(Object.keys(PRESETS)));
    } else if (op < 0.65 && m) {                                                    /* a gun (or half a hangar) more or less */
      if (KINDS[m.kind].hangar) m.cnt = Math.max(0.5, Math.min(4, (m.cnt || 1) + pick([-0.5, 0.5]))); else m.n = Math.max(1, Math.min(6, m.n + pick([-1, 1])));
    } else if (op < 0.8) {                                                          /* armour / shields / thrusters / fabricator: more, less, on, off */
      const kind = pick(['armor', 'shield', 'thruster', 'works']), x = d.modules.find(y => y.kind === kind), step = kind === 'armor' ? 2 : 1;
      if (x && rng() < 0.5) { if (x.n > step) x.n -= step; else d.modules.splice(d.modules.indexOf(x), 1); }
      else if (x) x.n += step; else d.modules.push({ id: uid(), kind, caps: [], n: step });
    } else if (op < 0.9) {                                                          /* another silhouette */
      d.hull = pick(starshipHulls()).id;
    } else {                                                                        /* an escort gun kind comes aboard, or one leaves */
      const have = guns(), other = WEAPONS.filter(k => !have.some(x => x.kind === k));
      if (have.length > 1 && rng() < 0.5) { const x = pick(have); d.modules.splice(d.modules.indexOf(x), 1); }
      else if (other.length) { const kind = pick(other); if (kind === 'hangar') d.modules.push({ id: uid(), kind, caps: [], n: 1, cnt: 1, sz: 1 }); else { const x = { id: uid(), kind, caps: [], n: 1 }; applyPreset(x, kind === 'weapon_energy' && rng() < 0.6 ? 'pd' : 'standard'); d.modules.push(x); } }
    }
  }
  return trimToBudget(S, d, budget, rng, caps);
}
// a child of `parent` that is still a ship of the parent's kind
function breed(S, parent, rng, budget, caps, name) {
  for (let t = 0; t < 16; t++) { const d = mutateDesign(S, parent.design, rng, budget, caps); if (!d) continue; d.name = name; const s = shipOf(S, d, caps); if (s && s.arch.main === parent.arch.main) return s; }
  const d = cloneDesign(parent.design); d.name = name; return shipOf(S, d, caps);   // no viable tweak found: a twin
}
// `onProgress(gen, gens, fight, fights)` may return a promise — the lab hands back a timeout so the page can paint
export async function evolve(S, { budget = 600, generations = 5, seed = 1, perKind = EVO.perKind, pure = false } = {}, onProgress) {
  const rng = rng32(seed * 31 + 7), caps = allCapsules(S), gens = []; let serial = 0, crop = [];
  const name = () => 'Ship ' + (++serial);
  const fresh = (kind, g) => { const s = randomOfKind(S, rng, budget, kind, name(), caps, pure); if (s) { s.gen = g; s.born = 'random'; crop.push(s); } };
  for (const kind of MAINS) for (let i = 0; i < perKind; i++) fresh(kind, 1);
  for (let g = 1; g <= generations; g++) {
    crop.forEach((s, i) => { s.id = i; s.w = 0; s.l = 0; s.d = 0; s.hpSum = 0; });
    const fights = [], total = crop.length * (crop.length - 1) / 2;
    for (let i = 0; i < crop.length; i++) for (let j = i + 1; j < crop.length; j++) {
      const r = simulate(crop[i], crop[j], rng); fights.push({ a: i, b: j, ...r });
      if (r.winner === 0) { crop[i].w++; crop[j].l++; } else if (r.winner === 1) { crop[j].w++; crop[i].l++; } else { crop[i].d++; crop[j].d++; }
      crop[i].hpSum += r.left[0]; crop[j].hpSum += r.left[1];
      if (onProgress && (fights.length % 8 === 0 || fights.length === total)) { const p = onProgress(g, generations, fights.length, total); if (p && p.then) await p; }
    }
    const ranked = {}; for (const kind of MAINS) ranked[kind] = crop.filter(s => s.arch.main === kind).sort((a, b) => (b.w - a.w) || (a.l - b.l) || (b.hpSum - a.hpSum));
    gens.push({ n: g, ships: crop, fights, ...tally(crop, fights), champions: Object.fromEntries(MAINS.map(k => [k, ranked[k][0] || null])) });
    if (g === generations) break;
    crop = [];
    for (const kind of MAINS) {
      const [champ, second] = ranked[kind];
      if (!champ) { for (let i = 0; i < perKind; i++) fresh(kind, g + 1); continue; }
      const keep = shipOf(S, cloneDesign(champ.design), caps); keep.gen = g + 1; keep.born = 'held'; keep.parent = champ.name; keep.name = champ.name; crop.push(keep);
      for (const p of [champ, champ, second || champ].slice(0, perKind - 1)) { const kid = breed(S, p, rng, budget, caps, name()); kid.gen = g + 1; kid.born = 'child'; kid.parent = p.name; crop.push(kid); }
    }
  }
  return { gens, final: gens[gens.length - 1], budget, seed, generations, perKind };
}
