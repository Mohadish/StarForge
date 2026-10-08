// Broad upgrades: replace one researched part with a newer one EVERYWHERE it is used.
//  - every design using the old part switches at once (all future builds get the new part);
//  - built ships and structures are refitted either right now (3× cost) or gradually over N turns
//    (cost × (1 + 1/N)), a batch of units per turn, paid as each unit is done;
//  - the player can untick units to leave them as they are.
// If the new part has a different size, it is placed on the old part's centre, or on the nearest
// free spot that still touches the rest. The outline can change, so the armor bill can change too.
import { CATS } from '../data/categories.js';
import { assemblyStats, dims, canPlace, findSpot, occupancy, outline, touches } from './assembly.js';
import { lookupFor } from './blueprint.js';
import { fitsAt } from './colonymap.js';
import { uid } from '../util.js';

// A structure's new layout must still fit on the colony map where it stands.
const fitsMap = (S, inst, parts) => inst.kind !== 'structure' || !inst.map || fitsAt(S, parts, inst.map.ox, inst.map.oy, inst.id);

export const SALVAGE = 0.25;                            // share of the old part's cost you get back
export const refitMult = T => (T <= 0 ? 3 : 1 + 1 / T);  // speed premium: now = 3×, 5 turns = 1.2×

const uses = (a, id) => a.armor === id || a.parts.some(p => p.bp === id);
export const usersOf = (S, id) => ({ designs: S.designs.filter(d => uses(d, id)), instances: S.instances.filter(i => uses(i, id)) });

// Researched parts of the same kind as `toId` that are in use somewhere — the ones it can replace.
export function replaceable(S, toId) {
  const t = lookupFor(S)(toId); if (!t) return [];
  return S.blueprints.filter(b => b.id !== toId && b.cat === t.cat && b.researched && (S.designs.some(d => uses(d, b.id)) || S.instances.some(i => uses(i, b.id))));
}

export function swapParts(asm, fromId, toId, look) {
  const f = look(fromId), t = look(toId);
  const copy = () => asm.parts.map(p => ({ ...p }));
  if (!f || !t) return { parts: copy(), armor: asm.armor, moved: 0, failed: 0 };
  if (CATS[f.cat].perU) return { parts: copy(), armor: asm.armor === fromId ? toId : asm.armor, moved: 0, failed: 0 };
  const parts = asm.parts.filter(p => p.bp !== fromId).map(p => ({ ...p }));
  const fd = dims(f.cat, f.s.mass), td = dims(t.cat, t.s.mass);
  let moved = 0, failed = 0;
  for (const p of asm.parts.filter(p => p.bp === fromId)) {
    const cx = p.x + fd.w / 2, cy = p.y + fd.h / 2;
    const x = Math.round(cx - td.w / 2), y = Math.round(cy - td.h / 2);
    const occ = occupancy(parts, look);
    if (canPlace(parts, look, toId, x, y, occ) && (!occ.size || touches(occ, x, y, td))) { parts.push({ bp: toId, x, y }); continue; }
    const spot = findSpot(parts, look, toId, { x: cx, y: cy });
    if (spot) { parts.push({ bp: toId, x: spot.x, y: spot.y }); moved++; }
    else { parts.push({ ...p }); failed++; }
  }
  return { parts, armor: asm.armor, moved, failed };
}

export function refitCost(asm, fromId, toId, look) {
  const f = look(fromId), t = look(toId);
  if (CATS[f.cat].perU) { const per = outline(asm.parts, look).perimU; return Math.max(0, per * (t.s.cost - SALVAGE * f.s.cost)); }
  const n = asm.parts.filter(p => p.bp === fromId).length;
  let armorDelta = 0;
  const a = asm.armor && look(asm.armor);
  if (a) { const sw = swapParts(asm, fromId, toId, look); armorDelta = Math.max(0, (outline(sw.parts, look).perimU - outline(asm.parts, look).perimU) * a.s.cost); }
  return Math.max(0, n * (t.s.cost - SALVAGE * f.s.cost)) + armorDelta;
}

