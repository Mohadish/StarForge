// An assembly (ship or structure) IS its parts: [{ bp, x, y }] on the build grid, plus an optional armor
// that wraps the outline. All functions are pure; `look` turns a blueprint id into a blueprint.
import { CATS } from '../data/categories.js';
import { CELL_T, CELL_U, GW, GH, DRAG, TURN_K } from './physics.js';

export function dims(cat, mass) {
  const asp = CATS[cat].aspect || 1, n = Math.max(1, Math.round(mass / CELL_T));
  const w = Math.max(1, Math.round(Math.sqrt(n * asp)));
  return { w, h: Math.max(1, Math.round(n / w)) };
}
export function partDims(p, look) { const b = look(p.bp); return b ? dims(b.cat, b.s.mass) : { w: 1, h: 1 }; }

export function occupancy(parts, look) {
  const occ = new Map();
  parts.forEach((p, i) => {
    const d = partDims(p, look);
    for (let x = 0; x < d.w; x++) for (let y = 0; y < d.h; y++) occ.set((p.x + x) + ',' + (p.y + y), i);
  });
  return occ;
}

export function canPlace(parts, look, bpId, x, y, occ = occupancy(parts, look)) {
  const b = look(bpId);
  if (!b || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const d = dims(b.cat, b.s.mass);
  if (x < 0 || y < 0 || x + d.w > GW || y + d.h > GH) return false;
  for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) if (occ.has((x + i) + ',' + (y + j))) return false;
  return true;
}

export function touches(occ, x, y, d) {
  for (let i = 0; i < d.w; i++) if (occ.has((x + i) + ',' + (y - 1)) || occ.has((x + i) + ',' + (y + d.h))) return true;
  for (let j = 0; j < d.h; j++) if (occ.has((x - 1) + ',' + (y + j)) || occ.has((x + d.w) + ',' + (y + j))) return true;
  return false;
}

// Nearest free spot for bpId that touches the existing parts (distance measured centre to `near`).
export function findSpot(parts, look, bpId, near) {
  const b = look(bpId); if (!b) return null;
  const d = dims(b.cat, b.s.mass), occ = occupancy(parts, look);
  let best = null, bestD = Infinity;
  for (let x = 0; x + d.w <= GW; x++) for (let y = 0; y + d.h <= GH; y++) {
    const dist = Math.hypot(x + d.w / 2 - near.x, y + d.h / 2 - near.y);
    if (dist >= bestD || !canPlace(parts, look, bpId, x, y, occ)) continue;
    if (occ.size && !touches(occ, x, y, d)) continue;
    best = { x, y }; bestD = dist;
  }
  return best;
}

export function outline(parts, look) {
  const occ = occupancy(parts, look), edges = [];
  for (const k of occ.keys()) {
    const [x, y] = k.split(',').map(Number);
    if (!occ.has(x + ',' + (y - 1))) edges.push([x, y, x + 1, y, 0, -1]);
    if (!occ.has(x + ',' + (y + 1))) edges.push([x, y + 1, x + 1, y + 1, 0, 1]);
    if (!occ.has((x - 1) + ',' + y)) edges.push([x, y, x, y + 1, -1, 0]);
    if (!occ.has((x + 1) + ',' + y)) edges.push([x + 1, y, x + 1, y + 1, 1, 0]);
  }
  let connected = true;
  if (occ.size) {
    const keys = [...occ.keys()], seen = new Set([keys[0]]), q = [keys[0]];
    while (q.length) {
      const [x, y] = q.pop().split(',').map(Number);
      for (const n of [(x + 1) + ',' + y, (x - 1) + ',' + y, x + ',' + (y + 1), x + ',' + (y - 1)]) if (occ.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
    }
    connected = seen.size === occ.size;
  }
  return { edges, perimU: edges.length * CELL_U, cells: occ.size, connected };
}

// Parts in one row, centred in the grid, touching each other (used for the starting designs).
export function autoLayout(ids, look) {
  const ds = ids.map(id => { const b = look(id); return dims(b.cat, b.s.mass); });
  let x = Math.max(0, Math.floor((GW - ds.reduce((a, d) => a + d.w, 0)) / 2));
  const cy = Math.floor(GH / 2);
  return ids.map((id, i) => { const p = { bp: id, x, y: cy - Math.floor(ds[i].h / 2) }; x += ds[i].w; return p; });
}

// Everything an assembly is and does, summed from its parts.
export function assemblyStats(asm, look) {
  const o = outline(asm.parts, look);
  const t = {
    parts: 0, mass: 0, cost: 0, rp: 0, structHP: 0,
    powerOut: 0, buffer: 0, ramp: 0, engineDraw: 0, civDraw: 0, thrust: 0, turn: 0,
    weapons: [], shield: { cap: 0, regen: 0, delay: 99, draw: 0 },
    housing: 0, food: 0, credits: 0, production: 0, research: 0, jobs: 0,
    armorHP: 0, dr: 0, armorMass: 0, armorCost: 0,
    perimU: o.perimU, cells: o.cells, connected: o.connected, byCat: {}, used: new Set(),
  };
  for (const p of asm.parts) {
    const b = look(p.bp); if (!b) continue;
    const k = CATS[b.cat].contrib(b.v, b.s);
    t.parts++; t.mass += b.s.mass; t.cost += b.s.cost; t.structHP += b.s.mass; t.used.add(b.id);
    t.byCat[b.cat] = (t.byCat[b.cat] || 0) + 1;
    t.powerOut += k.powerOut || 0; t.buffer += k.buffer || 0; if (k.ramp) t.ramp = Math.max(t.ramp, k.ramp);
    t.engineDraw += k.engineDraw || 0; t.civDraw += k.civDraw || 0; t.thrust += k.thrust || 0; t.turn += k.turn || 0;
    if (k.weapon) t.weapons.push(k.weapon);
    if (k.shield) { t.shield.cap += k.shield.cap; t.shield.regen += k.shield.regen; t.shield.delay = Math.min(t.shield.delay, k.shield.delay); t.shield.draw += k.shield.draw; }
    for (const key of ['housing', 'food', 'credits', 'production', 'research', 'jobs']) t[key] += k[key] || 0;
  }
  const ab = asm.armor && look(asm.armor);
  if (ab && t.parts) { t.armorMass = ab.s.mass * o.perimU; t.armorCost = ab.s.cost * o.perimU; t.armorHP = ab.v.hp * o.perimU; t.dr = ab.v.dr; t.used.add(ab.id); }
  t.mass += t.armorMass; t.cost += t.armorCost;
  for (const id of t.used) t.rp += look(id).s.rp;
  t.accel = t.mass ? t.thrust / t.mass : 0; t.top = t.accel / DRAG; t.turnRate = t.mass ? t.turn / t.mass * TURN_K : 0;
  t.weaponDraw = t.weapons.reduce((a, w) => a + w.draw, 0);
  t.load = t.engineDraw + t.weaponDraw + t.shield.draw + t.civDraw;   // everything at once (battle)
  t.power = t.load ? t.powerOut / t.load : 1;
  t.dps = t.weapons.reduce((a, w) => a + w.dmg * w.rate, 0);
  t.maxRange = t.weapons.reduce((a, w) => Math.max(a, w.range), 0);
  t.totalHP = t.shield.cap + t.armorHP + t.structHP;
  t.civParts = Object.entries(t.byCat).reduce((a, [c, n]) => a + (CATS[c].group === 'civilian' ? n : 0), 0);
  return t;
}
