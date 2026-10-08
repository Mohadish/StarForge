// One turn of the colony. Structures on the planet share one power grid and one workforce:
// if either runs short, every structure runs at the same reduced percentage.
// Credits are money and raw material at once (for now).
// Building: construction orders are placed on the colony map during a turn; ending the turn
// starts (and locks) them; factories then build them in the order they were placed.
import { assemblyStats } from './assembly.js';
import { lookupFor } from './blueprint.js';
import { progressRefits, replaceable } from './refit.js';
import { LAND } from './colonymap.js';
import { uid, fmt } from '../util.js';

export const GROWTH_PER_FOOD = 0.25;  // M people per spare food per turn
export const STARVE_PER_FOOD = 0.5;   // M people lost per missing food per turn
export const OVERCROWD_LOSS = 0.5;    // M people leave per turn while above housing

export function planetStats(S) {
  const L = lookupFor(S);
  const t = { housing: 0, food: 0, credits: 0, production: 0, research: 0, jobs: 0, powerOut: 0, powerDraw: 0, cells: 0, structures: 0 };
  for (const i of S.instances) {
    if (i.kind !== 'structure') continue;
    const a = assemblyStats(i, L);
    t.structures++;
    for (const k of ['housing', 'food', 'credits', 'production', 'research', 'jobs', 'powerOut', 'cells']) t[k] += a[k];
    t.powerDraw += a.civDraw + a.shield.draw * 0.1;   // idle shields trickle
  }
  let plannedCells = 0;
  for (const q of S.production.queue) plannedCells += assemblyStats(q, L).cells;
  const pop = S.colony.pop;
  const workScale = t.jobs > 0 ? Math.min(1, pop / t.jobs) : 1;
  const powerScale = t.powerDraw > 0 ? Math.min(1, t.powerOut / t.powerDraw) : 1;
  const eff = workScale * powerScale;
  return {
    ...t, pop, workScale, powerScale, eff, plannedCells,
    foodOut: t.food * eff, eat: pop, creditsOut: t.credits * eff, prodOut: t.production * eff, rpOut: t.research * eff,
    idle: Math.max(0, pop - t.jobs), landFree: LAND - t.cells - plannedCells,
  };
}

export const designCost = (S, d) => assemblyStats(d, lookupFor(S)).cost;

export function endTurn(S) {
  const rep = [], turn = S.turn, ps = planetStats(S), pop0 = S.colony.pop, cr0 = S.credits;
  S.credits += ps.creditsOut;
  for (const q of S.production.queue) q.started = true;   // placements made this turn are now committed
  progressRefits(S, rep);
  runProduction(S, ps.prodOut, rep);
  runResearch(S, ps.rpOut, rep);

  const spare = ps.foodOut - ps.eat;
  let pop = pop0;
  if (spare < 0) {
    pop = Math.max(0, pop + spare * STARVE_PER_FOOD);
    rep.push({ text: `Famine: food for only ${fmt(ps.foodOut)} M of ${fmt(pop0)} M people — ${fmt(pop0 - pop)} M lost.` });
  } else if (pop > ps.housing) pop = Math.max(ps.housing, pop - OVERCROWD_LOSS);
  else pop = Math.min(ps.housing, pop + spare * GROWTH_PER_FOOD);
  S.colony.pop = pop;

  S.turn++;
  for (const r of rep) S.log.push({ turn, text: r.text, action: r.action || null });
  if (S.log.length > 300) S.log.splice(0, S.log.length - 300);
  return { turn, lines: rep, income: ps.creditsOut, dCredits: S.credits - cr0, dPop: pop - pop0 };
}

// Each order carries its own copy of the parts (what was placed is what gets built) and its map spot.
function runProduction(S, pp, rep) {
  const L = lookupFor(S), q = S.production.queue;
  while (q.length) {
    const item = q[0], a = assemblyStats(item, L);
    if (!a.parts) { q.shift(); continue; }
    const need = a.cost - item.progress;
    if (need > 1e-6) {
      const spend = Math.min(pp, need, S.credits);
      item.progress += spend; S.credits -= spend; pp -= spend;
      if (a.cost - item.progress > 1e-6) { if (pp > 1e-6) rep.push({ text: 'Construction paused — out of credits.' }); break; }
    } else if (need < 0) { S.credits -= need; item.progress = a.cost; }   // got cheaper after an upgrade: refund
    S.counters[item.designId] = (S.counters[item.designId] || 0) + 1;
    const name = `${item.name} #${S.counters[item.designId]}`;
    S.instances.push({ id: uid('i'), designId: item.designId, name, kind: 'structure', parts: item.parts, armor: item.armor, map: { ox: item.ox, oy: item.oy }, builtTurn: S.turn });
    rep.push({ text: `Built ${name}.` });
    q.shift();
  }
}

function runResearch(S, rp, rep) {
  const q = S.research.queue;
  while (rp > 1e-6 && q.length) {
    const b = S.blueprints.find(x => x.id === q[0]);
    if (!b) { q.shift(); continue; }
    const use = Math.min(rp, b.s.rp - b.progress);
    b.progress += use; rp -= use;
    if (b.progress >= b.s.rp - 1e-6) {
      b.researched = true; q.shift();
      const older = replaceable(S, b.id).length > 0;
      rep.push({ text: `Research done: ${b.name}.` + (older ? ' Older parts of this kind are in use — you can upgrade them.' : ''), action: older ? { type: 'refit', to: b.id } : null });
    }
  }
}