export function planRefit(S, fromId, toId, targetIds, T) {
  const L = lookupFor(S), u = usersOf(S, fromId);
  const rows = u.instances.map(i => {
    const sw = swapParts(i, fromId, toId, L), mapBlocked = !sw.failed && !fitsMap(S, i, sw.parts);
    return { inst: i, on: targetIds ? targetIds.includes(i.id) : true, cost: refitCost(i, fromId, toId, L), moved: sw.moved, failed: sw.failed || mapBlocked, mapBlocked,
      before: assemblyStats(i, L), after: assemblyStats({ ...i, parts: sw.parts, armor: sw.armor }, L) };
  });
  const chosen = rows.filter(r => r.on && !r.failed);
  const base = chosen.reduce((a, r) => a + r.cost, 0), mult = refitMult(T);
  return { from: fromId, to: toId, T, rows, chosen, designs: u.designs, base, mult, total: base * mult };
}

function apply(inst, from, to, L) { const sw = swapParts(inst, from, to, L); inst.parts = sw.parts; inst.armor = sw.armor; }

// Returns false when a rush order cannot be paid.
export function orderRefit(S, plan) {
  const L = lookupFor(S);
  if (plan.T <= 0 && S.credits < plan.total) return false;
  for (const d of plan.designs) { const sw = swapParts(d, plan.from, plan.to, L); d.parts = sw.parts; d.armor = sw.armor; }
  // buildings not finished yet switch for free, if the new layout still fits where they stand
  for (const q of S.production.queue) {
    if (!uses(q, plan.from)) continue;
    const sw = swapParts(q, plan.from, plan.to, L);
    if (!sw.failed && fitsAt(S, sw.parts, q.ox, q.oy, q.id)) { q.parts = sw.parts; q.armor = sw.armor; }
  }
  if (plan.T <= 0) {
    S.credits -= plan.total;
    for (const r of plan.chosen) apply(r.inst, plan.from, plan.to, L);
  } else if (plan.chosen.length) {
    S.refits.push({ id: uid('rf'), from: plan.from, to: plan.to, mult: plan.mult, T: plan.T, elapsed: 0,
      pending: plan.chosen.map(r => r.inst.id), costs: Object.fromEntries(plan.chosen.map(r => [r.inst.id, r.cost])), done: 0, total: plan.chosen.length });
  }
  return true;
}

// Called once per turn. Units are spread evenly so the last one lands on the last turn —
// the cheap slow schedule really is slow (units that wait for credits catch up later).
export function progressRefits(S, rep) {
  const L = lookupFor(S);
  for (const o of S.refits) {
    o.pending = o.pending.filter(id => { const i = S.instances.find(x => x.id === id); return i && uses(i, o.from); });
    o.total = o.done + o.pending.length;
    o.elapsed++;
    const target = o.elapsed >= o.T ? o.total : Math.floor(o.total * o.elapsed / o.T);
    let did = 0, short = false;
    while (o.done < target && o.pending.length) {
      const id = o.pending[0], inst = S.instances.find(x => x.id === id), price = o.costs[id] * o.mult;
      if (!fitsMap(S, inst, swapParts(inst, o.from, o.to, L).parts)) {
        o.pending.shift(); o.total--;
        rep.push({ text: `No room on the colony map to upgrade ${inst.name} — skipped.` });
        continue;
      }
      if (S.credits < price) { short = true; break; }
      S.credits -= price; apply(inst, o.from, o.to, L); o.pending.shift(); o.done++; did++;
    }
    const fn = L(o.from)?.name, tn = L(o.to)?.name;
    if (did) rep.push({ text: `Upgrade ${fn} → ${tn}: ${did} unit${did > 1 ? 's' : ''} refitted (${o.done}/${o.total}).` });
    if (short) rep.push({ text: `Upgrade ${fn} → ${tn} is waiting for credits.` });
    if (!o.pending.length) rep.push({ text: `Upgrade to ${tn} complete.` });
  }
  S.refits = S.refits.filter(o => o.pending.length);
}
