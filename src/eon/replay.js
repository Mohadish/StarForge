// A PLAYED GAME AS A LOG (his ask, 2026-10-16: "run a few game simulations … keep a log, I want to replay the actions"): every
// order a player — or the AI player in tools/play — gives is one ACTION, and a game is a seed plus the actions eon by eon.
// The same seed and the same actions give the same game (model.js draws every die from the state), so a log replays exactly.
// applyAction runs one order on a state; the AI player and the game's Replay bar both use it. No DOM.
import { sendFleet, giveAttention, settle, compute, setSplit, setDevFocus, planCell, queueAdd, queueCount, queueMove, queueDrop } from './model.js';

export const REPLAY_VERSION = 1;
// { type: 'split', place, split: [i, r, s] } · { type: 'design', design } (a whole design: replaces one with the same id) ·
// { type: 'build', place, design } · { type: 'buynow', place, index } (the queue's n-th item paid from the reserves) ·
// { type: 'send', design, n, from: sysId, to: sysId } (n resting ships of that design in `from` to the star of `to`) ·
// { type: 'focus', w } · { type: 'attention', field, d } · THE COLONY (2026-10-18, colony.js): { type: 'devfocus', place, w: [i, f, h, s] } (the
// development focus; an older log's x, y read as the rectangle) · { type: 'plan', place, cell, plan: [kinds] | null } · { type: 'build', place, design, n? } · { type: 'count',
// place, item, n } · { type: 'qmove', place, item, to } · { type: 'unq', place, item } (items by their index in the line, as `buynow`)
export function applyAction(S, a) {
  const place = id => S.places.find(p => p.id === id), starOf = sid => (S.systems.find(s => s.id === sid) || {}).star;
  const itemAt = (pid, i) => (place(pid)?.colony?.queue || [])[i]?.id;
  switch (a.type) {
    case 'split': return setSplit(S, a.place, a.split);
    case 'design': { const d = JSON.parse(JSON.stringify(a.design)); const i = S.designs.findIndex(x => x.id === d.id); if (i >= 0) S.designs[i] = d; else S.designs.push(d); return null; }
    case 'build': return queueAdd(S, a.place, a.design, a.n || 1);
    case 'devfocus': return setDevFocus(S, a.place, a.w || a.x, a.y);   // four weights (the tetrahedron) — or an older log's x, y
    case 'plan': return planCell(S, a.place, a.cell, a.plan);
    case 'count': return queueCount(S, a.place, itemAt(a.place, a.item), a.n);
    case 'qmove': return queueMove(S, a.place, itemAt(a.place, a.item), a.to);
    case 'unq': return queueDrop(S, a.place, itemAt(a.place, a.item));
    case 'buynow': {
      const pc = compute(S).colonies.find(x => x.pl.id === a.place), q = pc && pc.queue[a.index]; if (!q || q.gone || q.noDock) return 'nothing to buy';
      if ((S.reserves || 0) < q.need - 1e-6) return 'not enough in the reserves';
      S.reserves -= q.need; q.item.progress += q.need; return null;
    }
    case 'send': {
      const ships = S.ships.filter(u => !u.dest && u.design && u.design.id === a.design && place(u.at)?.sys === a.from).slice(0, a.n);
      if (!ships.length) return 'no such ships resting there';
      const to = a.toPlace || starOf(a.to); if (!to) return 'nowhere to go';
      return sendFleet(S, ships.map(u => u.id), to);
    }
    case 'sendmix': {                                // { type: 'sendmix', from: sysId, to: sysId, toPlace?, mix: [{ design, n }] }: ships of several designs leave as ONE fleet (one voyage, one arrival)
      const ships = [];
      for (const m of a.mix || []) ships.push(...S.ships.filter(u => !u.dest && u.design && u.design.id === m.design && place(u.at)?.sys === a.from && !ships.includes(u)).slice(0, m.n));
      if (!ships.length) return 'no such ships resting there';
      const to = a.toPlace || starOf(a.to); if (!to) return 'nowhere to go';
      return sendFleet(S, ships.map(u => u.id), to);
    }
    case 'settle': {                                 // { type: 'settle', design, place }: a resting ship of that design at that place founds the colony
      const u = S.ships.find(x => !x.dest && x.design && x.design.id === a.design && x.at === a.place); if (!u) return 'no such ship there';
      return settle(S, u.id);
    }
    case 'develop': case 'undevelop': case 'district': return null;           // the per-cell district designs of the morning of 2026-10-18: gone (the slots replaced them) — an older log's orders pass unheeded
    case 'focus': { S.focus = a.w.slice(); return null; }
    case 'attention': { giveAttention(S, a.field, a.d); return null; }
    default: return 'unknown action ' + a.type;
  }
}
// the actions of one eon, in order; what failed is returned (a replay should never fail — it would mean the game changed)
export function applyEon(S, actions, eon) { const bad = []; for (const a of actions) if (a.eon === eon) { const err = applyAction(S, a); if (err) bad.push({ a, err }); } return bad; }
